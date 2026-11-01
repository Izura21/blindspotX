/* global chrome */
// Test de bout en bout local : extension buildée (pnpm build:chrome) chargée dans Chromium,
// page x.com synthétique servie par Playwright. Vérifie toute la chaîne
// content script → background → scripting.insertCSS, et l'absence d'empreinte DOM/CSSOM.
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const axeSource = readFileSync(
  createRequire(import.meta.url).resolve('axe-core/axe.min.js'),
  'utf8',
);
const shots = process.env.E2E_SCREENSHOTS;

const ext = path.resolve('.output/chrome-mv3');
const cell = (author) => `
  <div data-testid="cellInnerDiv" style="position:absolute;width:100%;transform:translateY(0)">
    <article data-testid="tweet">
      <div data-testid="User-Name"><a href="/${author}">@${author}</a></div><p>texte</p>
    </article>
  </div>`;
const body = `<!doctype html><body style="background-color: rgb(0, 0, 0)">
  <div style="position:relative;height:200px">${cell('Cible')}</div>
  <div style="position:relative;height:200px">${cell('autre')}</div></body>`;
const list = (handles) => ({
  userLists: [
    {
      id: 'user-e2e',
      name: 'E2E',
      enabled: true,
      createdAt: '',
      entries: handles.map((handle) => ({ platform: 'x', handle, addedAt: '' })),
    },
  ],
});

/** Audit WCAG 2.1 AA (axe-core) : échoue sur toute violation. */
async function audit(target, name) {
  // Évalué via CDP : la CSP de l'extension bloque les scripts injectés.
  await target.evaluate(axeSource);
  const violations = await target.evaluate(async () => {
    const result = await window.axe.run(document, {
      runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    });
    return result.violations.map((v) => `${v.id} : ${v.nodes.map((n) => n.target).join(', ')}`);
  });
  assert.deepEqual(violations, [], `accessibilité ${name}`);
}

