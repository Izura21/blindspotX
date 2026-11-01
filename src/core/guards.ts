import type { HiddenTest } from './hidden';

// Gardes du content script : rien ne doit partir depuis un post masqué (FR-013 à FR-016).
// Isolated world, lecture seule : on n'ajoute rien au DOM, on écoute en phase de capture
// sur `window`, avant les gestionnaires de la page. Les posts masqués sont reconnus par
// `hidden.ts`, sans rien lire de ce que le CSS de masquage expose à la page.

function focusedElement(event: KeyboardEvent): Element | null {
  const target = event.target instanceof Element ? event.target : null;
  return target ?? document.activeElement;
}

/**
 * Neutralise les raccourcis d'engagement quand le focus est sur un post masqué.
 * Les touches de navigation (j/k, Tab, flèches…) restent actives.
 */
export function installKeyboardGuard(
  shortcutKeys: readonly string[],
  isHidden: HiddenTest,
  target: Window = window,
) {
  const blocked = new Set(shortcutKeys.map((k) => k.toLowerCase()));
  const onKey = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (!blocked.has(event.key.toLowerCase())) return;
    if (!isHidden(focusedElement(event))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  for (const type of ['keydown', 'keypress', 'keyup'] as const) {
    target.addEventListener(type, onKey, { capture: true });
  }
  return () => {
    for (const type of ['keydown', 'keypress', 'keyup'] as const) {
      target.removeEventListener(type, onKey, { capture: true });
    }
  };
}

/**
 * Coupe les vidéos et GIF des posts masqués : une lecture est un engagement mesurable.
 * `play` couvre l'autoplay, `timeupdate` les vidéos déjà en cours quand le post devient masqué.
 */
export function installMediaGuard(isHidden: HiddenTest, target: Window = window) {
  const onMedia = (event: Event) => {
    const media = event.target;
    if (!(media instanceof HTMLMediaElement) || !isHidden(media)) return;
    media.muted = true;
    if (!media.paused) media.pause();
  };
  for (const type of ['play', 'playing', 'timeupdate'] as const) {
    target.addEventListener(type, onMedia, { capture: true });
  }
  return () => {
    for (const type of ['play', 'playing', 'timeupdate'] as const) {
      target.removeEventListener(type, onMedia, { capture: true });
    }
  };
}
