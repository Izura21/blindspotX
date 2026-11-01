import { describe, expect, it } from 'vitest';
import { BUNDLED_LISTS } from './bundled';
import { dedupe, ListValidationError, parseEntry, parseListFile } from './schema';

const NOW = '2026-10-28T00:00:00.000Z';

describe('parseEntry', () => {
  it('normalise le handle avec l’adapter de la plateforme', () => {
    expect(parseEntry({ platform: 'x', handle: '@SomeOne' }, 'e', NOW)).toEqual({
      platform: 'x',
      handle: 'someone',
      addedAt: NOW,
    });
  });

  it('conserve userId et note', () => {
    const entry = parseEntry({ platform: 'x', handle: 'a', userId: '42', note: 'n' }, 'e', NOW);
    expect(entry).toMatchObject({ userId: '42', note: 'n' });
  });

  it.each([
    [null, 'objet attendu'],
    [{ platform: 'myspace', handle: 'a' }, 'plateforme inconnue'],
    [{ platform: 'x', handle: 'pas valide' }, 'handle invalide'],
    [{ platform: 'x', handle: 'a', userId: 42 }, 'chaîne attendue'],
  ])('refuse %j', (raw, message) => {
    expect(() => parseEntry(raw, 'e')).toThrow(message);
  });
});

describe('parseListFile', () => {
  const valid = {
    id: 'ma-liste',
    name: ' Ma liste ',
    version: 2,
    entries: [
      { platform: 'x', handle: 'a' },
      { platform: 'x', handle: '@A' },
    ],
  };

  it('valide, normalise et dédoublonne', () => {
    const file = parseListFile(valid);
    expect(file.name).toBe('Ma liste');
    expect(file.entries).toHaveLength(1);
  });

  it.each([
    [{ ...valid, id: 'Pas Valide' }, 'identifiant invalide'],
    [{ ...valid, name: '' }, 'nom requis'],
    [{ ...valid, version: 1.5 }, 'entier attendu'],
    [{ ...valid, entries: {} }, 'tableau attendu'],
  ])('refuse un fichier invalide (%#)', (raw, message) => {
    expect(() => parseListFile(raw)).toThrow(ListValidationError);
    expect(() => parseListFile(raw)).toThrow(message);
  });
});

describe('dedupe', () => {
  it('dédoublonne par handle et par userId', () => {
    const entries = dedupe([
      { platform: 'x', handle: 'a', userId: '1', addedAt: NOW },
      { platform: 'x', handle: 'b', userId: '1', addedAt: NOW },
      { platform: 'x', handle: 'a', addedAt: NOW },
      { platform: 'youtube', handle: 'a', addedAt: NOW },
    ]);
    expect(entries.map((e) => `${e.platform}:${e.handle}`)).toEqual(['x:a', 'youtube:a']);
  });
});

describe('listes packagées', () => {
  it('contient les 2 listes par défaut, valides', () => {
    expect(BUNDLED_LISTS.map((l) => l.id)).toEqual(['politiques-droite-ed']);
  });
});