const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
try {
  await ctx.route('https://x.com/**', (route) => route.fulfill({ contentType: 'text/html', body }));
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
  await sw.evaluate(
    (value) => chrome.storage.local.set({ ...value, settings: { discreet: true } }),
    list(['cible']),
  );

  const page = await ctx.newPage();
  await page.goto('https://x.com/home');
  const overlays = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="cellInnerDiv"]')].map((el) => {
        const after = getComputedStyle(el, '::after');
        return { content: after.content, background: after.backgroundColor };
      }),
    );
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="cellInnerDiv"]');
    return el && getComputedStyle(el, '::after').content !== 'none';
  });

  const [hidden, visible] = await overlays();
  assert.equal(hidden.content, '"Post masqué par Blindspot"');
  assert.equal(hidden.background, 'rgb(0, 0, 0)', 'thème sombre appliqué');
  assert.equal(visible.content, 'none', 'compte non listé visible');

  const footprint = await page.evaluate(() => ({
    htmlChildren: document.documentElement.children.length,
    styleSheets: document.styleSheets.length,
    attributes: [...document.querySelectorAll('*')].flatMap((el) =>
      [...el.attributes].map((a) => a.name).filter((n) => /angle/i.test(n)),
    ),
  }));
  assert.deepEqual(
    footprint,
    { htmlChildren: 2, styleSheets: 0, attributes: [] },
    'mode discret : zéro empreinte DOM/CSSOM',
  );

  // Aucun marqueur passif : aucune propriété personnalisée lisible par la page, ni sur
  // :root ni sur une cellule masquée.
  const markers = await page.evaluate(() =>
    [document.documentElement, document.body, ...document.querySelectorAll('*')].flatMap((el) => {
      const computed = getComputedStyle(el);
      const names = [...computed].filter((n) => n.startsWith('--'));
      for (const n of [
        '--blindspot-hidden',
        '--blindspot-bg',
        '--blindspot-fg',
        '--blindspot-border',
      ]) {
        if (computed.getPropertyValue(n) !== '') names.push(n);
      }
      return names.map((n) => `${el.tagName.toLowerCase()} ${n}`);
    }),
  );
  assert.deepEqual(markers, [], 'aucune propriété --blindspot-* lisible par la page');

  // Les gardes reconnaissent le post masqué sans marqueur CSS (correspondance côté content
  // script) : un raccourci d'engagement n'atteint pas la page sur le post masqué.
  const reached = await page.evaluate(() =>
    [...document.querySelectorAll('article')].map((article) => {
      let seen = false;
      const listener = () => (seen = true);
      document.addEventListener('keydown', listener);
      article.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true }));
      document.removeEventListener('keydown', listener);
      return seen;
    }),
  );
  assert.deepEqual(reached, [false, true], 'garde clavier : post masqué seul neutralisé');

  // Boutons dans la page : un seul élément ajouté sous <html>, retiré en mode discret.
  const htmlChildren = () => page.evaluate(() => document.documentElement.children.length);
  await sw.evaluate(() => chrome.storage.local.set({ settings: { discreet: false } }));
  await page.waitForFunction(() => document.documentElement.children.length === 3);
  assert.equal(await page.evaluate(() => document.styleSheets.length), 0, 'CSSOM inchangé');
  await sw.evaluate(() => chrome.storage.local.set({ settings: { discreet: true } }));
  await page.waitForFunction(() => document.documentElement.children.length === 2);
  assert.equal(await htmlChildren(), 2);

  // Changement de liste à chaud, sans recharger.
  await sw.evaluate((value) => chrome.storage.local.set(value), list([]));
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="cellInnerDiv"]');
    return getComputedStyle(el, '::after').content === 'none';
  });

  // Interrupteur global.
  await sw.evaluate((value) => chrome.storage.local.set(value), list(['cible']));
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="cellInnerDiv"]');
    return getComputedStyle(el, '::after').content !== 'none';
  });
  await sw.evaluate(() => chrome.storage.local.set({ settings: { enabled: false } }));
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="cellInnerDiv"]');
    return getComputedStyle(el, '::after').content === 'none';
  });

  // Popup : création d'une liste, ajout d'un compte, effet sur la page.
  await sw.evaluate(() => chrome.storage.local.clear());
  const extensionId = new URL(sw.url()).host;
  const popup = await ctx.newPage();
  for (const scheme of ['light', 'dark']) {
    await popup.emulateMedia({ colorScheme: scheme });
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.getByRole('switch', { name: 'Activé' }).waitFor();
    await audit(popup, `popup (${scheme})`);
  }
  await popup.getByPlaceholder('Nouvelle liste').fill('Perso');
  await popup.getByRole('button', { name: 'Créer' }).click();
  await popup.getByPlaceholder('@compte ou lien x.com').fill('@Cible');
  await popup.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await popup.getByText('@cible').waitFor();
  await audit(popup, 'popup (liste ouverte)');
  if (shots) await popup.screenshot({ path: `${shots}/popup.png` });
  await page.bringToFront();
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="cellInnerDiv"]');
    return getComputedStyle(el, '::after').content !== 'none';
  });

  // Partage par code : copie depuis la liste, collage dans « Coller un code de partage ».
  await popup.bringToFront();
  await ctx
    .grantPermissions(['clipboard-write'], { origin: `chrome-extension://${extensionId}` })
    .catch(() => undefined);
  // La lecture du presse-papiers est refusée en headless : on garde trace de ce qui y est écrit.
  await popup.evaluate(() => {
    const write = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = (text) => ((window.copied = text), write(text));
  });
  await popup.getByRole('button', { name: 'Copier le code de partage' }).click();
  await popup.getByText(/Code de partage copié|Copie impossible/).waitFor();
  const fallback = popup.getByLabel(/Code de partage de/);
  const shareCode = (await fallback.count())
    ? await fallback.inputValue()
    : await popup.evaluate(() => window.copied);
  assert.match(shareCode, /^BLINDSPOT1:[A-Za-z0-9_-]+$/, 'code de partage');
  await popup.getByText('Coller un code de partage').click();
  await popup.getByLabel('Code de partage', { exact: true }).fill(shareCode);
  await popup.getByRole('button', { name: 'Lire le code' }).click();
  await popup.getByText('1 compte(s), 0 nouveau(x)').waitFor();
  await audit(popup, 'popup (code de partage)');
  await popup.getByRole('button', { name: 'Importer', exact: true }).click();
  await popup.getByText('1 compte(s) ajouté(s) à « Perso ».').waitFor();
  assert.equal(await popup.getByRole('button', { name: /^Perso/ }).count(), 2, 'liste importée');
  await popup.getByLabel('Code de partage', { exact: true }).fill('BLINDSPOT1:abc$');
  await popup.getByRole('button', { name: 'Lire le code' }).click();
  await popup
    .getByRole('alert')
    .getByText(/invalide/)
    .waitFor();
  await audit(popup, 'popup (code invalide)');

  const options = await ctx.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.getByRole('switch', { name: /nom du compte/ }).click();
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="cellInnerDiv"]');
    return getComputedStyle(el, '::after').content.includes('@cible');
  });
  await audit(options, 'options');
  if (shots) await options.screenshot({ path: `${shots}/options.png`, fullPage: true });

  console.log('e2e chromium : OK');
} finally {
  await ctx.close();
}
