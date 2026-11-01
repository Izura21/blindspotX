import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_HIDE_OPTIONS } from './platform';
import { buildXCss, xHiddenSelectors } from '../platforms/x/css';
import { installKeyboardGuard, installMediaGuard } from './guards';
import { selectorTest } from './hidden';

const isHidden = selectorTest(xHiddenSelectors(['cible'], DEFAULT_HIDE_OPTIONS));

const cell = (author: string) => `
  <div data-testid="cellInnerDiv" style="position: absolute; width: 100%">
    <article data-testid="tweet" tabindex="0">
      <div data-testid="User-Name"><a href="/${author}">@${author}</a></div>
      <video></video>
    </article>
  </div>`;

let cleanups: (() => void)[] = [];
let style: HTMLStyleElement;

beforeEach(() => {
  document.body.innerHTML = `<div style="position: relative">${cell('cible')}</div>
    <div style="position: relative">${cell('autre')}</div>`;
  style = document.createElement('style');
  style.textContent = buildXCss(['cible'], DEFAULT_HIDE_OPTIONS);
  document.head.append(style);
});

afterEach(() => {
  cleanups.forEach((c) => c());
  cleanups = [];
  style.remove();
  document.body.innerHTML = '';
});

const articles = () => [...document.querySelectorAll('article')];

describe('selectorTest', () => {
  it('détecte un élément masqué et ses descendants', () => {
    const [hidden, visible] = articles();
    expect(isHidden(hidden!)).toBe(true);
    expect(isHidden(hidden!.querySelector('a'))).toBe(true);
    expect(isHidden(visible!)).toBe(false);
    expect(isHidden(null)).toBe(false);
    expect(selectorTest([])(hidden!)).toBe(false);
  });

  it('n’expose aucune propriété personnalisée à la page', () => {
    const [hidden] = articles();
    for (const element of [document.documentElement, hidden!.parentElement!, hidden!]) {
      const computed = getComputedStyle(element);
      const custom = [...computed].filter((name) => name.startsWith('--'));
      expect(custom).toEqual([]);
      for (const name of ['--blindspot-hidden', '--blindspot-bg', '--blindspot-fg']) {
        expect(computed.getPropertyValue(name)).toBe('');
      }
    }
  });
});

describe('garde clavier', () => {
  function press(target: Element, key: string, init: KeyboardEventInit = {}) {
    const pageHandler = vi.fn();
    document.addEventListener('keydown', pageHandler);
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
    document.removeEventListener('keydown', pageHandler);
    return pageHandler.mock.calls.length > 0;
  }

  beforeEach(() => {
    cleanups.push(installKeyboardGuard(['l', 'r', 'Enter'], isHidden));
  });

  it('bloque les raccourcis d’engagement sur un post masqué', () => {
    const [hidden] = articles();
    expect(press(hidden!, 'l')).toBe(false);
    expect(press(hidden!, 'L')).toBe(false);
    expect(press(hidden!, 'Enter')).toBe(false);
  });

  it('laisse passer la navigation et les posts visibles', () => {
    const [hidden, visible] = articles();
    expect(press(hidden!, 'j')).toBe(true);
    expect(press(hidden!, 'l', { ctrlKey: true })).toBe(true);
    expect(press(visible!, 'l')).toBe(true);
  });
});

describe('garde médias', () => {
  beforeEach(() => {
    cleanups.push(installMediaGuard(isHidden));
  });

  function play(video: HTMLVideoElement) {
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => undefined);
    video.dispatchEvent(new Event('play'));
    return pause;
  }

  it('coupe et met en pause les vidéos d’un post masqué', () => {
    const [hidden] = document.querySelectorAll('video');
    const pause = play(hidden!);
    expect(pause).toHaveBeenCalled();
    expect(hidden!.muted).toBe(true);
  });

  it('ne touche pas aux vidéos visibles', () => {
    const [, visible] = document.querySelectorAll('video');
    const pause = play(visible!);
    expect(pause).not.toHaveBeenCalled();
    expect(visible!.muted).toBe(false);
  });
});
