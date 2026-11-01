import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { BUNDLED_LISTS } from './bundled';
import { ListValidationError } from './schema';
import { decodeShareCode, encodeShareCode, SHARE_PREFIX } from './share';
import { MAX_IMPORT_BYTES } from './transfer';
import type { Entry, List } from './types';

const NOW = '2026-10-28T00:00:00.000Z';

const list = (patch: Partial<List> = {}): List => ({
  id: 'user-1',
  name: 'Perso',
  description: 'Mes comptes',
  source: 'user',
  enabled: true,
  excluded: [],
  entries: [
    { platform: 'x', handle: 'un', userId: '1', addedAt: NOW },
    { platform: 'x', handle: 'deux', note: 'une note', addedAt: NOW },
  ],
  ...patch,
});

/** Code brut : JSON quelconque compressé puis encodé, comme le ferait un code forgé. */
async function forge(payload: string | Uint8Array, compress = true): Promise<string> {
  const raw = typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;
  const bytes = compress
    ? new Uint8Array(
        await new Response(
          new Blob([raw as Uint8Array<ArrayBuffer>])
            .stream()
            .pipeThrough(new CompressionStream('deflate-raw')),
        ).arrayBuffer(),
      )
    : raw;
  const binary = String.fromCharCode(...bytes);
  return SHARE_PREFIX + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const handles = (n: number): Entry[] =>
  Array.from({ length: n }, (_, i) => ({
    platform: 'x',
    handle: `compte_${i}`,
    addedAt: NOW,
    note: `Note ${i}`,
  }));

/** Comptes plausibles (générateur pseudo-aléatoire déterministe) : handle, userId, note, date. */
function realistic(n: number): Entry[] {
  let seed = 42;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const pick = (chars: string, length: number) =>
    Array.from({ length }, () => chars[Math.floor(random() * chars.length)]).join('');
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  return Array.from({ length: n }, (_, i) => ({
    platform: 'x',
    handle: `${pick(letters, 4 + Math.floor(random() * 8))}${i}`.slice(0, 15),
    userId: `${pick('0123456789', 8 + Math.floor(random() * 10))}${i}`,
    addedAt: new Date(Date.parse(NOW) - Math.floor(random() * 3e10)).toISOString(),
    note: `${pick(letters, 6)} ${pick(letters, 8)} — ${['député', 'militant', 'éditorialiste'][i % 3]}`,
  }));
}

beforeEach(() => {
  fakeBrowser.reset();
});

describe('code de partage', () => {
  it('fait l’aller-retour', async () => {
    const code = await encodeShareCode(list());
    expect(code.startsWith(SHARE_PREFIX)).toBe(true);
    expect(code.slice(SHARE_PREFIX.length)).toMatch(/^[A-Za-z0-9_-]+$/);
    const file = await decodeShareCode(code);
    expect(file.name).toBe('Perso');
    expect(file.description).toBe('Mes comptes');
    expect(file.entries).toEqual(list().entries);
  });

  it('option « comptes seulement » : sans notes ni dates, code plus court', async () => {
    const full = await encodeShareCode(list({ entries: handles(50) }));
    const short = await encodeShareCode(list({ entries: handles(50) }), { accountsOnly: true });
    expect(short.length).toBeLessThan(full.length);
    const file = await decodeShareCode(short);
    expect(file.entries).toHaveLength(50);
    expect(file.entries.every((e) => !e.note && e.addedAt !== NOW)).toBe(true);
    const withId = await decodeShareCode(await encodeShareCode(list(), { accountsOnly: true }));
    expect(withId.entries[0]?.userId).toBe('1');
  });

  it('ne partage pas les comptes exclus localement d’une liste par défaut', async () => {
    const bundled = list({ id: 'politiques', source: 'bundled', excluded: ['x:id:1'] });
    const file = await decodeShareCode(await encodeShareCode(bundled));
    expect(file.entries.map((e) => e.handle)).toEqual(['deux']);
  });

  it('tolère les espaces et retours à la ligne ajoutés par une messagerie', async () => {
    const code = await encodeShareCode(list());
    const wrapped = `  ${code.slice(0, 20)}\n${code.slice(20, 40)} ${code.slice(40)}\n`;
    expect((await decodeShareCode(wrapped)).entries).toHaveLength(2);
  });

  it('refuse un code vide ou au préfixe inconnu', async () => {
    await expect(decodeShareCode('  ')).rejects.toThrow('vide');
    await expect(decodeShareCode('AM1:abc')).rejects.toThrow('BLINDSPOT1:');
    await expect(decodeShareCode('bonjour')).rejects.toThrow(ListValidationError);
  });

  it('refuse un base64 invalide', async () => {
    await expect(decodeShareCode(`${SHARE_PREFIX}abc$%`)).rejects.toThrow('invalide');
    await expect(decodeShareCode(`${SHARE_PREFIX}abcde`)).rejects.toThrow('invalide');
    await expect(decodeShareCode(`${SHARE_PREFIX}ab+/`)).rejects.toThrow('invalide');
  });

  it('refuse un code corrompu ou tronqué', async () => {
    const code = await encodeShareCode(list({ entries: handles(100) }));
    await expect(decodeShareCode(code.slice(0, code.length / 2))).rejects.toThrow(
      ListValidationError,
    );
    await expect(decodeShareCode(code.slice(0, -4))).rejects.toThrow(ListValidationError);
    const corrupted = await forge(new Uint8Array([0xff, 0xfe, 0xfd, 0xfc, 0x00, 0x01]), false);
    await expect(decodeShareCode(corrupted)).rejects.toThrow('corrompu');
    // Un octet modifié au milieu : erreur de décompression, d'UTF-8 ou de schéma, jamais d'exception brute.
    const middle = code.length - 30;
    const flipped =
      code.slice(0, middle) + (code[middle] === 'A' ? 'B' : 'A') + code.slice(middle + 1);
    await expect(decodeShareCode(flipped)).rejects.toThrow(ListValidationError);
  });

  it('borne la taille décompressée (bombe de décompression)', async () => {
    const bomb = await forge(' '.repeat(MAX_IMPORT_BYTES + 1024));
    expect(bomb.length).toBeLessThan(20_000);
    await expect(decodeShareCode(bomb)).rejects.toThrow('volumineux');
  });

  it('refuse un code trop long avant même de le décoder', async () => {
    await expect(decodeShareCode(SHARE_PREFIX + 'A'.repeat(8 * 1024 * 1024))).rejects.toThrow(
      'volumineux',
    );
  });

  it('valide le schéma et revalide les handles', async () => {
    await expect(decodeShareCode(await forge('pas du json'))).rejects.toThrow('JSON invalide');
    await expect(
      decodeShareCode(await forge(JSON.stringify({ format: 'autre', lists: [] }))),
    ).rejects.toThrow('Format');
    const entries = (handle: string) =>
      JSON.stringify({
        format: 'blindspot/lists@1',
        lists: [{ id: 'a', name: 'A', version: 1, entries: [{ platform: 'x', handle }] }],
      });
    await expect(decodeShareCode(await forge(entries('a"],*{}')))).rejects.toThrow(
      ListValidationError,
    );
    // Plateforme sans adapter : la normalisation de repli ne suffit pas, le handle est revalidé.
    const youtube = JSON.stringify({
      format: 'blindspot/lists@1',
      lists: [
        { id: 'a', name: 'A', version: 1, entries: [{ platform: 'youtube', handle: 'a"]{}' }] },
      ],
    });
    await expect(decodeShareCode(await forge(youtube))).rejects.toThrow('handle');
    const two = JSON.stringify({
      format: 'blindspot/lists@1',
      lists: [
        { id: 'a', name: 'A', version: 1, entries: [] },
        { id: 'b', name: 'B', version: 1, entries: [] },
      ],
    });
    await expect(decodeShareCode(await forge(two))).rejects.toThrow('une seule liste');
  });

  it('accepte l’ancien format angle-mort/lists@1', async () => {
    const legacy = JSON.stringify({
      format: 'angle-mort/lists@1',
      lists: [{ id: 'a', name: 'A', version: 1, entries: [{ platform: 'x', handle: 'z' }] }],
    });
    expect((await decodeShareCode(await forge(legacy))).entries).toHaveLength(1);
  });

  it('longueur du code pour 300 et 1 000 comptes', async () => {
    const lengths: Record<string, [number, number]> = {};
    const measure = async (label: string, entries: Entry[]) => {
      const big = list({ entries });
      const full = await encodeShareCode(big);
      const short = await encodeShareCode(big, { accountsOnly: true });
      expect((await decodeShareCode(full)).entries).toHaveLength(entries.length);
      expect(short.length).toBeLessThan(full.length);
      lengths[label] = [full.length, short.length];
    };
    await measure(`liste fournie (${BUNDLED_LISTS[0]!.entries.length})`, BUNDLED_LISTS[0]!.entries);
    await measure('300 aléatoires', realistic(300));
    await measure('1000 aléatoires', realistic(1000));
    console.info('Longueur des codes [complet, comptes seulement] :', lengths);
  });
});
