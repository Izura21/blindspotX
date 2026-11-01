export type PlatformId = 'x' | 'youtube' | 'facebook';

/** Compte identifié sur une plateforme. Le handle est toujours normalisé. */
export interface ProfileRef {
  platform: PlatformId;
  handle: string;
  userId?: string;
}

export type OverlayStyle = 'faithful' | 'compact';

/** Réglages qui influencent les règles de masquage générées. */
export interface HideOptions {
  style: OverlayStyle;
  reposts: boolean;
  quotes: boolean;
  replies: boolean;
  onTargetProfile: boolean;
  showLabel: boolean;
}

export const DEFAULT_HIDE_OPTIONS: HideOptions = {
  style: 'faithful',
  reposts: true,
  quotes: true,
  replies: true,
  onTargetProfile: true,
  showLabel: false,
};

/**
 * Tout ce qui est spécifique à une plateforme. Le cœur ne connaît que cette interface.
 */
export interface PlatformAdapter {
  id: PlatformId;
  /** Match patterns des pages où le masquage s'applique. */
  matches: readonly string[];
  /** Normalise un handle saisi par l'utilisateur (casse, `@`, URL…). `null` si invalide. */
  normalizeHandle(input: string): string | null;
  /**
   * Handles normalisés → feuille de style de masquage pour la page `pageUrl`.
   * Chaîne vide si rien à masquer.
   */
  buildCss(handles: readonly string[], options: HideOptions, pageUrl?: string): string;
  /**
   * Sélecteurs des éléments que `buildCss` masque, pour les gardes du content script
   * (`hidden.ts`, `matcher.ts`). Mêmes règles que le CSS : un élément est masqué s'il correspond à l'un
   * d'eux ou s'il est dans un tel élément.
   */
  hiddenSelectors(handles: readonly string[], options: HideOptions, pageUrl?: string): string[];
  /** URL d'une page profil (ou d'un lien vers un profil) → compte. */
  extractProfileFromUrl(url: string): ProfileRef | null;
  /** Identifiant stable du compte affiché sur la page, si lisible dans le DOM. */
  extractUserId?(doc: Document): string | null;
  /** Sélecteur d'une cellule de fil (compteur). */
  itemSelector: string;
  /** Identifiant du post contenu dans une cellule, pour ne le compter qu'une fois. */
  extractItemId?(item: Element): string | null;
  /** Touches de raccourcis d'engagement à neutraliser sur un post masqué. */
  shortcutKeys: readonly string[];
}
