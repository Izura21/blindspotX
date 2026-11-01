import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { addEntry, createList, getLists, importList } from './repository';
import { ListValidationError } from './schema';
import {
  EXPORT_FORMAT,
  exportCsv,
  exportJson,
  parseCsv,
  parseImport,
  previewImport,
} from './transfer';
import type { List } from './types';

const NOW = '2026-10-28T00:00:00.000Z';

const list = (patch: Partial<List> = {}): List => ({
  id: 'user-1',
  name: 'Perso',
  source: 'user',
  enabled: true,
  excluded: [],
  entries: [
    { platform: 'x', handle: 'un', userId: '1', addedAt: NOW },
    { platform: 'x', handle: 'deux', note: 'virgule, "guillemets"', addedAt: NOW },
  ],
  ...patch,
});

beforeEach(() => {
  fakeBrowser.reset();
});

describe('export / import JSON', () => {
  it('fait l’aller-retour', () => {
    const [file] = parseImport(exportJson([list()]), 'export.json');
    expect(file?.name).toBe('Perso');
    expect(file?.entries).toEqual(list().entries);
  });

  it('accepte un fichier de liste seul', () => {
    const raw = JSON.stringify({
      id: 'a',
      name: 'A',
      version: 1,
      entries: [{ platform: 'x', handle: 'z' }],
    });
    expect(parseImport(raw, 'a.json')[0]?.entries).toHaveLength(1);
  });

  it('refuse un JSON invalide, un format inconnu ou un fichier trop gros', () => {
    expect(() => parseImport('{', 'a.json')).toThrow('JSON invalide');
    expect(() => parseImport(JSON.stringify({ format: 'autre', lists: [] }), 'a.json')).toThrow(
      'Format',
    );
    expect(() => parseImport('x'.repeat(5 * 1024 * 1024 + 1), 'a.json')).toThrow('volumineux');
  });

  it('valide chaque entrée', () => {
    const raw = JSON.stringify({
      format: EXPORT_FORMAT,
      lists: [
        { id: 'a', name: 'A', version: 1, entries: [{ platform: 'x', handle: 'pas valide' }] },
      ],
    });
    expect(() => parseImport(raw, 'a.json')).toThrow(ListValidationError);
  });
});

describe('export / import CSV', () => {
  it('échappe guillemets et virgules, et fait l’aller-retour', () => {
    const csv = exportCsv([list()]);
    expect(csv).toContain('"virgule, ""guillemets"""');
    const [file] = parseImport(csv, 'export.csv');
    expect(file?.name).toBe('Perso');
    expect(file?.entries.map((e) => [e.handle, e.userId, e.note])).toEqual([
      ['un', '1', undefined],
      ['deux', undefined, 'virgule, "guillemets"'],
    ]);
  });

  it('neutralise les formules de tableur', () => {
    const csv = exportCsv([
      list({ entries: [{ platform: 'x', handle: 'a', note: '=CMD()', addedAt: NOW }] }),
    ]);
    expect(csv).toContain("'=CMD()");
    expect(parseImport(csv, 'a.csv')[0]?.entries[0]?.note).toBe('=CMD()');
  });

  it('regroupe par colonne list, sinon utilise le nom du fichier', () => {
    const files = parseImport('handle,platform\n@A,x\nb,x\n', 'mes comptes.csv');
    expect(files.map((f) => [f.name, f.entries.length])).toEqual([['mes comptes', 2]]);
    const grouped = parseImport('platform,handle,list\nx,a,Un\nx,b,Deux\n', 'f.csv');
    expect(grouped.map((f) => f.name)).toEqual(['Un', 'Deux']);
  });

  it('exige les colonnes platform et handle', () => {
    expect(() => parseImport('handle\na\n', 'f.csv')).toThrow('obligatoires');
  });

  it('indique la ligne fautive', () => {
    expect(() => parseImport('platform,handle\nx,ok\nx,pas valide\n', 'f.csv')).toThrow('ligne 3');
  });

  it('parseCsv gère BOM, CRLF et retours à la ligne entre guillemets', () => {
    expect(parseCsv('a,b\r\n"1\n2",3\r\n')).toEqual([
      ['a', 'b'],
      ['1\n2', '3'],
    ]);
  });
});

describe('importList', () => {
  it('crée une nouvelle liste ou fusionne dans une liste existante', async () => {
    const [file] = parseImport('platform,handle\nx,a\nx,b\n', 'Import.csv');
    const created = await importList(file!);
    expect(created.added).toBe(2);

    const target = await createList('Cible');
    await addEntry(target, { platform: 'x', handle: 'a' });
    const targetList = (await getLists()).find((l) => l.id === target);
    expect(previewImport(file!, targetList)).toEqual({ added: 1, duplicates: 1 });
    expect((await importList(file!, target)).added).toBe(1);
  });

  it('refuse d’importer dans une liste par défaut', async () => {
    const [file] = parseImport('platform,handle\nx,a\n', 'f.csv');
    await expect(importList(file!, 'politiques-droite-ed')).rejects.toThrow('par défaut');
  });
});
