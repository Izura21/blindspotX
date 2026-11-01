import {
  DEFAULT_OVERLAY_COLORS,
  overlayColorRule,
  overlayLabelRule,
  overlayRules,
} from '../../core/css';
import type { HideOptions } from '../../core/platform';
import { handleFromUrl } from './handle';
import { SELECTORS as S, THEMES } from './selectors';

/** Liens vers les profils listés. Les handles sont validés (`[a-z0-9_]`), sans échappement. */
function profileLinks(handles: readonly string[]): string {
  return `:is(${handles.map((h) => `a[href="/${h}" i]`).join(', ')})`;
}

/** Avatars des comptes listés (seul moyen d'identifier l'auteur d'un post cité). */
function avatars(handles: readonly string[]): string {
  return `:is(${handles.map((h) => `[data-testid="${S.avatarPrefix}${h}" i]`).join(', ')})`;
}

/** Bloc auteur du post lui-même, pas celui d'un post cité. */
const MAIN_AUTHOR = `${S.userName}:not(${S.quote} ${S.userName})`;

/**
 * Couleurs de l'encart selon le thème de X, lu sur le style inline du body. Portées par les
 * règles de l'encart : rien n'est posé sur `:root`. Le thème clair est le défaut.
 */
function themeRules(selectors: readonly string[]): string {
  return THEMES.filter(
    (t) =>
      t.bg !== DEFAULT_OVERLAY_COLORS.bg ||
      t.fg !== DEFAULT_OVERLAY_COLORS.fg ||
      t.border !== DEFAULT_OVERLAY_COLORS.border,
  )
    .map((t) =>
      overlayColorRule(
        selectors,
        `:root:has(> ${S.body}[style*="background-color: ${t.bodyBackground}"])`,
        t,
      ),
    )
    .join('');
}

function isConversationPage(url: URL): boolean {
  return /^\/[^/]+\/status\/\d+/.test(url.pathname);
}

/** Sélecteurs des éléments à masquer pour un groupe de handles. */
function targets(handles: readonly string[], options: HideOptions, url: URL | null): string[] {
  const links = profileLinks(handles);
  const selectors: string[] = [];
  // Réponses désactivées : rien n'est masqué sur les pages de conversation.
  if (options.replies || !url || !isConversationPage(url)) {
    selectors.push(`${S.cell}:has(${MAIN_AUTHOR} ${links})`);
    // Reposts faits par un compte listé. Le repost d'un post de compte listé est déjà
    // couvert par la règle d'auteur.
    if (options.reposts) selectors.push(`${S.cell}:has(${links} ${S.socialContext})`);
  }
  // Post cité : seul le bloc cité est masqué. X imbrique au plus une citation dans une
  // citation : on ne masque que le bloc dont l'auteur est listé, pas celui qui le contient.
  if (options.quotes) {
    const listed = avatars(handles);
    const nested = `${S.quote} ${S.quote}`;
    selectors.push(
      `${S.tweet} ${S.quote}:not(${nested}):has(${listed}:not(${nested} *))`,
      `${S.tweet} ${nested}:has(${listed})`,
    );
  }
  return selectors;
}

function parseUrl(pageUrl: string | undefined): URL | null {
  try {
    return pageUrl ? new URL(pageUrl) : null;
  } catch {
    return null;
  }
}

/** Handles effectivement masqués sur la page (option « profil du compte »). */
function visibleHandles(
  handles: readonly string[],
  options: HideOptions,
  url: URL | null,
): readonly string[] {
  const profile = url && !options.onTargetProfile ? handleFromUrl(url.href) : null;
  return profile ? handles.filter((h) => h !== profile) : handles;
}

/**
 * Sélecteurs des éléments masqués sur la page `pageUrl`. Source unique du CSS de masquage
 * et des gardes du content script (`core/hidden.ts`) : les deux ne peuvent pas diverger.
 */
export function xHiddenSelectors(
  handles: readonly string[],
  options: HideOptions,
  pageUrl?: string,
): string[] {
  const url = parseUrl(pageUrl);
  const visible = visibleHandles(handles, options, url);
  return visible.length ? targets(visible, options, url) : [];
}

/** Feuille de style de masquage pour X. Vide si rien à masquer. */
export function buildXCss(
  handles: readonly string[],
  options: HideOptions,
  pageUrl?: string,
): string {
  const selectors = xHiddenSelectors(handles, options, pageUrl);
  if (selectors.length === 0) return '';

  let css = overlayRules(selectors, options.style) + themeRules(selectors);
  if (options.showLabel) {
    const url = parseUrl(pageUrl);
    css += visibleHandles(handles, options, url)
      .map((h) => overlayLabelRule(targets([h], options, url), `Masqué · @${h}`))
      .join('');
  }
  return css;
}
