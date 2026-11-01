import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildXCss, xHiddenSelectors } from '../platforms/x/css';
import { xAdapter } from '../platforms/x/adapter';
import { watchIgnored } from './counter';
import { selectorTest } from './hidden';
import { DEFAULT_HIDE_OPTIONS } from './platform';

const cell = (author: string, id: string) => `
  <div data-testid="cellInnerDiv" style="position: relative; height: 120px">
    <article data-testid="tweet">
      <div data-testid="User-Name"><a href="/${author}">@${author}</a></div>
      <a href="/${author}/status/${id}"><time>1 h</time></a>
    </article>
  </div>`;

let style: HTMLStyleElement | null = null;

afterEach(() => {
  style?.remove();
  document.body.innerHTML = '';
});

describe('watchIgnored', () => {
  it('compte une fois chaque post masqué affiché', async () => {
    style = document.createElement('style');
    style.textContent = buildXCss(['cible'], DEFAULT_HIDE_OPTIONS);
    document.head.append(style);
    const send = vi.fn();
    const stop = watchIgnored(
      xAdapter,
      selectorTest(xHiddenSelectors(['cible'], DEFAULT_HIDE_OPTIONS)),
      send,
      { flushMs: 50 },
    );

    document.body.innerHTML = cell('cible', '1') + cell('autre', '2') + cell('cible', '3');
    // Même post réaffiché (cellule recréée par le fil virtualisé).
    await new Promise((r) => setTimeout(r, 100));
    document.body.insertAdjacentHTML('beforeend', cell('cible', '1'));
    await new Promise((r) => setTimeout(r, 200));
    stop();

    const total = send.mock.calls.reduce((sum, [count]) => sum + count, 0);
    expect(total).toBe(2);
  });
});
