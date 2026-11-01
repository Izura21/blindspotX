// Codes de partage dans de vrais moteurs : `CompressionStream('deflate-raw')` et les
// erreurs de `DecompressionStream` (code tronqué, corrompu) diffèrent selon les navigateurs.
import { describe, expect, it } from 'vitest';
import { ListValidationError } from './schema';
import { decodeShareCode, encodeShareCode, SHARE_PREFIX } from './share';
import type { List } from './types';

const list: List = {
  id: 'user-1',
  name: 'Perso',
  source: 'user',
  enabled: true,
  excluded: [],
  entries: Array.from({ length: 200 }, (_, i) => ({
    platform: 'x' as const,
    handle: `compte_${i}`,
    addedAt: '2026-10-28T00:00:00.000Z',
    note: `Note ${i}`,
  })),
};

describe('code de partage (navigateur)', () => {
  it('fait l’aller-retour', async () => {
    const file = await decodeShareCode(await encodeShareCode(list));
    expect(file.entries).toEqual(list.entries);
  });

  it('refuse un code tronqué ou corrompu avec un message clair', async () => {
    const code = await encodeShareCode(list);
    for (const broken of [
      code.slice(0, code.length / 2),
      code.slice(0, -3),
      `${SHARE_PREFIX}${'_'.repeat(40)}`,
    ]) {
      await expect(decodeShareCode(broken)).rejects.toThrow(ListValidationError);
    }
  });

  it('borne la taille décompressée', async () => {
    const stream = new Blob([' '.repeat(6 * 1024 * 1024)])
      .stream()
      .pipeThrough(new CompressionStream('deflate-raw'));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const bomb = SHARE_PREFIX + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_');
    await expect(decodeShareCode(bomb.replace(/=+$/, ''))).rejects.toThrow('volumineux');
  });
});
