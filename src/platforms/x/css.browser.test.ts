// Vérifie la sémantique des règles générées dans de vrais moteurs (Chromium, Firefox) :
// `:has()` + `:not()` complexes, overlay, mentions. DOM synthétique, calqué sur la structure
// supposée de X (voir selectors.ts) : il ne remplace pas les fixtures réelles.
import { afterEach, describe, expect, it } from 'vitest';
import { selectorTest } from '../../core/hidden';
import { DEFAULT_HIDE_OPTIONS, type HideOptions } from '../../core/platform';
import { buildXCss, xHiddenSelectors } from './css';

const userName = (handle: string) =>
  `<div data-testid="UserAvatar-Container-${handle}"></div>` +
  `<div data-testid="User-Name"><a href="/${handle}">Nom</a><a href="/${handle}">@${handle}</a></div>`;

// Sur le vrai X, un post cité n'a aucun lien : seulement l'avatar et le nom en texte.
const quotedUserName = (handle: string) =>
  `<div data-testid="UserAvatar-Container-${handle}"></div>` +
  `<div data-testid="User-Name"><span>Nom</span><span>@${handle}</span></div>`;

const tweet = ({
  author,
  text = 'texte',
  repostedBy,
  quoted,
}: {
  author: string;
  text?: string;
  repostedBy?: string;
  quoted?: string;
}) => `
  <div data-testid="cellInnerDiv" style="position: absolute; width: 100%; transform: translateY(0)">
    <article data-testid="tweet">
      ${repostedBy ? `<a href="/${repostedBy}"><span data-testid="socialContext">a reposté</span></a>` : ''}
      ${userName(author)}
      <div data-testid="tweetText">${text}</div>
      ${quoted ? `<div role="link" tabindex="0">${quotedUserName(quoted)}<div>cité</div></div>` : ''}
    </article>
  </div>`;

let style: HTMLStyleElement | null = null;

function overlay(element: Element | null): string {
  if (!element) throw new Error('élément introuvable');
  const { content } = getComputedStyle(element, '::after');
  return content === 'none' || content === 'normal' ? '' : content;
}

/** Verdict du CSS : l'élément, ou l'un de ses ancêtres, porte l'encart. */
function coveredByCss(element: Element): boolean {
  for (let el: Element | null = element; el; el = el.parentElement) if (overlay(el)) return true;
  return false;
}

/**
 * Le content script (hidden.ts) et le CSS doivent rendre le même verdict sur chaque élément
 * de la page. Renvoie le nombre d'éléments masqués.
 */
function expectParity(handles: string[], options: HideOptions, url: string): number {
  const isHidden = selectorTest(xHiddenSelectors(handles, options, url));
  const elements = [...document.body.querySelectorAll('*')];
  const css = elements.map(coveredByCss);
  const js = elements.map((el) => isHidden(el));
  expect(js).toEqual(css);
  return css.filter(Boolean).length;
}

function render(
  html: string,
  handles: string[],
  patch: Partial<HideOptions> = {},
  url = 'https://x.com/home',
) {
  document.body.innerHTML = `<div style="position: relative">${html}</div>`;
  style = document.createElement('style');
  const options = { ...DEFAULT_HIDE_OPTIONS, ...patch };
  style.textContent = buildXCss(handles, options, url);
  document.head.append(style);
  return expectParity(handles, options, url);
}

const cells = () => [...document.querySelectorAll('[data-testid="cellInnerDiv"]')];

afterEach(() => {
  style?.remove();
  document.body.innerHTML = '';
  document.body.removeAttribute('style');
});

