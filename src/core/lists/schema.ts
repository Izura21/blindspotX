import type { PlatformId } from '../platform';
import { getAdapter } from '../registry';
import type { Entry } from './types';

const PLATFORMS: readonly PlatformId[] = ['x', 'youtube', 'facebook'];

/** Format d'un fichier de liste (packagé, importé ou distant). */
export interface ListFile {
  id: string;
  name: string;
  description?: string;
  version: number;
  entries: Entry[];
}

export class ListValidationError extends Error {}

function fail(path: string, message: string): never {
  throw new ListValidationError(`${path} : ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(obj: Record<string, unknown>, key: string, path: string) {
  const value = obj[key];
  if (value !== undefined && typeof value !== 'string') fail(`${path}.${key}`, 'chaîne attendue');
  return value;
}

/** Normalise un handle avec l'adapter de la plateforme (repli : minuscules). */
export function normalizeHandle(platform: PlatformId, input: string): string | null {
  const adapter = getAdapter(platform);
  if (adapter) return adapter.normalizeHandle(input);
  const handle = input.trim().replace(/^@/, '').toLowerCase();
  return handle || null;
}

/** Valide et normalise une entrée. */
export function parseEntry(raw: unknown, path: string, now = new Date().toISOString()): Entry {
  if (!isRecord(raw)) fail(path, 'objet attendu');
  const platform = raw.platform as PlatformId;
  if (!PLATFORMS.includes(platform)) fail(`${path}.platform`, `plateforme inconnue (${platform})`);
  if (typeof raw.handle !== 'string') fail(`${path}.handle`, 'chaîne attendue');
  const handle = normalizeHandle(platform, raw.handle);
  if (!handle) fail(`${path}.handle`, `handle invalide (${raw.handle})`);
  const userId = optionalString(raw, 'userId', path);
  const note = optionalString(raw, 'note', path);
  return {
    platform,
    handle,
    addedAt: optionalString(raw, 'addedAt', path) ?? now,
    ...(userId && { userId }),
    ...(note && { note }),
  };
}

/** Valide un fichier de liste. */
export function parseListFile(raw: unknown, path = 'liste'): ListFile {
  if (!isRecord(raw)) fail(path, 'objet attendu');
  if (typeof raw.id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(raw.id)) {
    fail(`${path}.id`, 'identifiant invalide ([a-z0-9-], 64 caractères max)');
  }
  if (typeof raw.name !== 'string' || !raw.name.trim()) fail(`${path}.name`, 'nom requis');
  if (typeof raw.version !== 'number' || !Number.isInteger(raw.version)) {
    fail(`${path}.version`, 'entier attendu');
  }
  if (!Array.isArray(raw.entries)) fail(`${path}.entries`, 'tableau attendu');
  const description = optionalString(raw, 'description', path);
  return {
    id: raw.id,
    name: raw.name.trim(),
    version: raw.version,
    entries: dedupe(raw.entries.map((e, i) => parseEntry(e, `${path}.entries[${i}]`))),
    ...(description && { description }),
  };
}

/** Supprime les doublons (même handle ou même userId sur une plateforme). Garde le premier. */
export function dedupe(entries: Entry[]): Entry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const keys = [`${entry.platform}:h:${entry.handle}`];
    if (entry.userId) keys.push(`${entry.platform}:id:${entry.userId}`);
    if (keys.some((k) => seen.has(k))) return false;
    keys.forEach((k) => seen.add(k));
    return true;
  });
}
