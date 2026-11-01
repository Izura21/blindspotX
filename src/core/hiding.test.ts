import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { cssForUrl, invalidateHidingState } from './hiding';
import { addEntry, createList, setListEnabled } from './lists/repository';
import { updateSettings } from './settings';

beforeEach(() => {
  fakeBrowser.reset();
  invalidateHidingState();
});

async function listWith(handle: string) {
  const id = await createList('Perso');
  await addEntry(id, { platform: 'x', handle });
  invalidateHidingState();
  return id;
}

describe('cssForUrl', () => {
  it('produit le CSS des comptes des listes actives', async () => {
    await listWith('cible');
    expect(await cssForUrl('https://x.com/home')).toContain('"/cible"');
  });

  it('ne produit rien hors plateforme, liste désactivée ou interrupteur coupé', async () => {
    const id = await listWith('cible');
    expect(await cssForUrl('https://example.com/')).toBe('');

    await setListEnabled(id, false);
    invalidateHidingState();
    expect(await cssForUrl('https://x.com/home')).not.toContain('"/cible"');

    await setListEnabled(id, true);
    await updateSettings({ enabled: false });
    invalidateHidingState();
    expect(await cssForUrl('https://x.com/home')).toBe('');
  });
});
