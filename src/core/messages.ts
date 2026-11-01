import type { PlatformId } from './platform';

/** Envoyé par le content script au démarrage de chaque page (document_start). */
export interface ReadyMessage {
  type: 'blindspot:ready';
}

export function isReadyMessage(message: unknown): message is ReadyMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'blindspot:ready'
  );
}

/** Envoyé par le content script quand il lit l'identifiant stable d'un profil. */
export interface IdentityMessage {
  type: 'blindspot:identity';
  platform: PlatformId;
  handle: string;
  userId: string;
}

export function isIdentityMessage(message: unknown): message is IdentityMessage {
  if (typeof message !== 'object' || message === null) return false;
  const m = message as Record<string, unknown>;
  return (
    m.type === 'blindspot:identity' &&
    typeof m.platform === 'string' &&
    typeof m.handle === 'string' &&
    typeof m.userId === 'string' &&
    /^\d{1,32}$/.test(m.userId)
  );
}

/** Posts masqués vus depuis le dernier envoi. */
export interface SeenMessage {
  type: 'blindspot:seen';
  count: number;
}

export function isSeenMessage(message: unknown): message is SeenMessage {
  if (typeof message !== 'object' || message === null) return false;
  const m = message as Record<string, unknown>;
  return (
    m.type === 'blindspot:seen' &&
    typeof m.count === 'number' &&
    Number.isInteger(m.count) &&
    m.count > 0 &&
    m.count < 10_000
  );
}
