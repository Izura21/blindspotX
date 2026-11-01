import type { InpageUi } from '../../core/inpage';
import type { HiddenTest } from '../../core/hidden';
import type { ProfileRef } from '../../core/platform';
import { handleFromUrl } from './handle';
import { SELECTORS as S } from './selectors';

// Emplacements des boutons « Ajouter à Blindspot » sur X, validés sur le vrai site :
// Icône « Masquer » à côté de l'heure du post survolé, menu « … » d'un post et en-tête d'un profil. Pas sur la carte de survol : elle se ferme
// dès que la souris la quitte pour le bouton, posé par-dessus.

const GAP = 6;

/** Chemin ou lien relatif de X (`/handle`, `/handle/status/…`) → compte. */
function profileFromHref(href: string | null | undefined): ProfileRef | null {
  const handle = href ? handleFromUrl(new URL(href, 'https://x.com').href) : null;
  return handle ? { platform: 'x', handle } : null;
}

/** Auteur d'un post : bloc nom du post lui-même, pas d'un post cité. */
function authorOf(tweet: Element | null): ProfileRef | null {
  const name = [...(tweet?.querySelectorAll(S.userName) ?? [])].find((n) => !n.closest(S.quote));
  return profileFromHref(name?.querySelector('a[href^="/"]')?.getAttribute('href'));
}

function userIdIn(root: ParentNode): string | undefined {
  const testId = root
    .querySelector('[data-testid$="-follow"], [data-testid$="-unfollow"]')
    ?.getAttribute('data-testid');
  return testId?.match(/^(\d+)-(?:un)?follow$/)?.[1];
}

function liveRect(element: Element) {
  return () => (element.isConnected ? element.getBoundingClientRect() : null);
}

export function installXInpage(
  ui: InpageUi,
  isHidden: HiddenTest,
  doc: Document = document,
): () => void {
  // Propriétaire du prochain menu « … » ouvert : auteur du post, ou profil affiché.
  let menuOwner: ProfileRef | null = null;

  const onClick = (event: Event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest(S.menu)) return;
    const caret = target.closest(S.caret);
    if (caret) menuOwner = authorOf(caret.closest(S.tweet));
    else if (target.closest(S.profileActions)) menuOwner = profileFromHref(location.pathname);
    else menuOwner = null;
  };
  doc.addEventListener('click', onClick, { capture: true });

  // Post survolé. Le survol de nos boutons (hôte sous <html>) ne le change pas.
  let hoveredTweet: Element | null = null;
  const onOver = (event: Event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.parentElement === doc.documentElement) return;
    const tweet = target.closest(S.tweet);
    if (tweet === hoveredTweet) return;
    hoveredTweet = tweet;
    schedule();
  };
  doc.addEventListener('mouseover', onOver, { capture: true });

  const update = () => {
    scheduled = false;

    const menu = doc.querySelector(S.menu);
    if (menu && menuOwner) {
      ui.show('menu', {
        target: menuOwner,
        style: 'menuitem',
        anchor: liveRect(menu),
        width: (rect) => rect.width,
        // Sous le menu, ou au-dessus s'il touche le bas de l'écran.
        place: (rect, size) => ({
          x: rect.left,
          y:
            rect.bottom + GAP + size.height > innerHeight
              ? rect.top - GAP - size.height
              : rect.bottom + GAP,
        }),
      });
    } else ui.hide('menu');

    const author =
      hoveredTweet?.isConnected && !isHidden(hoveredTweet) ? authorOf(hoveredTweet) : null;
    const name =
      author && [...hoveredTweet!.querySelectorAll(S.userName)].find((n) => !n.closest(S.quote));
    const time = name?.querySelector(S.permalink) ?? name;
    if (author && time) {
      ui.show('post', {
        target: author,
        style: 'icon',
        anchor: liveRect(time),
        // Juste après l'heure du post, sur la même ligne.
        place: (rect, size) => ({
          x: rect.right + GAP,
          y: rect.top + (rect.height - size.height) / 2,
        }),
      });
    } else ui.hide('post');

    const profile = profileFromHref(location.pathname);
    const actions = profile && doc.querySelector(S.profileActions);
    if (profile && actions) {
      const userId = userIdIn(doc.querySelector('[data-testid="placementTracking"]') ?? doc);
      ui.show('profile', {
        target: { ...profile, ...(userId && { userId }) },
        style: 'chip',
        anchor: liveRect(actions),
        // À gauche du bouton « … » du profil, centré verticalement.
        place: (rect, size) => ({
          x: rect.left - GAP - size.width,
          y: rect.top + (rect.height - size.height) / 2,
        }),
      });
    } else ui.hide('profile');
  };

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(update);
  }
  const observer = new MutationObserver(schedule);
  observer.observe(doc, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    doc.removeEventListener('click', onClick, { capture: true });
    doc.removeEventListener('mouseover', onOver, { capture: true });
    ui.hide('menu');
    ui.hide('post');
    ui.hide('profile');
  };
}
