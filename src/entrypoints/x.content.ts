import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { installKeyboardGuard, installMediaGuard } from '../core/guards';
import { watchIgnored } from '../core/counter';
import { watchIdentity } from '../core/identity';
import { createInpageUi } from '../core/inpage';
import { createHiddenMatcher } from '../core/matcher';
import type { ReadyMessage, SeenMessage } from '../core/messages';
import { getSettings, watchSettings } from '../core/settings';
import { xAdapter } from '../platforms/x/adapter';
import { installXInpage } from '../platforms/x/inpage';

export default defineContentScript({
  matches: [...xAdapter.matches],
  runAt: 'document_start',
  main() {
    // Le background injecte le CSS de masquage dans ce nouveau document.
    void browser.runtime.sendMessage({ type: 'blindspot:ready' } satisfies ReadyMessage);
    // Posts masqués reconnus à partir du stockage de l'extension, pas du style calculé.
    const { isHidden } = createHiddenMatcher(xAdapter);
    installKeyboardGuard(xAdapter.shortcutKeys, isHidden);
    installMediaGuard(isHidden);
    watchIdentity(xAdapter, (message) => void browser.runtime.sendMessage(message));
    watchIgnored(xAdapter, isHidden, (count) => {
      void browser.runtime.sendMessage({ type: 'blindspot:seen', count } satisfies SeenMessage);
    });

    // Boutons dans la page, sauf en mode discret. Montés après le chargement du DOM.
    let teardown: (() => void) | null = null;
    const syncInpage = async () => {
      const { discreet } = await getSettings();
      if (discreet && teardown) {
        teardown();
        teardown = null;
      } else if (!discreet && !teardown) {
        const ui = createInpageUi();
        const uninstall = installXInpage(ui, isHidden);
        teardown = () => {
          uninstall();
          ui.destroy();
        };
      }
    };
    const start = () => {
      void syncInpage();
      watchSettings(() => void syncInpage());
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start, { once: true });
    } else start();
  },
});
