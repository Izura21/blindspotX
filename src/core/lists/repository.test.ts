import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from 'wxt/utils/storage';
import {
  addEntry,
  createList,
  deleteList,
  getIdentities,
  getLists,
  ListError,
  removeEntry,
  renameList,
  restoreEntry,
  setListEnabled,
  syncIdentity,
  watchLists,
} from './repository';

vi.mock('./bundled', () => ({
  BUNDLED_LISTS: [
    {
      id: 'defaut',
      name: 'Défaut',
      version: 1,
      entries: [
        { platform: 'x', handle: 'cible', addedAt: '2026-10-28T00:00:00.000Z' },
        { platform: 'x', handle: 'autre', userId: '7', addedAt: '2026-10-28T00:00:00.000Z' },
      ],
    },
  ],
}));

async function list(id: string) {
  const found = (await getLists()).find((l) => l.id === id);
  if (!found) throw new Error(`liste ${id} absente`);
  return found;
}

beforeEach(() => {
  fakeBrowser.reset();
});

describe('listes par défaut', () => {
  it('sont présentes et activées à l’installation', async () => {
    expect(await list('defaut')).toMatchObject({ source: 'bundled', enabled: true, excluded: [] });
  });

  it('peuvent être désactivées', async () => {
    await setListEnabled('defaut', false);
    expect((await list('defaut')).enabled).toBe(false);
  });

  it('ne peuvent être ni renommées ni supprimées', async () => {
    await expect(deleteList('defaut')).rejects.toThrow(ListError);
  });

  it('acceptent des ajouts locaux, retirables', async () => {
    expect(await addEntry('defaut', { platform: 'x', handle: '@Nouveau' })).toBe('added');
    expect(await addEntry('defaut', { platform: 'x', handle: 'nouveau' })).toBe('duplicate');
    expect(await addEntry('defaut', { platform: 'x', handle: 'cible' })).toBe('duplicate');
    const current = await list('defaut');
    expect(current.entries.map((e) => e.handle)).toEqual(['cible', 'autre', 'nouveau']);
    expect(current.added).toEqual(['x:h:nouveau']);

    await removeEntry('defaut', 'x:h:nouveau');
    const after = await list('defaut');
    expect(after.entries.map((e) => e.handle)).toEqual(['cible', 'autre']);
    expect(after.excluded).toEqual([]);
  });

  it('rétablit un compte d’origine exclu quand on l’ajoute à nouveau', async () => {
    await removeEntry('defaut', 'x:h:cible');
    expect(await addEntry('defaut', { platform: 'x', handle: 'cible' })).toBe('added');
    expect((await list('defaut')).excluded).toEqual([]);
  });

  it('acceptent des exclusions locales, réversibles', async () => {
    await removeEntry('defaut', 'x:h:cible');
    await removeEntry('defaut', 'x:h:cible');
    expect((await list('defaut')).excluded).toEqual(['x:h:cible']);
    await restoreEntry('defaut', 'x:h:cible');
    expect((await list('defaut')).excluded).toEqual([]);
  });
});

describe('listes perso', () => {
  it('cycle de vie complet', async () => {
    const id = await createList('  Perso ', 'desc');
    expect(await list(id)).toMatchObject({ name: 'Perso', description: 'desc', enabled: true });

    await renameList(id, 'Renommée');
    const renamed = await list(id);
    expect(renamed.name).toBe('Renommée');
    expect(renamed.description).toBeUndefined();

    await deleteList(id);
    expect((await getLists()).some((l) => l.id === id)).toBe(false);
  });

  it('refuse un nom vide', async () => {
    await expect(createList('  ')).rejects.toThrow(ListError);
  });

  it('ajoute des comptes normalisés sans doublon', async () => {
    const id = await createList('Perso');
    expect(await addEntry(id, { platform: 'x', handle: '@Quelqu_un' })).toBe('added');
    expect(await addEntry(id, { platform: 'x', handle: 'https://x.com/quelqu_un' })).toBe(
      'duplicate',
    );
    expect((await list(id)).entries.map((e) => e.handle)).toEqual(['quelqu_un']);
  });

  it('refuse un handle invalide', async () => {
    const id = await createList('Perso');
    await expect(addEntry(id, { platform: 'x', handle: 'pas valide' })).rejects.toThrow(ListError);
  });

  it('retire un compte', async () => {
    const id = await createList('Perso');
    await addEntry(id, { platform: 'x', handle: 'a' });
    await removeEntry(id, 'x:h:a');
    expect((await list(id)).entries).toEqual([]);
  });

  it('sérialise les écritures concurrentes', async () => {
    const id = await createList('Perso');
    await Promise.all(['a', 'b', 'c'].map((handle) => addEntry(id, { platform: 'x', handle })));
    expect((await list(id)).entries).toHaveLength(3);
  });
});

describe('syncIdentity', () => {
  it('ajoute le userId aux entrées perso et suit les changements de handle', async () => {
    const id = await createList('Perso');
    await addEntry(id, { platform: 'x', handle: 'ancien' });

    await syncIdentity('x', 'ancien', '42');
    expect((await list(id)).entries[0]).toMatchObject({ handle: 'ancien', userId: '42' });

    await syncIdentity('x', 'Nouveau', '42');
    expect((await list(id)).entries[0]).toMatchObject({ handle: 'nouveau', userId: '42' });
    expect(await getIdentities()).toEqual({ 'x:42': 'nouveau' });
  });
});

describe('watchLists', () => {
  it('notifie les changements', async () => {
    const callback = vi.fn();
    const unwatch = watchLists(callback);
    await createList('Perso');
    expect(callback).toHaveBeenCalled();
    unwatch();
  });
});

describe('migrations', () => {
  it('migre un item v1 vers v2 au premier accès', async () => {
    await fakeBrowser.storage.local.set({ demo: ['a'], demo$: { v: 1 } });
    const item = storage.defineItem<{ handles: string[] }>('local:demo', {
      fallback: { handles: [] },
      version: 2,
      migrations: { 2: (old: string[]) => ({ handles: old }) },
    });
    await item.migrate();
    expect(await item.getValue()).toEqual({ handles: ['a'] });
    expect(await item.getMeta()).toMatchObject({ v: 2 });
  });
});
