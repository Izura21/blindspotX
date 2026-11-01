import type { HiddenTest } from './hidden';
import type { PlatformAdapter } from './platform';

/**
 * Compte les posts masqués réellement passés à l'écran, une fois par post.
 * Lecture seule : MutationObserver + IntersectionObserver, invisibles pour la page.
 * Les compteurs partent par lots pour éviter un message par post.
 */
export function watchIgnored(
  adapter: PlatformAdapter,
  isHidden: HiddenTest,
  send: (count: number) => void,
  { flushMs = 5000, doc = document }: { flushMs?: number; doc?: Document } = {},
): () => void {
  const extractItemId = adapter.extractItemId;
  if (!extractItemId) return () => undefined;
  const counted = new Set<string>();
  let pending = 0;

  const visibility = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || !isHidden(entry.target)) continue;
        const id = extractItemId(entry.target);
        if (!id || counted.has(id)) continue;
        counted.add(id);
        pending++;
      }
    },
    { threshold: 0.5 },
  );

  const observeItems = (root: Element) => {
    if (root.matches(adapter.itemSelector)) visibility.observe(root);
    root.querySelectorAll(adapter.itemSelector).forEach((item) => visibility.observe(item));
  };

  const mutations = new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (node instanceof Element) observeItems(node);
      });
    }
  });
  mutations.observe(doc, { childList: true, subtree: true });
  if (doc.documentElement) observeItems(doc.documentElement);

  const flush = () => {
    if (pending === 0) return;
    send(pending);
    pending = 0;
  };
  const timer = setInterval(flush, flushMs);
  const onHide = () => {
    if (doc.visibilityState === 'hidden') flush();
  };
  doc.addEventListener('visibilitychange', onHide);

  return () => {
    flush();
    clearInterval(timer);
    doc.removeEventListener('visibilitychange', onHide);
    mutations.disconnect();
    visibility.disconnect();
  };
}
