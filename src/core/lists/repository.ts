import type { PlatformId } from '../platform';
import { BUNDLED_LISTS } from './bundled';
import { dedupe, normalizeHandle, type ListFile } from './schema';
import {
  identitiesItem,
  listStateItem,
  userListsItem,
  type StoredListState,
  type StoredUserList,
} from './storage';
import { entryKey, type Entry, type List } from './types';

export class ListError extends Error {}

// Les écritures d'un même contexte (popup, background…) sont sérialisées
// pour éviter de perdre une modification entre lecture et écriture.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

function toList(stored: StoredUserList): List {
  return { ...stored, source: 'user', excluded: [] };
}

export async function getLists(): Promise<List[]> {
  const [state, userLists] = await Promise.all([
    listStateItem.getValue(),
    userListsItem.getValue(),
  ]);
  const bundled = BUNDLED_LISTS.map<List>((file) => {
    const added = state[file.id]?.added ?? [];
    return {
      ...file,
      entries: dedupe([...file.entries, ...added]),
      source: 'bundled',
      enabled: state[file.id]?.enabled ?? true,
      excluded: state[file.id]?.excluded ?? [],
      added: added.map(entryKey),
    };
  });
  return [...bundled, ...userLists.map(toList)];
}

export async function getIdentities(): Promise<Record<string, string>> {
  return identitiesItem.getValue();
}

function isBundled(listId: string): boolean {
  return BUNDLED_LISTS.some((l) => l.id === listId);
}

async function updateUserList(listId: string, update: (list: StoredUserList) => StoredUserList) {
  const lists = await userListsItem.getValue();
  const index = lists.findIndex((l) => l.id === listId);
  const list = lists[index];
  if (!list) throw new ListError(`Liste introuvable : ${listId}`);
  const next = [...lists];
  next[index] = update(list);
  await userListsItem.setValue(next);
}

async function updateState(listId: string, update: (state: StoredListState) => StoredListState) {
  const state = await listStateItem.getValue();
  const current = state[listId] ?? { enabled: true, excluded: [] };
  await listStateItem.setValue({ ...state, [listId]: update(current) });
}

export function setListEnabled(listId: string, enabled: boolean): Promise<void> {
  return serial(() =>
    isBundled(listId)
      ? updateState(listId, (s) => ({ ...s, enabled }))
      : updateUserList(listId, (l) => ({ ...l, enabled })),
  );
}

export function createList(name: string, description?: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) return Promise.reject(new ListError('Le nom de la liste est requis'));
  return serial(async () => {
    const id = `user-${crypto.randomUUID()}`;
    const list: StoredUserList = {
      id,
      name: trimmed,
      enabled: true,
      createdAt: new Date().toISOString(),
      entries: [],
      ...(description?.trim() && { description: description.trim() }),
    };
    await userListsItem.setValue([...(await userListsItem.getValue()), list]);
    return id;
  });
}

export function renameList(listId: string, name: string, description?: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return Promise.reject(new ListError('Le nom de la liste est requis'));
  return serial(() =>
    updateUserList(listId, ({ description: _, ...l }) => ({
      ...l,
      name: trimmed,
      ...(description?.trim() && { description: description.trim() }),
    })),
  );
}

export function deleteList(listId: string): Promise<void> {
  if (isBundled(listId)) {
    return Promise.reject(new ListError('Une liste par défaut ne peut pas être supprimée'));
  }
  return serial(async () => {
    const lists = await userListsItem.getValue();
    await userListsItem.setValue(lists.filter((l) => l.id !== listId));
  });
}

export interface EntryInput {
  platform: PlatformId;
  handle: string;
  userId?: string;
  note?: string;
}

export type AddResult = 'added' | 'duplicate';

function sameAccount(a: Entry, b: Entry): boolean {
  return (
    a.platform === b.platform && (a.handle === b.handle || (!!a.userId && a.userId === b.userId))
  );
}

/**
 * Ajout local à une liste par défaut : stocké à part, comme les exclusions.
 * Un compte d'origine exclu est simplement rétabli.
 */
async function addToBundled(listId: string, entry: Entry): Promise<AddResult> {
  const file = BUNDLED_LISTS.find((l) => l.id === listId);
  let result: AddResult = 'duplicate';
  await updateState(listId, (s) => {
    const original = file?.entries.find((e) => sameAccount(e, entry));
    if (original) {
      if (!s.excluded.includes(entryKey(original))) return s;
      result = 'added';
      return { ...s, excluded: s.excluded.filter((k) => k !== entryKey(original)) };
    }
    const added = s.added ?? [];
    if (added.some((e) => sameAccount(e, entry))) return s;
    result = 'added';
    return { ...s, added: [...added, entry] };
  });
  return result;
}

