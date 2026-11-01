// Génère les icônes PNG du manifest (public/icon/<taille>.png) à partir de brand/*.svg.
// Le 16 px a son propre dessin, calé sur la grille. Usage : node scripts/icons.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const sizes = {
  16: 'brand/icon-16.svg',
  32: 'brand/icon.svg',
  48: 'brand/icon.svg',
  128: 'brand/icon.svg',
};
mkdirSync('public/icon', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [size, file] of Object.entries(sizes)) {
  const svg = readFileSync(file, 'utf8');
  await page.setViewportSize({ width: Number(size), height: Number(size) });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  await page.screenshot({ path: `public/icon/${size}.png`, omitBackground: true });
}
await browser.close();
console.log('Icônes générées dans public/icon/.');
