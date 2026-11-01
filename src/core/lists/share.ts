import { ListValidationError, type ListFile } from './schema';
import { EXPORT_FORMAT, MAX_IMPORT_BYTES, parseImport, toFile } from './transfer';
import { entryKey, type List } from './types';

// Partage d'une liste par un code à copier-coller, sans serveur :
// export JSON (`blindspot/lists@1`) → deflate-raw → base64url, précédé d'un préfixe lisible.

export const SHARE_PREFIX = 'BLINDSPOT1:';
// Un code plus long ne peut pas venir d'un export de 5 Mo (le base64 ajoute un tiers).
const MAX_CODE_LENGTH = Math.ceil((MAX_IMPORT_BYTES * 4) / 3) + SHARE_PREFIX.length;
// Revalidation stricte des handles partagés : ils finissent dans des sélecteurs CSS.
const SAFE_HANDLE = /^[a-z0-9_]{1,64}$/;

export interface ShareOptions {
  /** Comptes seulement : sans notes ni dates, pour un code plus court. */
  accountsOnly?: boolean;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(text) || text.length % 4 === 1) {
    throw new ListValidationError('Code de partage invalide (caractères inattendus)');
  }
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function compress(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Décompresse en bornant la taille de sortie (protection contre les bombes de décompression). */
async function decompress(bytes: Uint8Array, maxBytes: number): Promise<Uint8Array> {
  const reader = new Blob([bytes as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
    .getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) {
        void reader.cancel().catch(() => undefined);
        throw new ListValidationError('Code de partage trop volumineux (5 Mo maximum)');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ListValidationError) throw error;
    throw new ListValidationError('Code de partage corrompu ou incomplet');
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Comptes partagés d'une liste : ceux que l'utilisateur masque réellement. */
function sharedFile(list: List, { accountsOnly = false }: ShareOptions): object {
  const excluded = new Set(list.excluded);
  const file = toFile({ ...list, entries: list.entries.filter((e) => !excluded.has(entryKey(e))) });
  if (!accountsOnly) return file;
  return {
    ...file,
    entries: file.entries.map(({ platform, handle, userId }) => ({
      platform,
      handle,
      ...(userId && { userId }),
    })),
  };
}

/** Code de partage d'une liste, à copier dans le presse-papiers. */
export async function encodeShareCode(list: List, options: ShareOptions = {}): Promise<string> {
  const json = JSON.stringify({ format: EXPORT_FORMAT, lists: [sharedFile(list, options)] });
  return SHARE_PREFIX + toBase64Url(await compress(json));
}

/**
 * Lit un code de partage. Lève `ListValidationError` avec un message lisible,
 * quelle que soit la façon dont le code est abîmé.
 */
export async function decodeShareCode(input: string): Promise<ListFile> {
  // Les messageries coupent parfois les longues chaînes : on ignore les espaces.
  const code = input.replace(/\s+/g, '');
  if (!code) throw new ListValidationError('Code de partage vide');
  if (!code.startsWith(SHARE_PREFIX)) {
    throw new ListValidationError(
      `Code de partage inconnu : il doit commencer par « ${SHARE_PREFIX} »`,
    );
  }
  if (code.length > MAX_CODE_LENGTH) {
    throw new ListValidationError('Code de partage trop volumineux (5 Mo maximum)');
  }
  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(code.slice(SHARE_PREFIX.length));
  } catch (error) {
    if (error instanceof ListValidationError) throw error;
    throw new ListValidationError('Code de partage invalide');
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(
      await decompress(bytes, MAX_IMPORT_BYTES),
    );
  } catch (error) {
    if (error instanceof ListValidationError) throw error;
    throw new ListValidationError('Code de partage corrompu ou incomplet');
  }
  let files: ListFile[];
  try {
    files = parseImport(text, 'partage.json');
  } catch (error) {
    if (!(error instanceof ListValidationError)) throw error;
    throw new ListValidationError(`Code de partage invalide : ${error.message}`);
  }
  const [file] = files;
  if (!file || files.length !== 1) {
    throw new ListValidationError('Code de partage invalide : une seule liste attendue');
  }
  const unsafe = file.entries.find((e) => !SAFE_HANDLE.test(e.handle));
  if (unsafe)
    throw new ListValidationError(`Code de partage invalide : handle « ${unsafe.handle} »`);
  return file;
}
