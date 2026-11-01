import { storage } from 'wxt/utils/storage';

export interface InjectorDeps {
  insertCss(tabId: number, css: string): Promise<void>;
  removeCss(tabId: number, css: string): Promise<void>;
  /** Onglets ouverts sur une plateforme supportée. */
  listTabs(): Promise<{ id: number; url: string }[]>;
  computeCss(url: string): Promise<string>;
}

// CSS injecté par onglet. En session : le service worker peut être arrêté à tout moment, et
// `removeCSS` exige exactement la chaîne injectée.
const injectedItem = storage.defineItem<Record<string, string>>('session:injectedCss', {
  fallback: {},
});

/**
 * Injecte et met à jour la feuille de style de masquage dans les onglets.
 * Les opérations d'un même onglet sont exécutées dans l'ordre d'arrivée.
 */
export function createInjector(deps: InjectorDeps) {
  const chains = new Map<number, Promise<void>>();

  function enqueue(tabId: number, task: () => Promise<void>): Promise<void> {
    const run = (chains.get(tabId) ?? Promise.resolve()).then(task, task);
    const settled = run.catch(() => undefined);
    chains.set(tabId, settled);
    void settled.then(() => {
      if (chains.get(tabId) === settled) chains.delete(tabId);
    });
    return run;
  }

  async function setInjected(tabId: number, css: string | null) {
    const injected = await injectedItem.getValue();
    const { [tabId]: _, ...rest } = injected;
    await injectedItem.setValue(css ? { ...rest, [tabId]: css } : rest);
  }

  /**
   * Met la page `url` de l'onglet à jour.
   * `newDocument` : la page vient d'être (re)chargée, l'ancien CSS a disparu avec elle.
   */
  function apply(tabId: number, url: string, { newDocument = false } = {}): Promise<void> {
    return enqueue(tabId, async () => {
      const css = await deps.computeCss(url);
      const previous = (await injectedItem.getValue())[tabId];
      if (newDocument) {
        // Une injection faite pendant le chargement (tabs.onUpdated) a pu atterrir dans ce
        // document : on la retire avant de réinjecter, sinon `removeCSS` n'en retirerait
        // qu'une copie. Rien n'est encore affiché à document_start.
        if (previous) await deps.removeCss(tabId, previous).catch(() => undefined);
        if (css) await deps.insertCss(tabId, css);
        await setInjected(tabId, css || null);
        return;
      }
      if (css === previous) return;
      // Nouveau CSS d'abord, ancien ensuite : pas d'instant sans masquage.
      if (css) await deps.insertCss(tabId, css);
      if (previous) await deps.removeCss(tabId, previous).catch(() => undefined);
      await setInjected(tabId, css || null);
    });
  }

  async function refreshAll(): Promise<void> {
    const tabs = await deps.listTabs();
    await Promise.all(tabs.map((tab) => apply(tab.id, tab.url).catch(() => undefined)));
  }

  function forget(tabId: number): Promise<void> {
    return enqueue(tabId, () => setInjected(tabId, null));
  }

  return { apply, refreshAll, forget };
}
