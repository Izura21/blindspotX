import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { cssForUrl, invalidateHidingState } from '../core/hiding';
import { createInjector } from '../core/injector';
import { getLists, syncIdentity, watchLists } from '../core/lists/repository';
import {
  isIdentityMessage,
  isReadyMessage,
  isSeenMessage,
  type IdentityMessage,
} from '../core/messages';
import { onMenuClicked, rebuildMenus } from '../core/menus';
import { getAdapter, listAdapters } from '../core/registry';
import { watchSettings } from '../core/settings';
import { recordIgnored } from '../core/stats';

/** On ne retient l'identité que des comptes présents dans une liste. */
async function rememberIdentity({ platform, handle, userId }: IdentityMessage) {
  const normalized = getAdapter(platform)?.normalizeHandle(handle);
  if (!normalized) return;
  const listed = (await getLists()).some((list) =>
    list.entries.some(
      (e) => e.platform === platform && (e.handle === normalized || e.userId === userId),
    ),
  );
  if (listed) await syncIdentity(platform, normalized, userId);
}

export default defineBackground(() => {
  const injector = createInjector({
    async insertCss(tabId, css) {
      await browser.scripting.insertCSS({ target: { tabId }, css, origin: 'USER' });
    },
    async removeCss(tabId, css) {
      await browser.scripting.removeCSS({ target: { tabId }, css, origin: 'USER' });
    },
    async listTabs() {
      const tabs = await browser.tabs.query({ url: listAdapters().flatMap((a) => [...a.matches]) });
      return tabs.flatMap((t) => (t.id !== undefined && t.url ? [{ id: t.id, url: t.url }] : []));
    },
    computeCss: cssForUrl,
  });

  browser.runtime.onMessage.addListener((message, sender) => {
    if (isIdentityMessage(message)) {
      void rememberIdentity(message);
      return;
    }
    if (isSeenMessage(message)) {
      void recordIgnored(message.count);
      return;
    }
    // Nouvelle page : le content script se signale à document_start.
    const tabId = sender.tab?.id;
    const url = sender.url ?? sender.tab?.url;
    if (!isReadyMessage(message) || tabId === undefined || !url || sender.frameId !== 0) return;
    void injector.apply(tabId, url, { newDocument: true });
  });

  // Navigation interne de l'application (pushState) : les options dépendent de la page.
  browser.tabs.onUpdated.addListener((tabId, info) => {
    if (info.url) void injector.apply(tabId, info.url);
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    void injector.forget(tabId);
  });

  browser.contextMenus.onClicked.addListener((info, tab) => void onMenuClicked(info, tab));

  watchLists(() => {
    invalidateHidingState();
    void injector.refreshAll();
    void rebuildMenus();
  });
  watchSettings(() => {
    invalidateHidingState();
    void injector.refreshAll();
  });

  // Onglets déjà ouverts à l'installation ou à la mise à jour.
  browser.runtime.onInstalled.addListener(() => void injector.refreshAll());
  void rebuildMenus();
});
