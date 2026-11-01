import { describe, expect, it } from 'vitest';
import { adapterForUrl, getAdapter } from './registry';

describe('registry', () => {
  it('expose l’adapter X', () => {
    expect(getAdapter('x')?.id).toBe('x');
  });

  it('trouve l’adapter à partir d’une URL', () => {
    expect(adapterForUrl('https://x.com/home')?.id).toBe('x');
    expect(adapterForUrl('https://twitter.com/someone')?.id).toBe('x');
    expect(adapterForUrl('https://mobile.x.com/home')?.id).toBe('x');
  });

  it('ignore les autres sites et les URL invalides', () => {
    expect(adapterForUrl('https://example.com/')).toBeUndefined();
    expect(adapterForUrl('https://notx.com/')).toBeUndefined();
    expect(adapterForUrl('pas une url')).toBeUndefined();
  });
});
