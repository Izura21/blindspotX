import type { PlatformAdapter } from '../../core/platform';
import { buildXCss, xHiddenSelectors } from './css';
import { handleFromUrl, normalizeXHandle } from './handle';
import { SELECTORS } from './selectors';

export const xAdapter: PlatformAdapter = {
  id: 'x',
  matches: ['*://x.com/*', '*://twitter.com/*', '*://mobile.x.com/*', '*://mobile.twitter.com/*'],
  normalizeHandle: normalizeXHandle,
  buildCss: buildXCss,
  hiddenSelectors: xHiddenSelectors,
  extractProfileFromUrl(url) {
    const handle = handleFromUrl(url);
    return handle ? { platform: 'x', handle } : null;
  },
  extractUserId(doc) {
    const testId = doc.querySelector(SELECTORS.profileFollowButton)?.getAttribute('data-testid');
    return testId?.match(/^(\d+)-(?:un)?follow$/)?.[1] ?? null;
  },
  itemSelector: SELECTORS.cell,
  extractItemId(item) {
    const href = item.querySelector(SELECTORS.permalink)?.getAttribute('href');
    return href?.match(/\/status\/(\d+)/)?.[1] ?? null;
  },
  // Raccourcis X d'engagement : like, réponse, repost, partage, signet, ouverture, média.
  shortcutKeys: ['l', 'r', 't', 's', 'b', 'o', 'Enter', ' '],
};
