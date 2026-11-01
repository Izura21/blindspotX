import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createList, getLists } from './lists/repository';
import { onMenuClicked } from './menus';

beforeEach(() => {
  fakeBrowser.reset();
  vi.spyOn(fakeBrowser.action, 'setBadgeText').mockResolvedValue(undefined);
});

async function userLists() {
  return (await getLists()).filter((l) => l.source === 'user');
}

describe('menu contextuel', () => {
  it('ajoute le profil du lien à la liste choisie', async () => {
    const id = await createList('Perso');
    await onMenuClicked({ menuItemId: `blindspot:list:${id}`, linkUrl: 'https://x.com/Cible' });
    expect((await userLists())[0]?.entries.map((e) => e.handle)).toEqual(['cible']);
  });

  it('crée « Ma liste » si aucune liste perso n’existe', async () => {
    await onMenuClicked({ menuItemId: 'blindspot:new', linkUrl: 'https://x.com/cible/status/1' });
    const [list] = await userLists();
    expect(list?.name).toBe('Ma liste');
    expect(list?.entries.map((e) => e.handle)).toEqual(['cible']);
  });

  it('ignore les liens qui ne sont pas des profils', async () => {
    const id = await createList('Perso');
    await onMenuClicked(
      { menuItemId: `blindspot:list:${id}`, linkUrl: 'https://x.com/explore' },
      { id: 3 },
    );
    expect((await userLists())[0]?.entries).toEqual([]);
    expect(fakeBrowser.action.setBadgeText).toHaveBeenCalledWith({ tabId: 3, text: '?' });
  });
});
