import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { xAdapter } from '../platforms/x/adapter';
import { addEntry, createList, setListEnabled } from './lists/repository';
import { createHiddenMatcher } from './matcher';
import { updateSettings } from './settings';

// Pas de DOM en Node : un faux élément applique `closest` sur le sélecteur reçu.
const element = { closest: (selector: string) => (selector.includes('"/cible"') ? {} : null) };
const asElement = element as unknown as Element;

beforeEach(() => {
  fakeBrowser.reset();
});

describe('createHiddenMatcher', () => {
  it('suit les listes et l’interrupteur global', async () => {
    let url = 'https://x.com/home';
    const matcher = createHiddenMatcher(xAdapter, { pageUrl: () => url });
    expect(matcher.isHidden(asElement)).toBe(false);
    expect(matcher.isHidden(null)).toBe(false);

    const id = await createList('Perso');
    await addEntry(id, { platform: 'x', handle: 'cible' });
    await vi.waitFor(() => expect(matcher.isHidden(asElement)).toBe(true));

    await setListEnabled(id, false);
    await vi.waitFor(() => expect(matcher.isHidden(asElement)).toBe(false));
    await setListEnabled(id, true);
    await vi.waitFor(() => expect(matcher.isHidden(asElement)).toBe(true));

    await updateSettings({ enabled: false });
    await vi.waitFor(() => expect(matcher.isHidden(asElement)).toBe(false));
    await updateSettings({ enabled: true, hide: { onTargetProfile: false } });
    await vi.waitFor(() => expect(matcher.isHidden(asElement)).toBe(true));

    // Navigation sans rechargement vers le profil du compte : plus rien de masqué.
    url = 'https://x.com/cible';
    expect(matcher.isHidden(asElement)).toBe(false);
    matcher.destroy();
  });
});
