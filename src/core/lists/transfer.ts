import { dedupe, ListValidationError, parseEntry, parseListFile, type ListFile } from './schema';
import type { Entry, List } from './types';

// Import / export des listes. Formats :
// - JSON : un fichier de liste (`ListFile`) ou un export complet `{ format, lists: ListFile[] }` ;
// - CSV : `platform,handle,userId,note,list` (seuls `platform` et `handle` sont obligatoires).

export const EXPORT_FORMAT = 'blindspot/lists@1';
// Exports faits sous l'ancien nom de l'extension.
const LEGACY_FORMATS: unknown[] = ['angle-mort/lists@1'];
/** Taille maximale d'un fichier importé (PRD §7.2). */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const CSV_COLUMNS = ['platform', 'handle', 'userId', 'note', 'list'] as const;

export function toFile(list: List): ListFile {
  return {
    id: list.id.replace(/^user-/, 'liste-').slice(0, 64),
    name: list.name,
    version: list.version ?? 1,
    ...(list.description && { description: list.description }),
    entries: list.entries.map(({ platform, handle, userId, note, addedAt }) => ({
      platform,
      handle,
      addedAt,
      ...(userId && { userId }),
      ...(note && { note }),
    })),
  };
}

export function exportJson(lists: List[]): string {
  return JSON.stringify({ format: EXPORT_FORMAT, lists: lists.map(toFile) }, null, 2);
}

function csvCell(value: string | undefined): string {
  const text = value ?? '';
  // Préfixe les débuts de formule pour éviter les injections dans un tableur.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function exportCsv(lists: List[]): string {
  const rows = lists.flatMap((list) =>
    list.entries.map((e) => [e.platform, e.handle, e.userId, e.note, list.name].map(csvCell)),
  );
  return [CSV_COLUMNS.join(','), ...rows.map((r) => r.join(','))].join('\n') + '\n';
}

/** Parseur CSV (RFC 4180) : guillemets, guillemets doublés, retours à la ligne dans un champ. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  row.push(field);
  if (row.some((cell) => cell !== '')) rows.push(row);
  return rows;
}

function slug(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
  return base || 'import';
}

function parseCsvImport(text: string, defaultName: string): ListFile[] {
  const [header, ...rows] = parseCsv(text.replace(/^\uFEFF/, ''));
  if (!header) throw new ListValidationError('CSV vide');
  const columns = header.map((h) => h.trim());
  const index = (name: string) => columns.indexOf(name);
  if (index('platform') < 0 || index('handle') < 0) {
    throw new ListValidationError('CSV : colonnes « platform » et « handle » obligatoires');
  }
  const groups = new Map<string, Entry[]>();
  rows.forEach((cells, i) => {
    const cell = (name: string) => {
      const value = cells[index(name)]?.trim();
      return value ? value.replace(/^'(?=[=+\-@])/, '') : undefined;
    };
    const entry = parseEntry(
      {
        platform: cell('platform'),
        handle: cell('handle'),
        userId: cell('userId'),
        note: cell('note'),
      },
      `ligne ${i + 2}`,
    );
    const name = cell('list') ?? defaultName;
    groups.set(name, [...(groups.get(name) ?? []), entry]);
  });
  return [...groups].map(([name, entries]) => ({
    id: slug(name),
    name,
    version: 1,
    entries: dedupe(entries),
  }));
}

/** Lit un fichier importé. Lève `ListValidationError` avec un message lisible. */
export function parseImport(text: string, fileName: string): ListFile[] {
  if (new Blob([text]).size > MAX_IMPORT_BYTES) {
    throw new ListValidationError('Fichier trop volumineux (5 Mo maximum)');
  }
  const defaultName = fileName.replace(/\.[^.]+$/, '') || 'Import';
  if (/\.csv$/i.test(fileName)) return parseCsvImport(text, defaultName);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ListValidationError('JSON invalide');
  }
  if (typeof raw === 'object' && raw !== null && 'lists' in raw) {
    const { format, lists } = raw as { format?: unknown; lists: unknown };
    if (format !== EXPORT_FORMAT && !LEGACY_FORMATS.includes(format))
      throw new ListValidationError('Format d’export inconnu');
    if (!Array.isArray(lists)) throw new ListValidationError('lists : tableau attendu');
    return lists.map((l, i) => parseListFile(l, `lists[${i}]`));
  }
  return [parseListFile(raw)];
}

/** Aperçu d'un import dans une liste existante (ou nouvelle si `target` absent). */
export function previewImport(
  file: ListFile,
  target?: List,
): { added: number; duplicates: number } {
  if (!target) return { added: file.entries.length, duplicates: 0 };
  const merged = dedupe([...target.entries, ...file.entries]);
  const added = merged.length - target.entries.length;
  return { added, duplicates: file.entries.length - added };
}
