// Smoke test local sur le vrai X : détecte qu'un changement du DOM de X a cassé un
// sélecteur de src/platforms/x/selectors.ts ou le masquage. Procédure : docs/maintenance-x.md.
//
// Prérequis : `pnpm build:chrome && node scripts/x-browser.mjs --extension`, session X ouverte
// à la main dans ce navigateur. Lecture seule : scroll uniquement, aucun clic. 4 pages au plus
// par exécution (X limite le débit des chargements de profils).
//
// Usage : `pnpm smoke:x [chemin…]`. Par défaut : accueil, un profil listé, une recherche.
// Code de sortie : 0 si tout passe, 1 si une vérification échoue, 2 si le navigateur de test
// n'est pas prêt (non lancé, session X fermée).
import { mkdirSync, writeFileSync } from 'node:fs';
import { SELECTORS, THEMES } from '../src/platforms/x/selectors.ts';
import {
  XBrowserError,
  connectX,
  listedHandles,
  normalizePath,
  validatePage,
} from './validate-x.mjs';

const MAX_PAGES = 4;
const DEFAULT_PAGES = ['/home', '/MLP_officiel', '/search?q=Bardella&f=live'];
const SCROLLS = 6;

// Ce que le smoke test attend de chaque sélecteur :
// - `every` : présent sur toute page de posts ;
// - `profile` : présent sur une page de profil ;
// - `content` : dépend des posts affichés (citation, repost) : absent = avertissement ;
// - `click` : n'apparaît qu'après un clic, non vérifiable en lecture seule.
const EXPECT = {
  cell: 'every',
  tweet: 'every',
  userName: 'every',
  avatarPrefix: 'every',
  permalink: 'every',
  caret: 'every',
  body: 'every',
  profileFollowButton: 'profile',
  profileActions: 'profile',
  quote: 'content',
  socialContext: 'content',
  menu: 'click',
};

const RESERVED = new Set([
  'home',
  'explore',
  'search',
  'notifications',
  'messages',
  'i',
  'settings',
]);
const profileOf = (path) => {
  const handle = path.match(/^\/([A-Za-z0-9_]{1,15})\/?$/)?.[1];
  return handle && !RESERVED.has(handle.toLowerCase()) ? handle.toLowerCase() : null;
};

/** Compte, dans la page, les éléments trouvés par chaque sélecteur. */
function probe(page) {
  return page.evaluate(
    ({ S, themes }) => {
      const count = (selector) => document.querySelectorAll(selector).length;
      const bodyStyle = document.body?.getAttribute('style') ?? '';
      return {
        selectors: {
          cell: count(S.cell),
          tweet: count(S.tweet),
          userName: count(S.userName),
          avatarPrefix: count(`[data-testid^="${S.avatarPrefix}"]`),
          permalink: count(S.permalink),
          caret: count(S.caret),
          // Le thème se lit sur le style inline du body : on vérifie qu'il est reconnu.
          body: themes.some((bg) => bodyStyle.includes(`background-color: ${bg}`)) ? 1 : 0,
          profileFollowButton: count(S.profileFollowButton),
          profileActions: count(S.profileActions),
          quote: count(`${S.tweet} ${S.quote}:has(${S.userName})`),
          socialContext: count(S.socialContext),
          menu: count(S.menu),
        },
        bodyStyle: bodyStyle.slice(0, 120),
        // Hôte des boutons in-page (src/core/inpage.ts) : seul enfant ajouté sous <html>.
        inpageHost: [...document.documentElement.children].some(
          (el) => el instanceof HTMLDivElement && el.style.zIndex === '2147483647',
        ),
      };
    },
    { S: SELECTORS, themes: THEMES.map((t) => t.bodyBackground) },
  );
}

const results = [];
const check = (ok, label, detail = '') =>
  results.push({ level: ok ? 'ok' : 'fail', label, detail });
const warn = (label, detail = '') => results.push({ level: 'warn', label, detail });

