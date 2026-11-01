import type { OverlayStyle } from './platform';

export const DEFAULT_LABEL = 'Post masqué par Blindspot';

/** Couleurs de l'encart. */
export interface OverlayColors {
  bg: string;
  fg: string;
  border: string;
}

/** Couleurs par défaut (thème clair de X). */
export const DEFAULT_OVERLAY_COLORS: OverlayColors = {
  bg: '#ffffff',
  fg: '#536471',
  border: '#eff3f4',
};

/** Chaîne CSS entre guillemets (pour `content`). */
export function cssString(value: string): string {
  return `"${value.replace(/[\\"]/g, '\\$&').replace(/\n/g, '\\a ')}"`;
}

function colorDeclarations({ bg, fg, border }: OverlayColors): string[] {
  return [`background: ${bg}`, `color: ${fg}`, `border-bottom: 1px solid ${border}`];
}

function block(selectors: readonly string[], declarations: readonly string[]): string {
  return `${selectors.join(',\n')} {\n${declarations.map((d) => `  ${d} !important;`).join('\n')}\n}\n`;
}

/**
 * Encart opaque posé sur les éléments masqués.
 *
 * L'élément garde sa taille et sa position (FR-009/010) : seul un pseudo-élément `::after`
 * le recouvre. `contain: layout` en fait le bloc conteneur de l'overlay sans toucher à son
 * positionnement. Le CSS est injecté en origine « user » avec `!important`, la page ne
 * peut donc pas l'écraser.
 *
 * Aucune propriété personnalisée (`--…`) : la page pourrait la lire avec `getComputedStyle`
 * et détecter l'extension sans rien sonder. Les gardes du content script retrouvent
 * les éléments masqués avec les mêmes sélecteurs (`hidden.ts`, `matcher.ts`).
 */
export function overlayRules(
  selectors: readonly string[],
  style: OverlayStyle,
  label = DEFAULT_LABEL,
): string {
  if (selectors.length === 0) return '';
  const host = [
    'contain: layout',
    ...(style === 'compact' ? ['height: 3rem', 'overflow: hidden'] : []),
  ];
  const after = [
    `content: ${cssString(label)}`,
    'position: absolute',
    'inset: 0',
    'z-index: 2147483647',
    'display: flex',
    'align-items: center',
    'justify-content: center',
    ...colorDeclarations(DEFAULT_OVERLAY_COLORS),
    'font: 13px/1.3 system-ui, sans-serif',
    'pointer-events: auto',
    'cursor: default',
    'user-select: none',
  ];
  return (
    block(selectors, host) +
    block(
      selectors.map((s) => `${s}::after`),
      after,
    )
  );
}

/** Remplace uniquement le texte de l'encart (pour afficher le nom du compte). */
export function overlayLabelRule(selectors: readonly string[], label: string): string {
  return selectors.length === 0
    ? ''
    : block(
        selectors.map((s) => `${s}::after`),
        [`content: ${cssString(label)}`],
      );
}

/**
 * Couleurs de l'encart pour un thème. `condition` est un sélecteur d'ancêtre (ex.
 * `:root:has(> body[style*="…"])`) : les couleurs sont portées par les règles de l'encart
 * elles-mêmes, jamais par une propriété lisible sur `:root`.
 */
export function overlayColorRule(
  selectors: readonly string[],
  condition: string,
  colors: OverlayColors,
): string {
  return selectors.length === 0
    ? ''
    : block(
        selectors.map((s) => `${condition} ${s}::after`),
        colorDeclarations(colors),
      );
}
