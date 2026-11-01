import { describe, expect, it } from 'vitest';
import { compileLookup } from './lookup';
import type { List } from './types';

const NOW = '2026-10-28T00:00:00.000Z';

function list(id: string, handles: string[], extra: Partial<List> = {}): List {
  return {
    id,
    name: id,
    source: 'user',
    enabled: true,
    excluded: [],
    entries: handles.map((handle) => ({ platform: 'x', handle, addedAt: NOW })),
    ...extra,
  };
}

describe('compileLookup', () => {
  it('fusionne les listes actives', () => {
    const lookup = compileLookup([list('a', ['un', 'deux']), list('b', ['deux', 'trois'])]);
    expect(lookup.handles('x')).toEqual(['deux', 'trois', 'un']);
    expect(lookup.listsOf('x', 'deux')).toEqual(['a', 'b']);
    expect(lookup.has('x', 'un')).toBe(true);
    expect(lookup.has('youtube', 'un')).toBe(false);
  });

  it('ignore les listes désactivées', () => {
    const lookup = compileLookup([list('a', ['un'], { enabled: false })]);
    expect(lookup.handles('x')).toEqual([]);
  });

  it('applique les exclusions', () => {
    const lookup = compileLookup([list('a', ['un', 'deux'], { excluded: ['x:h:un'] })]);
    expect(lookup.handles('x')).toEqual(['deux']);
  });

  it('suit le handle courant d’un userId', () => {
    const base = list('a', []);
    base.entries = [{ platform: 'x', handle: 'ancien', userId: '42', addedAt: NOW }];
    const lookup = compileLookup([base], { 'x:42': 'nouveau' });
    expect(lookup.handles('x')).toEqual(['nouveau']);
  });
});