async function main() {
  const args = process.argv.slice(2).map(normalizePath);
  const paths = args.length ? args : DEFAULT_PAGES;
  if (paths.length > MAX_PAGES) {
    throw new XBrowserError(
      `${paths.length} pages demandées : ${MAX_PAGES} au plus par exécution.`,
    );
  }
  const unchecked = Object.keys(SELECTORS).filter((key) => !(key in EXPECT));
  for (const key of unchecked) {
    check(false, `selectors.ts › ${key}`, 'nouveau sélecteur : ajouter son attente dans EXPECT');
  }

  const listed = listedHandles();
  const { page } = await connectX();
  const pages = [];
  for (const path of paths) {
    process.stdout.write(`… ${path}\n`);
    const { summary, rows } = await validatePage(page, path, { listed, scrolls: SCROLLS });
    pages.push({ path, profile: profileOf(path), summary, rows, probe: await probe(page) });
  }

  // 1. Sélecteurs.
  for (const [key, kind] of Object.entries(EXPECT)) {
    if (!(key in SELECTORS)) {
      warn(`selectors.ts › ${key}`, 'n’existe plus : retirer son attente dans EXPECT');
      continue;
    }
    const label = `sélecteur ${key}`;
    if (kind === 'click') {
      warn(label, 'non vérifié (n’apparaît qu’après un clic)');
      continue;
    }
    const relevant = kind === 'profile' ? pages.filter((p) => p.profile) : pages;
    if (relevant.length === 0) {
      warn(label, 'non vérifié (aucune page de profil)');
      continue;
    }
    const found = relevant.map((p) => {
      let n = p.probe.selectors[key];
      // Une citation ou un repost a pu sortir du DOM virtualisé pendant le scroll.
      if (key === 'quote') n ||= p.rows.filter((r) => r.quoteHasRoleLink).length;
      if (key === 'socialContext') n ||= p.rows.filter((r) => r.socialText).length;
      return { path: p.path, n };
    });
    const detail = found.map((f) => `${f.path} : ${f.n}`).join(' · ');
    if (kind === 'content') {
      if (found.some((f) => f.n > 0)) check(true, label, detail);
      else warn(label, `introuvable, peut-être faute de contenu (${detail})`);
    } else {
      const missing = found.filter((f) => f.n === 0);
      check(
        missing.length === 0,
        label,
        missing.length ? `introuvable sur ${missing.map((f) => f.path).join(', ')}` : detail,
      );
    }
    if (key === 'body' && found.some((f) => f.n === 0)) {
      warn('style du body', pages[0].probe.bodyStyle || '(vide)');
    }
  }

  // 2. Masquage et faux positifs, page par page.
  for (const p of pages) {
    const { summary, rows } = p;
    const missed = rows.filter((r) => r.expectedCell && !r.cellHidden);
    const falsePositives = rows.filter((r) => r.cellHidden && !r.expectedCell);
    const quoteErrors = rows.filter((r) => !r.expectedCell && r.quoteHidden !== r.expectedQuote);
    check(summary.posts > 0, `${p.path} › posts lus`, `${summary.posts}`);
    check(
      missed.length === 0,
      `${p.path} › posts listés masqués`,
      `${summary.masqués - falsePositives.length} / ${summary.attendus}` +
        (missed.length ? ` (non masqués : ${missed.map((r) => r.id).join(', ')})` : ''),
    );
    check(
      falsePositives.length === 0,
      `${p.path} › aucun faux positif`,
      falsePositives.map((r) => `${r.id} (@${r.author})`).join(', '),
    );
    check(
      quoteErrors.length === 0,
      `${p.path} › citations`,
      quoteErrors.length
        ? quoteErrors.map((r) => `${r.id} (cité @${r.quoted})`).join(', ')
        : `${summary.citationsMasquées} masquée(s) / ${summary.citations}`,
    );
    // Sur le profil d'un compte listé, aucun post attendu = auteur mal lu (sélecteur cassé).
    if (p.profile && listed.has(p.profile)) {
      check(
        summary.attendus > 0,
        `${p.path} › auteur reconnu (profil listé)`,
        `${summary.attendus}`,
      );
    } else if (p.profile) {
      warn(`${p.path} › profil non listé`, 'le masquage n’y est pas vérifié');
    }
  }

  // 3. Boutons in-page.
  const withHost = pages.filter((p) => p.probe.inpageHost).length;
  check(
    withHost === pages.length,
    'hôte des boutons in-page',
    withHost === pages.length
      ? `${withHost} / ${pages.length}`
      : `${withHost} / ${pages.length} (mode discret activé ? extension chargée avec --extension ?)`,
  );
}

const icon = { ok: '✅', warn: '⚠️ ', fail: '❌' };
let code;
try {
  await main();
  console.log('\nSmoke test X\n');
  for (const r of results) {
    console.log(`${icon[r.level]} ${r.label}${r.detail ? ` : ${r.detail}` : ''}`);
  }
  const failures = results.filter((r) => r.level === 'fail').length;
  const warnings = results.filter((r) => r.level === 'warn').length;
  console.log(
    `\n${failures ? `❌ ${failures} échec(s)` : '✅ Tout passe'}, ${warnings} avertissement(s).`,
  );
  mkdirSync('temp', { recursive: true });
  writeFileSync('temp/smoke-x.json', JSON.stringify(results, null, 2));
  console.log('Détail : temp/smoke-x.json');
  code = failures ? 1 : 0;
} catch (error) {
  console.error(`\n❌ ${error instanceof XBrowserError ? error.message : (error?.stack ?? error)}`);
  code = error instanceof XBrowserError ? 2 : 1;
}
// Ne ferme pas le navigateur de l'utilisateur : on se détache simplement.
process.exit(code);
