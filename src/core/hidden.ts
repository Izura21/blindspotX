// Éléments masqués, vus depuis le content script.
//
// Le CSS de masquage ne pose plus aucun marqueur lisible (`--blindspot-hidden`) : le content
// script refait la correspondance lui-même, en isolated world, à partir des listes et des
// réglages lus dans le stockage de l'extension (`matcher.ts`). Il emploie les sélecteurs qui ont produit le
// CSS (`adapter.hiddenSelectors`) : un élément est masqué s'il correspond à l'un d'eux ou s'il
// est dans un tel élément, exactement comme l'encart `::after` le recouvre.

/** Vrai si l'élément est masqué (ou dans un élément masqué) par Blindspot. */
export type HiddenTest = (element: Element | null) => boolean;

/** Test fixe pour une liste de sélecteurs (tests, ou état figé). */
export function selectorTest(selectors: readonly string[]): HiddenTest {
  if (selectors.length === 0) return () => false;
  const selector = selectors.join(', ');
  return (element) => {
    if (!element) return false;
    try {
      return element.closest(selector) !== null;
    } catch {
      // Sélecteur refusé par le moteur : le CSS l'est aussi, rien n'est masqué.
      return false;
    }
  };
}
