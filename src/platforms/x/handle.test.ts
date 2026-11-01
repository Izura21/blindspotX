import { describe, expect, it } from 'vitest';
import { handleFromUrl, normalizeXHandle } from './handle';

describe('normalizeXHandle', () => {
  it.each([
    ['Handle', 'handle'],
    ['@Handle_42', 'handle_42'],
    ['  @abc  ', 'abc'],
    ['https://x.com/SomeOne', 'someone'],
    ['https://twitter.com/someone/status/123', 'someone'],
    ['x.com/someone', 'someone'],
    ['https://mobile.x.com/someone', 'someone'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeXHandle(input)).toBe(expected);
  });

  it.each(['', '@', 'a b', 'trop_long_pour_x_123', 'hé', 'https://x.com/home', 'https://x.com/'])(
    'refuse %j',
    (input) => {
      expect(normalizeXHandle(input)).toBeNull();
    },
  );
});

describe('handleFromUrl', () => {
  it('ignore les pages qui ne sont pas des profils', () => {
    expect(handleFromUrl('https://x.com/home')).toBeNull();
    expect(handleFromUrl('https://x.com/i/lists/1')).toBeNull();
    expect(handleFromUrl('https://x.com/search?q=a')).toBeNull();
  });

  it('ignore les autres sites', () => {
    expect(handleFromUrl('https://example.com/someone')).toBeNull();
  });
});
