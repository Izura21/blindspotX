import { describe, expect, it } from 'vitest';
import { DEFAULT_HIDE_OPTIONS, type HideOptions } from '../../core/platform';
import { buildXCss } from './css';

const opts = (patch: Partial<HideOptions> = {}): HideOptions => ({
  ...DEFAULT_HIDE_OPTIONS,
  ...patch,
});

describe('buildXCss', () => {
  it('ne produit rien sans compte', () => {
    expect(buildXCss([], opts())).toBe('');
  });

  it('cible l’auteur, les reposts et les citations', () => {
    const css = buildXCss(['cible'], opts(), 'https://x.com/home');
    expect(css).toContain('a[href="/cible" i]');
    expect(css).toContain('[data-testid="socialContext"]');
    expect(css).toContain(
      'div[role="link"]:has(:is([data-testid="UserAvatar-Container-cible" i]))',
    );
    expect(css).toContain('content: "Post masqué par Blindspot" !important');
  });

  it('respecte les options reposts et citations', () => {
    const css = buildXCss(['cible'], opts({ reposts: false, quotes: false }));
    expect(css).not.toContain('socialContext');
    expect(css).not.toContain('div[role="link"]:has(');
  });

  it('ne masque rien sur une conversation si les réponses sont désactivées', () => {
    const conversation = 'https://x.com/someone/status/123';
    const css = buildXCss(['cible'], opts({ replies: false, quotes: false }), conversation);
    expect(css).toBe('');
    expect(buildXCss(['cible'], opts({ replies: false }), 'https://x.com/home')).not.toBe('');
  });

  it('peut laisser visible le profil du compte listé', () => {
    const profile = 'https://x.com/Cible/media';
    expect(buildXCss(['cible'], opts({ onTargetProfile: false }), profile)).toBe('');
    expect(buildXCss(['cible', 'autre'], opts({ onTargetProfile: false }), profile)).not.toContain(
      '"/cible"',
    );
    expect(buildXCss(['cible'], opts(), profile)).toContain('"/cible"');
  });

  it('affiche le nom du compte en option', () => {
    expect(buildXCss(['cible'], opts({ showLabel: true }))).toContain('"Masqué · @cible"');
    expect(buildXCss(['cible'], opts())).not.toContain('@cible');
  });

  it('mode compact : hauteur réduite', () => {
    expect(buildXCss(['cible'], opts({ style: 'compact' }))).toContain('height: 3rem !important');
    expect(buildXCss(['cible'], opts())).not.toContain('height: 3rem');
  });
});
