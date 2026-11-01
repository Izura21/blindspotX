// Validation de l'extension sur le vrai X : compare, post par post, ce qui
// devrait être masqué d'après les listes packagées et ce qui l'est réellement.
// Prérequis : `pnpm build:chrome && node scripts/x-browser.mjs --extension`, session X ouverte.
// Lecture seule : scroll uniquement, aucun clic.
//
// Les fonctions exportées servent aussi au smoke test (`pnpm smoke:x`, scripts/smoke-x.mjs).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { SELECTORS } from '../../src/platforms/x/selectors.ts';

export const CDP_URL = 'http://127.0.0.1:9333';

/** Erreur d'environnement (Brave absent, session X fermée) : rien à voir avec l'extension. */
export class XBrowserError extends Error {}

/** Handles des listes packagées, en minuscules. */
export function listedHandles() {
  return new Set(
    readdirSync('src/lists').flatMap((f) =>
      JSON.parse(readFileSync(`src/lists/${f}`, 'utf8')).entries.map((e) => e.handle.toLowerCase()),
    ),
  );
}

/** Chemins sans « / » initial acceptés (Git Bash convertit « /x » en chemin Windows). */
export function normalizePath(p) {
  return p.startsWith('/') ? p : `/${p}`;
}

/** S'attache au Brave de test et renvoie un onglet x.com (ouvert au besoin). */
export async function connectX() {
  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP_URL, { timeout: 5000 });
  } catch {
    throw new XBrowserError(
      `Aucun navigateur de test sur ${CDP_URL}. Lancer \`node scripts/x-browser.mjs --extension\` ` +
        'et se connecter à X à la main.',
    );
  }
  const context = browser.contexts()[0];
  if (!context) throw new XBrowserError('Navigateur de test sans fenêtre ouverte.');
  const page = context.pages().find((p) => p.url().includes('x.com')) ?? (await context.newPage());
  return { browser, page };
}

/** Échoue si la session X n'est pas ouverte (X redirige vers la connexion ou l'accueil public). */
export function assertLoggedIn(page) {
  const { hostname, pathname } = new URL(page.url());
  if (!/(^|\.)x\.com$/.test(hostname) || pathname === '/' || /login|\/i\/flow\//.test(pathname)) {
    throw new XBrowserError(
      `Session X non ouverte (page : ${page.url()}). Se connecter à X dans le navigateur de test.`,
    );
  }
}

/** Charge une page de X, scrolle et compare masqué attendu / réel pour chaque post vu. */
export async function validatePage(page, path, { listed = listedHandles(), scrolls = 12 } = {}) {
  await page.goto(`https://x.com${path}`, { waitUntil: 'domcontentloaded' });
  await page
    .waitForSelector(`${SELECTORS.cell} article`, { state: 'attached', timeout: 20000 })
    .catch(() => {});
  assertLoggedIn(page);
  const seen = new Map();
  for (let i = 0; i < scrolls; i++) {
    const rows = await page.evaluate((S) => {
      const handleOf = (a) => a?.getAttribute('href')?.split('/')[1]?.toLowerCase() ?? null;
      // Masqué = l'élément ou un ancêtre porte l'encart `::after` (aucun marqueur CSS).
      const hidden = (el) => {
        for (let node = el; node; node = node.parentElement) {
          const { content } = getComputedStyle(node, '::after');
          if (content !== 'none' && content !== 'normal') return true;
        }
        return false;
      };
      return [...document.querySelectorAll(S.cell)].flatMap((cell) => {
        const article = cell.querySelector(S.tweet);
        if (!article) return [];
        const id = article
          .querySelector(S.permalink)
          ?.getAttribute('href')
          ?.match(/status\/(\d+)/)?.[1];
        const names = [...article.querySelectorAll(S.userName)];
        const main = names.find((n) => !n.closest(S.quote));
        const quoteBlock = article.querySelector(`${S.quote}:has(${S.userName})`);
        const social = article.querySelector(S.socialContext);
        return [
          {
            id,
            author: handleOf(main?.querySelector('a[href^="/"]')),
            reposter: social ? handleOf(social.closest('a')) : null,
            socialText: social?.textContent?.slice(0, 40) ?? null,
            // Un post cité n'a pas de lien : l'auteur se lit sur l'avatar.
            quoted:
              quoteBlock
                ?.querySelector(`[data-testid^="${S.avatarPrefix}"]`)
                ?.getAttribute('data-testid')
                ?.slice(S.avatarPrefix.length)
                .toLowerCase() ?? null,
            quoteHasRoleLink: !!quoteBlock,
            promoted: /Sponsoris|Promoted|Ad\b|Publicité/.test(article.innerText.slice(0, 400)),
            cellHidden: hidden(cell),
            quoteHidden: hidden(quoteBlock),
            label: getComputedStyle(cell, '::after').content,
          },
        ];
      });
    }, SELECTORS);
    for (const r of rows) if (r.id && !seen.has(r.id)) seen.set(r.id, r);
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(1200);
  }
  const rows = [...seen.values()].map((r) => {
    const expectedCell = listed.has(r.author) || (!!r.reposter && listed.has(r.reposter));
    const expectedQuote = !!r.quoted && listed.has(r.quoted);
    return {
      ...r,
      expectedCell,
      expectedQuote,
      ok: r.cellHidden === expectedCell && (expectedCell || r.quoteHidden === expectedQuote),
    };
  });
  const summary = {
    page: path,
    posts: rows.length,
    masqués: rows.filter((r) => r.cellHidden).length,
    attendus: rows.filter((r) => r.expectedCell).length,
    reposts: rows.filter((r) => r.socialText).length,
    citations: rows.filter((r) => r.quoted).length,
    citationsMasquées: rows.filter((r) => r.quoteHidden).length,
    promus: rows.filter((r) => r.promoted).length,
    erreurs: rows.filter((r) => !r.ok).length,
  };
  return { summary, rows };
}

async function main() {
  const pages = process.argv.slice(2).length
    ? process.argv.slice(2).map(normalizePath)
    : [
        '/home',
        '/MLP_officiel',
        '/J_Bardella',
        '/ZemmourEric',
        '/BrunoRetailleau',
        '/ECiotti',
        '/search?q=Bardella&f=live',
      ];
  const { page } = await connectX();
  const listed = listedHandles();
  const report = [];
  for (const path of pages) {
    const { summary, rows } = await validatePage(page, path, { listed });
    console.log(JSON.stringify(summary));
    report.push({ ...summary, rows });
  }
  mkdirSync('temp', { recursive: true });
  writeFileSync('temp/validate-x.json', JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then(
    () => process.exit(0),
    (error) => {
      console.error(error instanceof XBrowserError ? error.message : error);
      process.exit(2);
    },
  );
}
