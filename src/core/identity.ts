import type { IdentityMessage } from './messages';
import type { PlatformAdapter } from './platform';

/**
 * Observe les pages profil et remonte le couple handle / userId au background.
 * Lecture seule : un MutationObserver ne laisse aucune trace visible par la page.
 */
export function watchIdentity(
  adapter: PlatformAdapter,
  send: (message: IdentityMessage) => void,
  doc: Document = document,
): () => void {
  const extractUserId = adapter.extractUserId;
  if (!extractUserId) return () => undefined;
  let sent = '';
  let scheduled = false;

  const check = () => {
    scheduled = false;
    const profile = adapter.extractProfileFromUrl(doc.location.href);
    if (!profile) return;
    const userId = extractUserId(doc);
    const key = `${profile.handle}:${userId}`;
    if (!userId || key === sent) return;
    sent = key;
    send({ type: 'blindspot:identity', platform: adapter.id, handle: profile.handle, userId });
  };

  // Les mutations de X sont très fréquentes : une vérification au plus par seconde.
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(check, 1000);
  });
  // `document` plutôt que `documentElement`, qui peut ne pas exister à document_start.
  observer.observe(doc, { childList: true, subtree: true });
  return () => observer.disconnect();
}
