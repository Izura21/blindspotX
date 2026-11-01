import type { PlatformId } from '../platform';
import { entryKey, type List } from './types';

/** Index des comptes à masquer, compilé depuis les listes actives. */
export interface Lookup {
  /** Handles à masquer sur une plateforme, triés. */
  handles(platform: PlatformId): string[];
  has(platform: PlatformId, handle: string): boolean;
  /** Identifiants des listes qui contiennent ce compte. */
  listsOf(platform: PlatformId, handle: string): string[];
}

export function compileLookup(lists: List[], identities: Record<string, string> = {}): Lookup {
  const index = new Map<PlatformId, Map<string, string[]>>();

  for (const list of lists) {
    if (!list.enabled) continue;
    const excluded = new Set(list.excluded);
    for (const entry of list.entries) {
      if (excluded.has(entryKey(entry))) continue;
      // Un handle observé plus récemment pour ce userId prime sur celui de la liste.
      const handle =
        (entry.userId && identities[`${entry.platform}:${entry.userId}`]) || entry.handle;
      let byHandle = index.get(entry.platform);
      if (!byHandle) index.set(entry.platform, (byHandle = new Map()));
      const owners = byHandle.get(handle);
      if (!owners) byHandle.set(handle, [list.id]);
      else if (!owners.includes(list.id)) owners.push(list.id);
    }
  }

  return {
    handles: (platform) => [...(index.get(platform)?.keys() ?? [])].sort(),
    has: (platform, handle) => index.get(platform)?.has(handle) ?? false,
    listsOf: (platform, handle) => index.get(platform)?.get(handle) ?? [],
  };
}
