import { afterEach, describe, expect, it, vi } from 'vitest';
import { xAdapter } from '../platforms/x/adapter';
import { watchIdentity } from './identity';
import type { PlatformAdapter } from './platform';

const header = (userId: string) =>
  `<div data-testid="placementTracking"><button data-testid="${userId}-follow">Suivre</button></div>`;

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('extractUserId (X)', () => {
  it('lit le userId du bouton S’abonner / Se désabonner de l’en-tête', () => {
    document.body.innerHTML = header('12345');
    expect(xAdapter.extractUserId?.(document)).toBe('12345');
    document.body.innerHTML =
      '<div data-testid="placementTracking"><button data-testid="99-unfollow"></button></div>';
    expect(xAdapter.extractUserId?.(document)).toBe('99');
  });

  it('ignore les autres boutons et son propre profil', () => {
    document.body.innerHTML = '<button data-testid="12345-follow"></button>';
    expect(xAdapter.extractUserId?.(document)).toBeNull();
  });
});

describe('watchIdentity', () => {
  it('remonte handle et userId une seule fois par profil', async () => {
    vi.useFakeTimers();
    // L'URL de la page de test n'est pas x.com : on fixe le profil courant.
    const adapter: PlatformAdapter = {
      ...xAdapter,
      extractProfileFromUrl: () => ({ platform: 'x', handle: 'cible' }),
    };
    const send = vi.fn();
    const stop = watchIdentity(adapter, send);

    document.body.innerHTML = header('42');
    await vi.advanceTimersByTimeAsync(1100);
    document.body.append(document.createElement('div'));
    await vi.advanceTimersByTimeAsync(1100);
    stop();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      type: 'blindspot:identity',
      platform: 'x',
      handle: 'cible',
      userId: '42',
    });
  });
});
