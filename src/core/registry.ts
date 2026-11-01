import { xAdapter } from '../platforms/x/adapter';
import type { PlatformAdapter, PlatformId } from './platform';

const adapters: Partial<Record<PlatformId, PlatformAdapter>> = {
  x: xAdapter,
};

export function getAdapter(id: PlatformId): PlatformAdapter | undefined {
  return adapters[id];
}

export function listAdapters(): PlatformAdapter[] {
  return Object.values(adapters);
}

/** Adapter dont un match pattern couvre l'URL. */
export function adapterForUrl(url: string): PlatformAdapter | undefined {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return undefined;
  }
  return listAdapters().find((a) =>
    a.matches.some((pattern) => {
      const patternHost = pattern.replace(/^\*:\/\//, '').replace(/\/.*$/, '');
      return patternHost.startsWith('*.')
        ? host === patternHost.slice(2) || host.endsWith(patternHost.slice(1))
        : host === patternHost;
    }),
  );
}
