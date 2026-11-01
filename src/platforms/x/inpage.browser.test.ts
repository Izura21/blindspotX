import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInpageUi, type InpageUi } from '../../core/inpage';
import { installXInpage } from './inpage';

const addEntry = vi.fn(async () => 'added');
const removeEntry = vi.fn(async () => undefined);
vi.mock('../../core/lists/repository', () => ({
  ListError: class extends Error {},
  getIdentities: async () => ({}),
  watchLists: () => () => undefined,
  addEntry: (...args: unknown[]) => addEntry(...(args as [])),
  removeEntry: (...args: unknown[]) => removeEntry(...(args as [])),
  getLists: async () => [
    {
      id: 'bruit',
      name: 'Bruit de fond',
      source: 'bundled',
      enabled: true,
      excluded: [],
      entries: [{ platform: 'x', handle: 'deja', addedAt: '' }],
    },
  ],
}));

let ui: InpageUi;
let uninstall: () => void;

const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
async function slots() {
  await new Promise((r) => setTimeout(r, 50));
  await frames();
  const host = [...document.documentElement.children].find((e) => e.shadowRoot);
  return [...(host?.shadowRoot?.querySelectorAll<HTMLElement>('.slot') ?? [])];
}

beforeEach(() => {
  document.body.innerHTML = `
    <article data-testid="tweet">
      <div data-testid="User-Name"><a href="/Auteur">Auteur</a></div>
      <button data-testid="caret">…</button>
    </article>
    <div id="layers"></div>`;
  ui = createInpageUi(document, { shadowMode: 'open' });
  uninstall = installXInpage(ui, () => false);
});

afterEach(() => {
  uninstall();
  ui.destroy();
  document.body.innerHTML = '';
  addEntry.mockClear();
  removeEntry.mockClear();
});

describe('boutons dans la page (X)', () => {
  it('menu « … » : entrée sous le menu, pour l’auteur du post', async () => {
    (document.querySelector('[data-testid="caret"]') as HTMLElement).click();
    document.getElementById('layers')!.innerHTML =
      '<div role="menu" style="position: fixed; top: 100px; left: 50px; width: 250px; height: 200px"></div>';
    const [slot] = await slots();
    expect(slot?.textContent).toContain('Ajouter @auteur à Blindspot');
    const rect = slot!.getBoundingClientRect();
    expect(Math.round(rect.top)).toBe(306);
    expect(Math.round(rect.width)).toBe(250);
  });

  it('choix de liste puis ajout', async () => {
    (document.querySelector('[data-testid="caret"]') as HTMLElement).click();
    document.getElementById('layers')!.innerHTML =
      '<div role="menu" style="position: fixed; top: 100px; left: 50px; width: 250px; height: 200px"></div>';
    const [slot] = await slots();
    slot!.querySelector<HTMLButtonElement>('.main')!.click();
    const option = [...slot!.querySelectorAll<HTMLButtonElement>('.picker button')].find((b) =>
      b.textContent?.includes('Bruit de fond'),
    );
    option!.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(addEntry).toHaveBeenCalledWith('bruit', { platform: 'x', handle: 'auteur' });
    expect(slot!.textContent).toContain('Ajouté à « Bruit de fond »');
  });

  it('les clics dans nos boutons n’atteignent pas la page', async () => {
    const pageHandler = vi.fn();
    document.addEventListener('click', pageHandler);
    (document.querySelector('[data-testid="caret"]') as HTMLElement).click();
    pageHandler.mockClear();
    document.getElementById('layers')!.innerHTML =
      '<div role="menu" style="position: fixed; top: 100px; left: 50px; width: 250px; height: 200px"></div>';
    const [slot] = await slots();
    slot!.querySelector<HTMLButtonElement>('.main')!.click();
    expect(pageHandler).not.toHaveBeenCalled();
    document.removeEventListener('click', pageHandler);
  });

  it('post survolé : icône juste après l’heure', async () => {
    document.body.insertAdjacentHTML(
      'afterbegin',
      `<article data-testid="tweet" id="survol" style="position: fixed; top: 400px; left: 0">
        <div data-testid="User-Name">
          <a href="/Autre">Autre</a>
          <a href="/Autre/status/1" style="display: inline-block; width: 30px"><time>2 h</time></a>
        </div>
      </article>`,
    );
    const time = document.querySelector('#survol time')!;
    time.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const [slot] = await slots();
    expect(slot?.querySelector('.main')?.getAttribute('aria-label')).toBe(
      'Ajouter @autre à Blindspot',
    );
    const timeRect = time.parentElement!.getBoundingClientRect();
    expect(Math.round(slot!.getBoundingClientRect().left)).toBe(Math.round(timeRect.right + 6));
  });

  it('compte déjà listé : le choix de la liste le retire', async () => {
    document.querySelector('[data-testid="User-Name"] a')!.setAttribute('href', '/Deja');
    (document.querySelector('[data-testid="caret"]') as HTMLElement).click();
    document.getElementById('layers')!.innerHTML =
      '<div role="menu" style="position: fixed; top: 100px; left: 50px; width: 250px; height: 200px"></div>';
    const [slot] = await slots();
    slot!.querySelector<HTMLButtonElement>('.main')!.click();
    const option = slot!.querySelector<HTMLButtonElement>('.picker button[aria-pressed="true"]');
    option!.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(removeEntry).toHaveBeenCalledWith('bruit', 'x:h:deja');
    expect(addEntry).not.toHaveBeenCalled();
    expect(slot!.textContent).toContain('Retiré de « Bruit de fond »');
  });
});
