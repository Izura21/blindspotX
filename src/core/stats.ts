import { storage } from 'wxt/utils/storage';

// Compteur de posts ignorés. Local uniquement, jamais transmis.

const totalItem = storage.defineItem<number>('local:ignoredTotal', { fallback: 0, version: 1 });
/** Depuis le démarrage du navigateur. */
const sessionItem = storage.defineItem<number>('session:ignoredSession', { fallback: 0 });

export interface Stats {
  session: number;
  total: number;
}

let queue: Promise<unknown> = Promise.resolve();

export function recordIgnored(count: number): Promise<void> {
  const run = queue.then(async () => {
    const [total, session] = await Promise.all([totalItem.getValue(), sessionItem.getValue()]);
    await Promise.all([totalItem.setValue(total + count), sessionItem.setValue(session + count)]);
  });
  queue = run.catch(() => undefined);
  return run;
}

export async function getStats(): Promise<Stats> {
  const [total, session] = await Promise.all([totalItem.getValue(), sessionItem.getValue()]);
  return { total, session };
}

export function watchStats(callback: () => void): () => void {
  const unwatchers = [totalItem.watch(callback), sessionItem.watch(callback)];
  return () => unwatchers.forEach((unwatch) => unwatch());
}
