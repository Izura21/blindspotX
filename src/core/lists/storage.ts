import { storage } from 'wxt/utils/storage';
import type { Entry } from './types';

// Tout est dans `storage.local` : le quota de `storage.sync` (~100 Ko) est trop faible.
//
// Migrations : pour changer la forme d'un item, incrémenter `version` et ajouter
// `migrations: { <nouvelle version>: (ancienne valeur) => nouvelle valeur }`.
// WXT applique les migrations manquantes au premier accès.

export interface StoredUserList {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  createdAt: string;
  entries: Entry[];
}

/** Choix de l'utilisateur sur une liste non modifiable (packagée ou distante). */
export interface StoredListState {
  enabled: boolean;
  excluded: string[];
  /** Comptes ajoutés localement par l'utilisateur. Jamais écrasés par une mise à jour. */
  added?: Entry[];
}

export const userListsItem = storage.defineItem<StoredUserList[]>('local:userLists', {
  fallback: [],
  version: 1,
});

// Identifiants de listes par défaut renommés (ancien → nouveau) : l'état de l'utilisateur suit
// le nouveau nom. Aucun pour l'instant.
const RENAMED_LISTS: Record<string, string> = {};

export const listStateItem = storage.defineItem<Record<string, StoredListState>>(
  'local:listState',
  {
    fallback: {},
    version: 2,
    migrations: {
      2: (state: Record<string, StoredListState>) =>
        Object.fromEntries(Object.entries(state).map(([id, s]) => [RENAMED_LISTS[id] ?? id, s])),
    },
  },
);

/** Handle courant connu pour un userId (`<platform>:<userId>` → handle). */
export const identitiesItem = storage.defineItem<Record<string, string>>('local:identities', {
  fallback: {},
  version: 1,
});