describe('règles CSS X', () => {
  it('masque les posts d’un compte listé, et seulement eux', () => {
    render(tweet({ author: 'Cible' }) + tweet({ author: 'autre' }), ['cible']);
    const [hidden, visible] = cells();
    expect(overlay(hidden!)).toContain('Post masqué');
    expect(overlay(visible!)).toBe('');
  });

  it('ignore les mentions dans le texte', () => {
    render(tweet({ author: 'autre', text: '<a href="/cible">@cible</a>' }), ['cible']);
    expect(overlay(cells()[0]!)).toBe('');
  });

  it('masque le repost d’un post de compte listé', () => {
    render(tweet({ author: 'cible', repostedBy: 'autre' }), ['cible']);
    expect(overlay(cells()[0]!)).toContain('Post masqué');
  });

  it('masque les reposts faits par un compte listé, selon l’option', () => {
    const html = tweet({ author: 'autre', repostedBy: 'cible' });
    render(html, ['cible']);
    expect(overlay(cells()[0]!)).toContain('Post masqué');
    style?.remove();
    render(html, ['cible'], { reposts: false });
    expect(overlay(cells()[0]!)).toBe('');
  });

  it('citation : seul le bloc cité est masqué', () => {
    render(tweet({ author: 'autre', quoted: 'Cible' }), ['cible']);
    expect(overlay(cells()[0]!)).toBe('');
    expect(overlay(document.querySelector('[role="link"]'))).toContain('Post masqué');
  });

  it('citation dans une citation : seul le bloc du compte listé est masqué', () => {
    const nestedQuote = (outer: string, inner: string) => `
      <div data-testid="cellInnerDiv" style="position: absolute; width: 100%">
        <article data-testid="tweet">
          ${userName('auteur')}
          <div role="link" class="outer">${quotedUserName(outer)}
            <div role="link" class="inner">${quotedUserName(inner)}</div>
          </div>
        </article>
      </div>`;
    render(nestedQuote('autre', 'cible'), ['cible']);
    expect(overlay(document.querySelector('.outer'))).toBe('');
    expect(overlay(document.querySelector('.inner'))).toContain('Post masqué');

    style?.remove();
    render(nestedQuote('cible', 'autre'), ['cible']);
    expect(overlay(document.querySelector('.outer'))).toContain('Post masqué');
    expect(overlay(cells()[0]!)).toBe('');
  });

  it('l’overlay couvre la cellule sans changer sa taille', () => {
    render(tweet({ author: 'cible' }) + tweet({ author: 'autre' }), ['cible']);
    const [hidden, visible] = cells();
    expect(hidden!.getBoundingClientRect().height).toBe(visible!.getBoundingClientRect().height);
    const after = getComputedStyle(hidden!, '::after');
    expect(after.position).toBe('absolute');
    expect(after.pointerEvents).toBe('auto');
  });

  it('les clics atteignent l’overlay, pas le contenu', () => {
    render(tweet({ author: 'cible' }), ['cible']);
    const cell = cells()[0]!;
    const rect = cell.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + 5, rect.top + 5);
    expect(hit).toBe(cell);
  });

  it('couleurs du thème sur l’encart, sans propriété personnalisée', () => {
    document.body.style.backgroundColor = 'rgb(21, 32, 43)';
    render(tweet({ author: 'cible' }), ['cible']);
    const after = getComputedStyle(cells()[0]!, '::after');
    expect(after.backgroundColor).toBe('rgb(21, 32, 43)');
    expect(after.color).toBe('rgb(139, 152, 165)');
    document.body.style.backgroundColor = 'rgb(255, 255, 255)';
    expect(getComputedStyle(cells()[0]!, '::after').backgroundColor).toBe('rgb(255, 255, 255)');
    for (const element of [document.documentElement, cells()[0]!]) {
      expect([...getComputedStyle(element)].filter((n) => n.startsWith('--'))).toEqual([]);
    }
  });
});

// Toutes les fixtures × réglages × pages : le CSS et le content script s'accordent.
describe('verdict identique CSS / content script', () => {
  const nested = `
    <div data-testid="cellInnerDiv" style="position: absolute; width: 100%">
      <article data-testid="tweet">
        ${userName('auteur')}
        <div role="link">${quotedUserName('autre')}
          <div role="link">${quotedUserName('cible')}</div>
        </div>
      </article>
    </div>`;
  const fixtures = [
    tweet({ author: 'Cible' }),
    tweet({ author: 'autre' }),
    tweet({ author: 'autre', text: '<a href="/cible">@cible</a>' }),
    tweet({ author: 'cible', repostedBy: 'autre' }),
    tweet({ author: 'autre', repostedBy: 'cible' }),
    tweet({ author: 'autre', quoted: 'Cible' }),
    tweet({ author: 'cible', quoted: 'autre' }),
    tweet({ author: 'deux', quoted: 'cible' }),
    nested,
  ].join('');
  const variants: Partial<HideOptions>[] = [
    {},
    { reposts: false },
    { quotes: false },
    { replies: false },
    { onTargetProfile: false },
    { showLabel: true, style: 'compact' },
  ];
  const urls = [
    'https://x.com/home',
    'https://x.com/someone/status/123',
    'https://x.com/Cible',
    'https://x.com/Cible/status/1',
  ];

  for (const patch of variants) {
    for (const url of urls) {
      it(`${JSON.stringify(patch)} sur ${new URL(url).pathname}`, () => {
        render(fixtures, ['cible', 'deux'], patch, url);
      });
    }
  }

  it('masque bien quelque chose (le test n’est pas vide)', () => {
    expect(render(fixtures, ['cible'])).toBeGreaterThan(10);
    style?.remove();
    expect(render(fixtures, [])).toBe(0);
  });
});
