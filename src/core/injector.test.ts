import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createInjector } from './injector';

function setup(cssByUrl: Record<string, string>) {
  const calls: string[] = [];
  const deps = {
    insertCss: vi.fn(async (tabId: number, css: string) => {
      calls.push(`insert ${tabId} ${css}`);
    }),
    removeCss: vi.fn(async (tabId: number, css: string) => {
      calls.push(`remove ${tabId} ${css}`);
    }),
    listTabs: vi.fn(async () => [
      { id: 1, url: 'https://x.com/a' },
      { id: 2, url: 'https://x.com/b' },
    ]),
    computeCss: vi.fn(async (url: string) => cssByUrl[url] ?? ''),
  };
  return { injector: createInjector(deps), deps, calls };
}

beforeEach(() => {
  fakeBrowser.reset();
});

describe('injector', () => {
  it('injecte, remplace (nouveau avant ancien) et ne refait rien si identique', async () => {
    const { injector, calls } = setup({ 'https://x.com/a': 'A', 'https://x.com/b': 'B' });
    await injector.apply(1, 'https://x.com/a');
    await injector.apply(1, 'https://x.com/a');
    await injector.apply(1, 'https://x.com/b');
    expect(calls).toEqual(['insert 1 A', 'insert 1 B', 'remove 1 A']);
  });

  it('retire le CSS quand il n’y a plus rien à masquer', async () => {
    const { injector, calls } = setup({ 'https://x.com/a': 'A' });
    await injector.apply(1, 'https://x.com/a');
    await injector.apply(1, 'https://x.com/autre');
    expect(calls).toEqual(['insert 1 A', 'remove 1 A']);
  });

  it('réinjecte dans un nouveau document', async () => {
    const { injector, calls } = setup({ 'https://x.com/a': 'A' });
    await injector.apply(1, 'https://x.com/a');
    await injector.apply(1, 'https://x.com/a', { newDocument: true });
    expect(calls).toEqual(['insert 1 A', 'remove 1 A', 'insert 1 A']);
  });

  it('garde l’ordre des opérations d’un onglet', async () => {
    const { injector, calls } = setup({ 'https://x.com/a': 'A', 'https://x.com/b': 'B' });
    await Promise.all([injector.apply(1, 'https://x.com/a'), injector.apply(1, 'https://x.com/b')]);
    expect(calls).toEqual(['insert 1 A', 'insert 1 B', 'remove 1 A']);
  });

  it('survit au redémarrage du service worker', async () => {
    const first = setup({ 'https://x.com/a': 'A', 'https://x.com/b': 'B' });
    await first.injector.apply(1, 'https://x.com/a');
    const second = setup({ 'https://x.com/a': 'A', 'https://x.com/b': 'B' });
    await second.injector.apply(1, 'https://x.com/b');
    expect(second.calls).toEqual(['insert 1 B', 'remove 1 A']);
  });

  it('met à jour tous les onglets', async () => {
    const { injector, calls } = setup({ 'https://x.com/a': 'A', 'https://x.com/b': 'B' });
    await injector.refreshAll();
    expect(calls.sort()).toEqual(['insert 1 A', 'insert 2 B']);
  });

  it('oublie un onglet fermé', async () => {
    const { injector, calls } = setup({ 'https://x.com/a': 'A' });
    await injector.apply(1, 'https://x.com/a');
    await injector.forget(1);
    await injector.apply(1, 'https://x.com/a');
    expect(calls).toEqual(['insert 1 A', 'insert 1 A']);
  });
});
