import { selectorTest, type HiddenTest } from './hidden';
import { compileLookup, type Lookup } from './lists/lookup';
import { getIdentities, getLists, watchLists } from './lists/repository';
import type { PlatformAdapter } from './platform';
import { getSettings, watchSettings, type Settings } from './settings';

// Test « masqué ? » du content script, tenu à jour depuis le stockage de l'extension.
// Lecture en isolated world, comme les boutons dans la page (inpage.ts). Voir hidden.ts.

export interface HiddenMatcher {
  isHidden: HiddenTest;
  destroy(): void;
}

/**
 * Test à jour des listes et réglages. Tant que le stockage n'est pas lu, rien n'est
 * considéré masqué (le CSS, injecté par le background, n'est pas encore là non plus).
 */
export function createHiddenMatcher(
  adapter: PlatformAdapter,
  { pageUrl = () => location.href }: { pageUrl?: () => string } = {},
): HiddenMatcher {
  let state: { settings: Settings; lookup: Lookup } | null = null;
  // L'URL change sans rechargement sur X : le test est recalculé par page.
  let cache: { url: string; test: HiddenTest } | null = null;
  let generation = 0;

  const refresh = async () => {
    const current = ++generation;
    const [settings, lists, identities] = await Promise.all([
      getSettings(),
      getLists(),
      getIdentities(),
    ]);
    if (current !== generation) return;
    state = { settings, lookup: compileLookup(lists, identities) };
    cache = null;
  };
  void refresh();
  const unwatchLists = watchLists(() => void refresh());
  const unwatchSettings = watchSettings(() => void refresh());

  const testFor = (url: string): HiddenTest => {
    if (cache?.url === url) return cache.test;
    const test =
      state && state.settings.enabled
        ? selectorTest(
            adapter.hiddenSelectors(state.lookup.handles(adapter.id), state.settings.hide, url),
          )
        : () => false;
    if (state) cache = { url, test };
    return test;
  };

  return {
    isHidden: (element) => !!element && testFor(pageUrl())(element),
    destroy() {
      unwatchLists();
      unwatchSettings();
    },
  };
}