/** Ajoute un compte à une liste. Lève `ListError` si le handle est invalide. */
export function addEntry(listId: string, input: EntryInput): Promise<AddResult> {
  const handle = normalizeHandle(input.platform, input.handle);
  if (!handle) return Promise.reject(new ListError(`Handle invalide : ${input.handle}`));
  const entry: Entry = {
    platform: input.platform,
    handle,
    addedAt: new Date().toISOString(),
    ...(input.userId && { userId: input.userId }),
    ...(input.note?.trim() && { note: input.note.trim() }),
  };
  if (isBundled(listId)) return serial(() => addToBundled(listId, entry));
  return serial(async () => {
    let result: AddResult = 'added';
    await updateUserList(listId, (l) => {
      const entries = dedupe([...l.entries, entry]);
      if (entries.length === l.entries.length) result = 'duplicate';
      return { ...l, entries };
    });
    return result;
  });
}

/**
 * Importe une liste : dans une liste perso existante (`targetId`) ou dans une nouvelle.
 * Les entrées doivent déjà être validées (`parseImport`). Renvoie l'id de la liste et le
 * nombre de comptes ajoutés.
 */
export async function importList(
  file: ListFile,
  targetId?: string,
): Promise<{ listId: string; added: number }> {
  if (targetId && isBundled(targetId)) {
    throw new ListError('Une liste par défaut ne peut pas être modifiée');
  }
  const listId = targetId ?? (await createList(file.name, file.description));
  return serial(async () => {
    let added = 0;
    await updateUserList(listId, (l) => {
      const entries = dedupe([...l.entries, ...file.entries]);
      added = entries.length - l.entries.length;
      return { ...l, entries };
    });
    return { listId, added };
  });
}

/**
 * Retire un compte : suppression dans une liste perso ou d'un ajout local,
 * exclusion locale pour un compte d'origine d'une liste par défaut.
 */
export function removeEntry(listId: string, key: string): Promise<void> {
  return serial(() =>
    isBundled(listId)
      ? updateState(listId, (s) =>
          s.added?.some((e) => entryKey(e) === key)
            ? { ...s, added: s.added.filter((e) => entryKey(e) !== key) }
            : { ...s, excluded: s.excluded.includes(key) ? s.excluded : [...s.excluded, key] },
        )
      : updateUserList(listId, (l) => ({
          ...l,
          entries: l.entries.filter((e) => entryKey(e) !== key),
        })),
  );
}

/** Annule l'exclusion locale d'un compte d'une liste par défaut. */
export function restoreEntry(listId: string, key: string): Promise<void> {
  return serial(() =>
    updateState(listId, (s) => ({ ...s, excluded: s.excluded.filter((k) => k !== key) })),
  );
}

/**
 * Associe un handle à un userId observé sur la page.
 * - Le handle courant du userId est retenu, ce qui suit les changements de handle,
 *   y compris pour les listes par défaut.
 * - Les entrées perso qui n'avaient que ce handle reçoivent le userId.
 */
export function syncIdentity(platform: PlatformId, handle: string, userId: string): Promise<void> {
  const normalized = normalizeHandle(platform, handle);
  if (!normalized) return Promise.resolve();
  return serial(async () => {
    const identities = await identitiesItem.getValue();
    const key = `${platform}:${userId}`;
    if (identities[key] !== normalized) {
      await identitiesItem.setValue({ ...identities, [key]: normalized });
    }
    const lists = await userListsItem.getValue();
    let changed = false;
    const next = lists.map((l) => ({
      ...l,
      entries: l.entries.map((e) => {
        if (e.platform !== platform) return e;
        if (e.userId === userId && e.handle !== normalized) {
          changed = true;
          return { ...e, handle: normalized };
        }
        if (!e.userId && e.handle === normalized) {
          changed = true;
          return { ...e, userId };
        }
        return e;
      }),
    }));
    if (changed) await userListsItem.setValue(next);
  });
}

/** Appelle `callback` à chaque changement des listes, de leur état ou des identités. */
export function watchLists(callback: () => void): () => void {
  const unwatchers = [
    userListsItem.watch(callback),
    listStateItem.watch(callback),
    identitiesItem.watch(callback),
  ];
  return () => unwatchers.forEach((unwatch) => unwatch());
}
