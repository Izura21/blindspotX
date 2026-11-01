import { getIdentities, getLists } from './lists/repository';
import { compileLookup, type Lookup } from './lists/lookup';
import { adapterForUrl } from './registry';
import { getSettings, type Settings } from './settings';

let state: Promise<{ settings: Settings; lookup: Lookup }> | null = null;

/** À appeler quand les listes ou les réglages changent. */
export function invalidateHidingState(): void {
  state = null;
}

function load() {
  state ??= Promise.all([getSettings(), getLists(), getIdentities()]).then(
    ([settings, lists, identities]) => ({ settings, lookup: compileLookup(lists, identities) }),
  );
  return state;
}

/** Feuille de style de masquage pour une page. Vide si rien à masquer ou si désactivé. */
export async function cssForUrl(url: string): Promise<string> {
  const adapter = adapterForUrl(url);
  if (!adapter) return '';
  const { settings, lookup } = await load();
  if (!settings.enabled) return '';
  return adapter.buildCss(lookup.handles(adapter.id), settings.hide, url);
}
