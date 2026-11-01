import { browser } from 'wxt/browser';
import { addEntry, createList, getLists, ListError } from './lists/repository';
import { isEditable } from './lists/types';
import { adapterForUrl, listAdapters } from './registry';

// Menu contextuel « Ajouter à Blindspot » sur les liens de profil.
// Remplace un bouton injecté dans la page : aucune empreinte DOM.

const ROOT = 'blindspot';
const NEW_LIST = 'blindspot:new';
const LIST_PREFIX = 'blindspot:list:';
const DEFAULT_LIST_NAME = 'Ma liste';

function create(properties: Parameters<typeof browser.contextMenus.create>[0]): Promise<void> {
  return new Promise((resolve) => {
    browser.contextMenus.create(properties, () => {
      // Lire lastError évite l'avertissement « Unchecked runtime.lastError ».
      void browser.runtime.lastError;
      resolve();
    });
  });
}

let rebuilding: Promise<void> = Promise.resolve();

/** Reconstruit le menu à partir des listes perso. */
export function rebuildMenus(): Promise<void> {
  rebuilding = rebuilding.then(async () => {
    await browser.contextMenus.removeAll();
    const patterns = listAdapters().flatMap((a) => [...a.matches]);
    await create({
      id: ROOT,
      title: 'Ajouter à Blindspot',
      contexts: ['link'],
      targetUrlPatterns: patterns,
      documentUrlPatterns: patterns,
    });
    const lists = await getLists();
    for (const list of lists) {
      await create({
        id: `${LIST_PREFIX}${list.id}`,
        parentId: ROOT,
        title: list.name,
        contexts: ['link'],
      });
    }
    if (!lists.some(isEditable)) {
      await create({
        id: NEW_LIST,
        parentId: ROOT,
        title: `Nouvelle liste « ${DEFAULT_LIST_NAME} »`,
        contexts: ['link'],
      });
    }
  });
  return rebuilding;
}

async function flashBadge(tabId: number | undefined, text: string) {
  if (tabId === undefined) return;
  await browser.action.setBadgeText({ tabId, text });
  setTimeout(() => void browser.action.setBadgeText({ tabId, text: '' }), 2000);
}

/** Ajoute le profil du lien cliqué à la liste choisie. */
export async function onMenuClicked(
  info: { menuItemId: string | number; linkUrl?: string },
  tab?: { id?: number },
): Promise<void> {
  const id = String(info.menuItemId);
  if (!info.linkUrl || (id !== NEW_LIST && !id.startsWith(LIST_PREFIX))) return;
  const profile = adapterForUrl(info.linkUrl)?.extractProfileFromUrl(info.linkUrl);
  if (!profile) {
    await flashBadge(tab?.id, '?');
    return;
  }
  try {
    const listId =
      id === NEW_LIST ? await createList(DEFAULT_LIST_NAME) : id.slice(LIST_PREFIX.length);
    await addEntry(listId, profile);
    await flashBadge(tab?.id, '✓');
  } catch (error) {
    if (!(error instanceof ListError)) throw error;
    await flashBadge(tab?.id, '!');
  }
}
