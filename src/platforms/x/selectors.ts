// Sélecteurs du DOM de X, centralisés ici (FR-008) : X change son DOM sans préavis.
//
// Validés sur le vrai x.com le 2026-10-28 : cellule, post,
// auteur, avatar, citation, repost, permalien, thème. Toute casse se corrige dans ce fichier.

export const SELECTORS = {
  /** Cellule de fil virtualisé (post, séparateur, « Afficher plus »…). Positionnée par X. */
  cell: '[data-testid="cellInnerDiv"]',
  /** Post. */
  tweet: 'article[data-testid="tweet"]',
  /** Bloc nom + @handle de l'auteur. Contient des liens `a[href="/handle"]`. */
  userName: '[data-testid="User-Name"]',
  /** Bloc d'un post cité, à l'intérieur d'un post. Ne contient aucun lien vers le profil. */
  quote: 'div[role="link"]',
  /** Préfixe de l'avatar d'un auteur : `data-testid="UserAvatar-Container-<handle>"`. */
  avatarPrefix: 'UserAvatar-Container-',
  /** « X a reposté » : texte à l'intérieur du lien vers le profil du reposteur. */
  socialContext: '[data-testid="socialContext"]',
  /**
   * Bouton S'abonner / Se désabonner de l'en-tête d'un profil : `data-testid="<userId>-follow"`.
   * Absent sur son propre profil.
   */
  profileFollowButton:
    '[data-testid="placementTracking"] :is([data-testid$="-follow"], [data-testid$="-unfollow"])',
  /** Bouton « … » d'un post, qui ouvre son menu. */
  caret: '[data-testid="caret"]',
  /** Menu ouvert (dans `#layers`), pour un post ou un profil. */
  menu: '#layers [role="menu"]',
  /** Carte affichée au survol d'un nom ou d'un avatar. */
  /** Bouton « … » de l'en-tête d'un profil. */
  profileActions: '[data-testid="userActions"]',
  /** Lien permanent d'un post (`/handle/status/<id>`), qui contient sa date. */
  permalink: 'a[href*="/status/"]:has(> time)',
  /** Body : X y met la couleur de fond du thème en style inline. */
  body: 'body',
} as const;

/** Couleurs de fond des thèmes X (style inline du body) → couleurs de l'encart. */
export const THEMES = [
  { bodyBackground: 'rgb(255, 255, 255)', bg: '#ffffff', fg: '#536471', border: '#eff3f4' },
  { bodyBackground: 'rgb(21, 32, 43)', bg: '#15202b', fg: '#8b98a5', border: '#38444d' },
  { bodyBackground: 'rgb(0, 0, 0)', bg: '#000000', fg: '#71767b', border: '#2f3336' },
] as const;
