import type { PlatformId } from '../platform';

export type ListSource = 'bundled' | 'user' | 'remote';

export interface Entry {
  platform: PlatformId;
  /** Handle normalisé par l'adapter de la plateforme. */
  handle: string;
  /** Identifiant stable, survit aux changements de handle. */
  userId?: string;
  addedAt: string;
  note?: string;
}

export interface List {
  id: string;
  name: string;
  description?: string;
  source: ListSource;
  enabled: boolean;
  /** Version du contenu (listes packagées ou distantes). */
  version?: number;
  entries: Entry[];
  /** Clés d'entrées retirées localement d'une liste non modifiable. */
  excluded: string[];
  /** Clés des entrées ajoutées localement à une liste non modifiable (incluses dans `entries`). */
  added?: string[];
}

/** Clé stable d'une entrée : userId si connu, sinon handle. */
export function entryKey(entry: Pick<Entry, 'platform' | 'handle' | 'userId'>): string {
  return entry.userId
    ? `${entry.platform}:id:${entry.userId}`
    : `${entry.platform}:h:${entry.handle}`;
}

/** Les listes packagées ne sont pas modifiables : on n'y fait que des exclusions. */
export function isEditable(list: Pick<List, 'source'>): boolean {
  return list.source === 'user';
}
