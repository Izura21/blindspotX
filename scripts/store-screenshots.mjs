/* global chrome */
// Visuels de la fiche Chrome Web Store : captures 1280×800 et vignettes promo, dans
// store/screenshots/. L'extension buildée (.output/chrome-mv3) est chargée dans un Chromium
// Playwright ; les pages x.com sont synthétiques (comptes et contenus fictifs), servies par
// interception de route. Aucune requête ne sort : tout le reste est bloqué.
//
// Chaque capture brute est ensuite mise en scène (légende, halo, flèche) dans une page HTML
// locale, elle-même capturée. Les PNG finaux sont réencodés en RVB 24 bits, sans alpha.
//
//   node scripts/store-screenshots.mjs            build Chrome puis captures
//   node scripts/store-screenshots.mjs --no-build captures seules
//   options : --ext <dossier> (build à charger, défaut .output/chrome-mv3)
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const extArg = argv.indexOf('--ext');
const ext = path.resolve(extArg >= 0 ? argv[extArg + 1] : '.output/chrome-mv3');
const OUT = path.resolve('store/screenshots');
const TEMP = path.resolve('temp/store-screenshots');

if (!argv.includes('--no-build')) execSync('pnpm build:chrome', { stdio: 'inherit' });
mkdirSync(OUT, { recursive: true });
mkdirSync(TEMP, { recursive: true });

// ─── Identité ────────────────────────────────────────────────────────────────────────────
const C = { black: '#111111', acid: '#C6F432', concrete: '#E9E9E6', graphite: '#4A4A48' };
const MONO = "'Courier New', Consolas, monospace";
const ICON = readFileSync(path.resolve('brand/icon.svg'), 'utf8');

const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );

// ─── Comptes et posts fictifs ────────────────────────────────────────────────────────────
const ACCOUNTS = {
  atelier_lune: { name: 'Atelier Lune', color: '#F2A65A' },
  clash_permanent: { name: 'Le Clash Permanent', color: '#E4572E' },
  gazette_plateau: { name: 'Gazette du Plateau', color: '#4C9F70' },
  ronchon_lundi: { name: 'Le Ronchon du Lundi', color: '#7E6BC4' },
  buzz_sans_fin: { name: 'Buzz Sans Fin', color: '#E0B000' },
  rando_cretes: { name: 'Rando des Crêtes', color: '#3B8EA5' },
  debat_eternel: { name: 'Débat Éternel', color: '#C05780' },
  alerte_minute: { name: 'Alerte Minute', color: '#5C6BC0' },
};
/** Comptes de la liste fictive « Bruit de fond », masqués. */
const LISTED = ['clash_permanent', 'buzz_sans_fin', 'debat_eternel', 'alerte_minute'];

const FEED = [
  {
    id: '1001',
    author: 'atelier_lune',
    time: '12 min',
    text: 'Nouvelle fournée de bols émaillés sortie du four ce matin. Le bleu a enfin pris comme on le voulait.',
    stats: [4, 2, 38, '1,2 k'],
  },
  {
    id: '1002',
    author: 'clash_permanent',
    time: '25 min',
    text: 'Encore un sujet sur lequel tout le monde va s’écharper aujourd’hui. Vous êtes prêts ?',
    stats: [212, 96, 540, '48 k'],
  },
  {
    id: '1003',
    author: 'gazette_plateau',
    time: '41 min',
    text: 'Le marché du samedi passe place des Tilleuls pendant les travaux. Les horaires ne changent pas.',
    stats: [7, 15, 61, '3,4 k'],
  },
  {
    id: '1004',
    author: 'ronchon_lundi',
    time: '1 h',
    text: 'Troisième café et toujours pas réveillé. Quelqu’un a vu passer le week-end ?',
    stats: [31, 8, 120, '9,8 k'],
  },
  {
    id: '1005',
    author: 'buzz_sans_fin',
    time: '1 h',
    text: 'Vous ne devinerez jamais ce qui fait parler tout le monde ce matin.',
    stats: [88, 41, 230, '22 k'],
  },
  {
    id: '1006',
    author: 'rando_cretes',
    time: '2 h',
    text: 'Sortie de dimanche : 14 km, 600 m de dénivelé, départ 8 h du parking du col. Prévoyez des couches.',
    stats: [12, 9, 74, '2,1 k'],
  },
];

/** Fil de la capture du menu : sous le menu, une image (aplat) plutôt que du texte. */
const MENU_FEED = [
  FEED[3],
  {
    id: '1007',
    author: 'atelier_lune',
    time: '3 h',
    text: 'Le four refroidit doucement. Ouverture de l’atelier demain à 10 h.',
    media: '#E8C9A0',
    stats: [2, 1, 25, '860'],
  },
  FEED[5],
];

const PROFILE_POSTS = [
  {
    id: '2001',
    author: 'ronchon_lundi',
    time: '1 h',
    text: 'Troisième café et toujours pas réveillé. Quelqu’un a vu passer le week-end ?',
    stats: [31, 8, 120, '9,8 k'],
  },
  {
    id: '2002',
    author: 'ronchon_lundi',
    time: '1 j',
    text: 'Il pleut, évidemment. J’avais étendu le linge.',
    stats: [19, 3, 87, '6,5 k'],
  },
];

// ─── Pages x.com synthétiques ────────────────────────────────────────────────────────────
// Mise en page générique de fil social : aucun logo, aucun contenu de X. Seuls les
// attributs dont l'extension a besoin (src/platforms/x/selectors.ts) reprennent ceux de X.
const svg = (d, size = 20) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${d}</svg>`;
const ICONS = {
  home: '<path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  search:
    '<circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m16 16 4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="m4 7 8 6 8-6" fill="none" stroke="currentColor" stroke-width="2"/>',
  user: '<circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 21a8 8 0 0 1 16 0" fill="none" stroke="currentColor" stroke-width="2"/>',
  reply:
    '<path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  share:
    '<path d="M7 7h10v6M17 17H7v-6M14 4l3 3-3 3M10 20l-3-3 3-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  heart:
    '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  views:
    '<path d="M5 20V12M10 20V6M15 20v-9M20 20V9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  dots: '<circle cx="5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="19" cy="12" r="1.8" fill="currentColor"/>',
  mute: '<path d="M4 9h4l5-4v14l-5-4H4zM17 9l4 6M21 9l-4 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  flag: '<path d="M5 21V4h11l-2 4 2 4H5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  unfollow:
    '<circle cx="10" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 20a7 7 0 0 1 14 0M16 11h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
};

const avatar = (handle, size) => {
  const a = ACCOUNTS[handle];
  return `<a href="/${handle}" class="avatar" style="width:${size}px;height:${size}px;background:${a.color};font-size:${Math.round(size * 0.42)}px">${esc(a.name.replace(/^(Le|La|Les) /, '')[0])}</a>`;
};

function post(p) {
  const a = ACCOUNTS[p.author];
  const [replies, shares, likes, views] = p.stats;
  return `
  <div data-testid="cellInnerDiv" class="cell">
    <article data-testid="tweet" class="tweet">
      <div data-testid="UserAvatar-Container-${p.author}">${avatar(p.author, 40)}</div>
      <div class="body">
        <div class="head">
          <div data-testid="User-Name" class="uname">
            <a href="/${p.author}" class="name">${esc(a.name)}</a>
            <a href="/${p.author}" class="muted">@${p.author}</a>
            <span class="muted">·</span>
            <a href="/${p.author}/status/${p.id}" class="muted"><time datetime="2026-10-29T08:00:00Z">${p.time}</time></a>
          </div>
          <button type="button" data-testid="caret" class="caret" aria-label="Plus">${svg(ICONS.dots, 18)}</button>
        </div>
        <p class="text">${esc(p.text)}</p>
        ${p.media ? `<div class="media" style="background:${p.media}"></div>` : ''}
        <div class="actions">
          <span>${svg(ICONS.reply, 18)}${replies}</span><span>${svg(ICONS.share, 18)}${shares}</span>
          <span>${svg(ICONS.heart, 18)}${likes}</span><span>${svg(ICONS.views, 18)}${views}</span>
        </div>
      </div>
    </article>
  </div>`;
}

const PAGE_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body { font: 15px/1.35 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #0f1419; }
  a { color: inherit; text-decoration: none; }
  button { font: inherit; color: inherit; background: none; border: none; cursor: pointer; padding: 0; }
  .muted { color: #536471; }
  .app { display: flex; justify-content: center; min-height: 100vh; }
  nav { width: 72px; display: flex; flex-direction: column; align-items: center; gap: 22px; padding-top: 14px; color: #0f1419; }
  nav .mark { width: 30px; height: 30px; border-radius: 9px; background: #d9dee2; margin-bottom: 4px; }
  main { width: 600px; border-left: 1px solid #eff3f4; border-right: 1px solid #eff3f4; }
  aside { width: 288px; padding: 10px 16px 0 24px; position: sticky; top: 0; align-self: flex-start; }
  .spacer { height: 400px; }
  .top { position: sticky; top: 0; z-index: 2; background: #fff; border-bottom: 1px solid #eff3f4; display: flex; }
  .top div { flex: 1; text-align: center; padding: 16px 0; font-weight: 500; color: #536471; }
  .top div.on { color: #0f1419; font-weight: 700; box-shadow: inset 0 -4px 0 -0px transparent; position: relative; }
  .top div.on::before { content: ''; position: absolute; bottom: 0; left: 50%; width: 64px; margin-left: -32px; height: 4px; border-radius: 2px; background: #7a8a96; }
  .cell { position: relative; border-bottom: 1px solid #eff3f4; }
  .tweet { display: flex; gap: 12px; padding: 12px 16px; }
  .avatar { display: flex; align-items: center; justify-content: center; border-radius: 50%; color: #fff; font-weight: 700; flex: none; }
  .body { flex: 1; min-width: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; }
  .uname { display: flex; gap: 4px; align-items: baseline; white-space: nowrap; }
  .name { font-weight: 700; }
  .caret { color: #536471; width: 30px; height: 22px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
  .text { margin: 2px 0 10px; }
  .media { height: 190px; border-radius: 16px; margin: 0 0 10px; }
  .actions { display: flex; justify-content: space-between; max-width: 430px; color: #536471; font-size: 13px; }
  .actions span { display: flex; align-items: center; gap: 6px; }
  .search { background: #eff3f4; border-radius: 9999px; padding: 10px 16px; color: #536471; display: flex; gap: 10px; align-items: center; }
  .card { border: 1px solid #eff3f4; border-radius: 16px; margin-top: 14px; padding: 12px 16px; }
  .card h2 { font-size: 19px; margin: 0 0 8px; }
  .suggest { display: flex; gap: 10px; align-items: center; padding: 8px 0; }
  .suggest div { flex: 1; min-width: 0; line-height: 1.2; }
  .pill { border-radius: 9999px; background: #0f1419; color: #fff; font-weight: 700; padding: 7px 16px; font-size: 14px; }
  .pill.ghost { background: #fff; color: #0f1419; border: 1px solid #cfd9de; }
  #layers [role="menu"] { position: fixed; width: 300px; background: #fff; border-radius: 12px; padding: 6px 0;
    box-shadow: 0 0 15px rgba(101,119,134,0.2), 0 0 3px 1px rgba(101,119,134,0.15); z-index: 5; }
  #layers [role="menuitem"] { display: flex; gap: 12px; align-items: center; padding: 11px 16px; font-weight: 700; }
  .banner { height: 150px; background: linear-gradient(120deg, #b8a6ea, #7E6BC4); }
  .ph { padding: 0 16px 12px; position: relative; }
  .ph .row { display: flex; justify-content: flex-end; gap: 8px; align-items: center; padding-top: 12px; height: 64px; }
  .ph .big { position: absolute; top: -58px; left: 16px; border: 4px solid #fff; border-radius: 50%; }
  .ph h1 { font-size: 20px; margin: 4px 0 0; }
  .ph .bio { margin: 10px 0; }
  .ph .meta { display: flex; gap: 18px; font-size: 14px; }
  .round { width: 36px; height: 36px; border-radius: 50%; border: 1px solid #cfd9de; display: flex; align-items: center; justify-content: center; }
  .tabs { display: flex; border-bottom: 1px solid #eff3f4; }
  .tabs div { flex: 1; text-align: center; padding: 14px 0; color: #536471; font-weight: 500; }
  .tabs div.on { color: #0f1419; font-weight: 700; }
`;

const MENU_SCRIPT = `
  // Comme une appli monopage, la page bouge après le chargement (l'extension observe le DOM).
  for (const delay of [300, 1000]) {
    setTimeout(() => document.getElementById('layers').append(document.createComment('')), delay);
  }
  document.addEventListener('click', (event) => {
    const caret = event.target.closest && event.target.closest('[data-testid="caret"]');
    if (!caret) return;
    const layers = document.getElementById('layers');
    const handle = caret.closest('article').querySelector('[data-testid="User-Name"] a').getAttribute('href').slice(1);
    layers.innerHTML = document.getElementById('menu-template').innerHTML.replaceAll('{h}', handle);
    const r = caret.getBoundingClientRect();
    const menu = layers.firstElementChild;
    menu.style.top = r.top + 'px';
    menu.style.left = (r.right - 300) + 'px';
  });
`;

const MENU_TEMPLATE = `<template id="menu-template"><div role="menu">
  <div role="menuitem">${svg(ICONS.unfollow)}Ne plus suivre @{h}</div>
  <div role="menuitem">${svg(ICONS.list)}Gérer mes listes</div>
  <div role="menuitem">${svg(ICONS.mute)}Mettre en sourdine</div>
  <div role="menuitem">${svg(ICONS.flag)}Signaler ce post</div>
</div></template>`;

function shell(center) {
  const suggestion = (h) => `
    <div class="suggest">${avatar(h, 40)}<div><strong>${esc(ACCOUNTS[h].name)}</strong><br><span class="muted">@${h}</span></div><span class="pill">Suivre</span></div>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Fil</title><style>${PAGE_CSS}</style></head>
<body style="background-color: rgb(255, 255, 255);">
  <div class="app">
    <nav><div class="mark"></div>${['home', 'search', 'bell', 'mail', 'user'].map((i) => svg(ICONS[i], 26)).join('')}</nav>
    <main>${center}</main>
    <aside>
      <div class="search">${svg(ICONS.search, 18)}Rechercher</div>
      <div class="card"><h2>Suggestions</h2>${suggestion('rando_cretes')}${suggestion('atelier_lune')}</div>
    </aside>
  </div>
  <div id="layers"></div>
  ${MENU_TEMPLATE}
  <script>${MENU_SCRIPT}</script>
</body></html>`;
}

const feedPage = (posts = FEED) =>
  shell(
    `<div class="top"><div class="on">Pour vous</div><div>Abonnements</div></div>${posts.map(post).join('')}<div class="spacer"></div>`,
  );

function profilePage(handle) {
  const a = ACCOUNTS[handle];
  return shell(`
    <div class="banner"></div>
    <div class="ph">
      <div class="big">${avatar(handle, 112)}</div>
      <div class="row" data-testid="placementTracking">
        <button type="button" data-testid="userActions" class="round" aria-label="Plus">${svg(ICONS.dots, 18)}</button>
        <button type="button" data-testid="1700000000000000042-follow" class="pill">Suivre</button>
      </div>
      <h1>${esc(a.name)}</h1>
      <div class="muted">@${handle}</div>
      <p class="bio">Râleur professionnel, amateur de café et de lundis pluvieux.</p>
      <div class="meta"><span><strong>312</strong> <span class="muted">abonnements</span></span><span><strong>4 870</strong> <span class="muted">abonnés</span></span></div>
    </div>
    <div class="tabs"><div class="on">Posts</div><div>Réponses</div><div>Médias</div></div>
    ${PROFILE_POSTS.map(post).join('')}`);
}

// ─── PNG RVB 24 bits ─────────────────────────────────────────────────────────────────────
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])));
  return Buffer.concat([head, data, crc]);
}

/** Réencode un PNG 8 bits RVBA (sortie de Chromium) en RVB, alpha composé sur blanc. */
function toRgbPng(png) {
  let offset = 8;
  let ihdr;
  const idat = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('latin1', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') ihdr = data;
    else if (type === 'IDAT') idat.push(data);
    offset += 12 + length;
  }
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const [depth, colorType, , , interlace] = ihdr.subarray(8);
  assert.equal(depth, 8, 'PNG 8 bits attendu');
  assert.equal(interlace, 0, 'PNG non entrelacé attendu');
  if (colorType === 2) return { png, width, height };
  assert.equal(colorType, 6, 'PNG RVBA attendu');

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const out = Buffer.alloc(height * (1 + width * 3));
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const left = i >= 4 ? line[i - 4] : 0;
      const up = prev[i];
      const diag = i >= 4 ? prev[i - 4] : 0;
      if (filter === 1) line[i] += left;
      else if (filter === 2) line[i] += up;
      else if (filter === 3) line[i] += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - diag;
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - diag)];
        line[i] += pa <= pb && pa <= pc ? left : pb <= pc ? up : diag;
      }
    }
    const row = y * (1 + width * 3);
    for (let x = 0; x < width; x++) {
      const alpha = line[x * 4 + 3];
      for (let k = 0; k < 3; k++) {
        out[row + 1 + x * 3 + k] = Math.round(
          (line[x * 4 + k] * alpha + 255 * (255 - alpha)) / 255,
        );
      }
    }
    prev = line;
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return {
    png: Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk('IHDR', header),
      pngChunk('IDAT', zlib.deflateSync(out, { level: 9 })),
      pngChunk('IEND', Buffer.alloc(0)),
    ]),
    width,
    height,
  };
}

const produced = [];
function save(name, buffer, width, height) {
  const result = toRgbPng(buffer);
  assert.deepEqual([result.width, result.height], [width, height], `${name} : dimensions`);
  const file = path.join(OUT, name);
  writeFileSync(file, result.png);
  produced.push(file);
  console.log(`  ${path.relative(process.cwd(), file)} (${width}×${height})`);
}

// ─── Mise en scène ───────────────────────────────────────────────────────────────────────
const W = 1280;
const H = 800;
/** Cadre des captures « fil » : la capture brute y est affichée à l'échelle FRAME.scale. */
const FRAME = { x: 64, y: 168, w: 1152, h: 600, scale: 1.2 };
const RAW = { width: FRAME.w / FRAME.scale, height: FRAME.h / FRAME.scale };

const brandRow = (size = 34, text = 16) => `
  <div class="brand" style="font-size:${text}px">
    <span class="logo" style="width:${size}px;height:${size}px">${ICON}</span>BLINDSPOT
  </div>`;

const STAGE_CSS = `
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; }
  body { background: ${C.concrete}; position: relative; font-family: system-ui, 'Segoe UI', sans-serif; }
  .brand { display: flex; align-items: center; gap: 12px; font-family: ${MONO}; font-weight: 700;
    letter-spacing: 0.14em; color: ${C.acid}; text-transform: uppercase; }
  .logo { display: block; flex: none; }
  .logo svg { width: 100%; height: 100%; display: block; }
  .band { position: absolute; inset: 0 0 auto 0; height: 136px; background: ${C.black};
    display: flex; align-items: center; gap: 32px; padding: 0 64px; }
  .band .sep { width: 4px; align-self: stretch; margin: 34px 0; background: ${C.acid}; flex: none; }
  .caption { font: 700 31px/1.18 ${MONO}; color: #fff; text-transform: uppercase; letter-spacing: 0.01em; }
  .frame { position: absolute; overflow: hidden; border-radius: 16px; background: #fff;
    box-shadow: 0 0 0 1px rgba(74,74,72,0.25), 0 20px 44px rgba(17,17,17,0.22); }
  .frame img { display: block; width: 100%; height: 100%; }
  .halo { position: absolute; border: 4px solid ${C.acid}; border-radius: 14px;
    box-shadow: 0 0 0 2px ${C.black}, 0 0 0 6px rgba(198,244,50,0.4), inset 0 0 0 2px ${C.black}; }
  .halo.round { border-radius: 9999px; }
  .label { position: absolute; transform: translate(-50%, -50%); white-space: nowrap;
    font: 700 19px/1 ${MONO}; text-transform: uppercase; letter-spacing: 0.04em;
    padding: 11px 16px; border-radius: 8px; background: ${C.black}; color: ${C.acid};
    box-shadow: 0 0 0 2px ${C.acid}, 0 8px 20px rgba(17,17,17,0.3); }
  .label.light { background: ${C.acid}; color: ${C.black}; box-shadow: 0 0 0 2px ${C.black}, 0 8px 20px rgba(0,0,0,0.4); }
  svg.arrows { position: absolute; inset: 0; width: ${W}px; height: ${H}px; pointer-events: none; overflow: visible; }
  .side { background: ${C.black}; }
  .side .text { position: absolute; left: 80px; top: 0; bottom: 0; width: 540px; display: flex;
    flex-direction: column; justify-content: center; gap: 28px; }
  .side h1 { font: 700 50px/1.08 ${MONO}; color: ${C.acid}; text-transform: uppercase; }
  .side p { font-size: 22px; line-height: 1.45; color: ${C.concrete}; }
  .side .frame { box-shadow: 0 0 0 1px ${C.graphite}, 0 24px 60px rgba(0,0,0,0.6); }
`;

// Flèches calculées dans la page, une fois les étiquettes mesurées.
const ARROW_SCRIPT = `
  const NS = 'http://www.w3.org/2000/svg';
  const layer = document.querySelector('svg.arrows');
  const add = (tag, attrs) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    layer.append(el);
  };
  for (const label of document.querySelectorAll('.label')) {
    const halo = document.getElementById(label.dataset.for);
    const a = label.getBoundingClientRect();
    const b = halo.getBoundingClientRect();
    const c1 = { x: a.left + a.width / 2, y: a.top + a.height / 2 };
    const c2 = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    const len = Math.hypot(c2.x - c1.x, c2.y - c1.y);
    const u = { x: (c2.x - c1.x) / len, y: (c2.y - c1.y) / len };
    const reach = (r) => Math.min(r.width / 2 / Math.abs(u.x || 1e-6), r.height / 2 / Math.abs(u.y || 1e-6));
    const start = { x: c1.x + u.x * (reach(a) + 8), y: c1.y + u.y * (reach(a) + 8) };
    const tip = { x: c2.x - u.x * (reach(b) + 14), y: c2.y - u.y * (reach(b) + 14) };
    const base = { x: tip.x - u.x * 20, y: tip.y - u.y * 20 };
    const n = { x: -u.y * 11, y: u.x * 11 };
    const [outline, core] = label.classList.contains('light') ? ['${C.black}', '${C.acid}'] : ['${C.acid}', '${C.black}'];
    const line = { x1: start.x, y1: start.y, x2: base.x, y2: base.y, 'stroke-linecap': 'round' };
    add('line', { ...line, stroke: outline, 'stroke-width': 10 });
    const head = [tip, { x: base.x + n.x, y: base.y + n.y }, { x: base.x - n.x, y: base.y - n.y }]
      .map((p) => p.x + ',' + p.y).join(' ');
    add('polygon', { points: head, fill: core, stroke: outline, 'stroke-width': 3, 'stroke-linejoin': 'round' });
    add('line', { ...line, stroke: core, 'stroke-width': 4 });
  }
`;

/**
 * Annotations : `box` en coordonnées de la capture brute, converties via `map`.
 * `at` : centre de l'étiquette, en coordonnées de la page de mise en scène.
 */
function annotations(notes, map) {
  return notes
    .map((note, i) => {
      const pad = note.pad ?? 7;
      const p = map(note.box.x, note.box.y);
      const q = map(note.box.x + note.box.w, note.box.y + note.box.h);
      return `
      <div class="halo${note.round ? ' round' : ''}" id="halo-${i}" style="left:${p.x - pad}px;top:${p.y - pad}px;width:${q.x - p.x + 2 * pad}px;height:${q.y - p.y + 2 * pad}px"></div>
      <div class="label${note.light ? ' light' : ''}" data-for="halo-${i}" style="left:${note.at.x}px;top:${note.at.y}px">${esc(note.label)}</div>`;
    })
    .join('');
}

function stageFrame({ caption, shot, notes }) {
  const map = (x, y) => ({ x: FRAME.x + x * FRAME.scale, y: FRAME.y + y * FRAME.scale });
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${STAGE_CSS}</style></head><body>
    <div class="band">${brandRow()}<span class="sep"></span><p class="caption">${esc(caption)}</p></div>
    <div class="frame" style="left:${FRAME.x}px;top:${FRAME.y}px;width:${FRAME.w}px;height:${FRAME.h}px"><img src="${shot}" alt=""></div>
    ${annotations(notes, map)}
    <svg class="arrows"></svg>
    <script>${ARROW_SCRIPT}</script>
  </body></html>`;
}

/** Capture d'une page d'extension, posée à droite sur fond noir avec un titre à gauche. */
function stageSide({ title, text, shot, size, scale, notes, right = 1210 }) {
  const w = size.width * scale;
  const h = size.height * scale;
  const left = right - w;
  const top = (H - h) / 2;
  const map = (x, y) => ({ x: left + x * scale, y: top + y * scale });
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${STAGE_CSS}</style></head><body class="side">
    <div class="text">${brandRow(40, 18)}<h1>${esc(title)}</h1><p>${esc(text)}</p></div>
    <div class="frame" style="left:${left}px;top:${top}px;width:${w}px;height:${h}px;border-radius:14px"><img src="${shot}" alt=""></div>
    ${annotations(notes, map)}
    <svg class="arrows"></svg>
    <script>${ARROW_SCRIPT}</script>
  </body></html>`;
}

const dataUrl = (buffer) => `data:image/png;base64,${buffer.toString('base64')}`;

// ─── Boutons dans la page (shadow DOM fermé) : positions via CDP ─────────────────────────
async function inpageBoxes(page) {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const cls = (n) => {
      const attrs = n.attributes ?? [];
      const i = attrs.indexOf('class');
      return i >= 0 && i % 2 === 0 ? attrs[i + 1] : '';
    };
    const hits = [];
    const walk = (node, slot) => {
      const c = cls(node);
      const current = c.startsWith('slot ') ? c : slot;
      if (current && (c === 'main' || c === 'picker')) hits.push({ node, kind: c, slot: current });
      for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) {
        walk(child, current);
      }
    };
    walk(root, '');
    const boxes = [];
    for (const hit of hits) {
      const { model } = await cdp.send('DOM.getBoxModel', { nodeId: hit.node.nodeId });
      const [x1, y1, , , x3, y3] = model.border;
      boxes.push({ kind: hit.kind, slot: hit.slot, x: x1, y: y1, w: x3 - x1, h: y3 - y1 });
    }
    return boxes;
  } finally {
    await cdp.detach();
  }
}

async function waitForBox(page, predicate, what) {
  // Position stable sur deux lectures : le bouton est d'abord monté en (0, 0), puis placé.
  let last = null;
  for (let i = 0; i < 60; i++) {
    const box = (await inpageBoxes(page)).find(predicate);
    if (box && box.w > 0 && box.y > 0 && last && JSON.stringify(box) === JSON.stringify(last)) {
      return box;
    }
    last = box;
    await page.waitForTimeout(100);
  }
  throw new Error(`bouton introuvable : ${what}`);
}

/** Boîte Playwright (`width`, `height`) → `w`, `h`. */
const toBox = ({ x, y, width, height }) => ({ x, y, w: width, h: height });

const union = (...boxes) => {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    w: Math.max(...boxes.map((b) => b.x + b.w)) - x,
    h: Math.max(...boxes.map((b) => b.y + b.h)) - y,
  };
};

// ─── Navigateurs ─────────────────────────────────────────────────────────────────────────
const NO_NETWORK = [
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-sync',
  '--no-first-run',
  '--no-pings',
];

const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  deviceScaleFactor: 2,
  locale: 'fr-FR',
  colorScheme: 'light',
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, ...NO_NETWORK],
});
const stageBrowser = await chromium.launch({
  channel: 'chromium',
  headless: true,
  args: NO_NETWORK,
});
const stage = await stageBrowser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
});

try {
  // Seul x.com est servi, par des pages synthétiques ; tout le reste est bloqué.
  const routeAll = async (route) => {
    const url = new URL(route.request().url());
    // Pages de l'extension elle-même (popup, options) : locales.
    if (url.protocol === 'chrome-extension:') return route.continue();
    if (url.hostname !== 'x.com' || route.request().resourceType() !== 'document') {
      return route.abort();
    }
    const handle = url.pathname.slice(1);
    const body = ACCOUNTS[handle]
      ? profilePage(handle)
      : feedPage(handle === 'explore' ? MENU_FEED : FEED);
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body });
  };
  await ctx.route('**/*', routeAll);
  await stage.route('**/*', (route) => route.abort());

  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
  const extensionId = new URL(sw.url()).host;
  await sw.evaluate(
    ({ handles, extra }) =>
      chrome.storage.local.set({
        settings: { discreet: false },
        userLists: [
          {
            id: 'user-store-bruit',
            name: 'Bruit de fond',
            enabled: true,
            createdAt: '2026-10-20T09:00:00.000Z',
            entries: [...handles, ...extra].map((handle, i) => ({
              platform: 'x',
              handle,
              addedAt: new Date(Date.UTC(2026, 9, 20 + i, 9)).toISOString(),
            })),
          },
          {
            id: 'user-store-spoilers',
            name: 'Spoilers séries',
            enabled: false,
            createdAt: '2026-10-22T09:00:00.000Z',
            entries: ['fin_de_saison', 'episode_final'].map((handle) => ({
              platform: 'x',
              handle,
              addedAt: '2026-10-22T09:00:00.000Z',
            })),
          },
        ],
      }),
    { handles: LISTED, extra: ['promo_flash', 'top_tendance'] },
  );

  async function shoot(name, html) {
    const page = await stage.newPage();
    await page.setContent(html);
    await page.evaluate(() => document.fonts.ready);
    writeFileSync(path.join(TEMP, name.replace('.png', '.html')), html);
    save(name, await page.screenshot({ type: 'png' }), W, H);
    await page.close();
  }

  console.log('Captures :');
  const feed = await ctx.newPage();
  await feed.setViewportSize(RAW);
  await feed.goto('https://x.com/home');
  await feed.waitForFunction(() => {
    const cell = document.querySelectorAll('[data-testid="cellInnerDiv"]')[1];
    return cell && getComputedStyle(cell, '::after').content.includes('Blindspot');
  });

  // 1. Fil : post normal, post masqué, post survolé avec l'icône « Masquer ».
  {
    const tweet = feed.locator('article', { hasText: '@gazette_plateau' });
    const text = await tweet.locator('.text').boundingBox();
    await feed.mouse.move(text.x + 40, text.y + 8);
    const icon = await waitForBox(feed, (b) => b.slot.includes('icon'), 'icône du post');
    await feed.mouse.move(icon.x + icon.w / 2, icon.y + icon.h / 2);
    await feed.waitForTimeout(300);
    const shot = await feed.screenshot();
    writeFileSync(path.join(TEMP, 'raw-01-fil.png'), shot);
    const p = { x: FRAME.x + icon.x * FRAME.scale, y: FRAME.y + icon.y * FRAME.scale };
    await shoot(
      '01-fil-masquer.png',
      stageFrame({
        caption: 'Un clic à côté de l’heure pour masquer un compte',
        shot: dataUrl(shot),
        notes: [
          { box: icon, round: true, pad: 3, label: 'Masquer', at: { x: p.x + 230, y: p.y - 34 } },
        ],
      }),
    );
  }

  // 2. Menu « … » d'un post, entrée Blindspot, choix de la liste.
  {
    await feed.mouse.move(2, RAW.height - 2);
    await feed.goto('https://x.com/explore');
    await feed.waitForTimeout(500);
    await feed
      .locator('article', { hasText: '@ronchon_lundi' })
      .locator('[data-testid="caret"]')
      .click();
    await feed.locator('#layers [role="menu"]').waitFor();
    // La souris quitte le post : l'icône à côté de l'heure disparaît.
    const menuBox = await feed.locator('#layers [role="menu"]').boundingBox();
    await feed.mouse.move(menuBox.x + 150, menuBox.y + 30);
    const entry = await waitForBox(feed, (b) => b.slot.includes('menuitem'), 'entrée du menu');
    await feed.waitForTimeout(600);
    await feed.mouse.click(entry.x + entry.w / 2, entry.y + entry.h / 2);
    const picker = await waitForBox(feed, (b) => b.kind === 'picker', 'choix de liste');
    // Souris sur le titre du choix de liste : pas d'effet de survol sur l'entrée.
    await feed.mouse.move(picker.x + picker.w / 2, picker.y + 14);
    await feed.waitForTimeout(300);
    const shot = await feed.screenshot();
    writeFileSync(path.join(TEMP, 'raw-02-menu.png'), shot);
    const p = { x: FRAME.x + entry.x * FRAME.scale, y: FRAME.y + entry.y * FRAME.scale };
    await shoot(
      '02-menu-liste.png',
      stageFrame({
        caption: 'Ou depuis le menu « … » d’un post, dans la liste de votre choix',
        shot: dataUrl(shot),
        notes: [
          {
            box: union(entry, picker),
            label: 'Ajouter à une liste',
            at: { x: p.x - 230, y: p.y + 120 },
          },
        ],
      }),
    );
    await feed.close();
  }

  // 3. En-tête de profil.
  {
    const profile = await ctx.newPage();
    await profile.setViewportSize(RAW);
    await profile.goto('https://x.com/ronchon_lundi');
    const chip = await waitForBox(profile, (b) => b.slot.includes('chip'), 'bouton du profil');
    await profile.waitForTimeout(300);
    const shot = await profile.screenshot();
    writeFileSync(path.join(TEMP, 'raw-03-profil.png'), shot);
    const p = { x: FRAME.x + chip.x * FRAME.scale, y: FRAME.y + chip.y * FRAME.scale };
    await shoot(
      '03-profil.png',
      stageFrame({
        caption: 'Sur un profil, le bouton attend à côté du menu',
        shot: dataUrl(shot),
        notes: [{ box: chip, label: 'Un clic suffit', at: { x: p.x - 120, y: p.y - 110 } }],
      }),
    );
    await profile.close();
  }

  // 4. Popup.
  {
    await sw.evaluate(async () => {
      await chrome.storage.local.set({ ignoredTotal: 1284 });
      await chrome.storage.session.set({ ignoredSession: 37 });
    });
    const popup = await ctx.newPage();
    await popup.setViewportSize({ width: 360, height: 600 });
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.getByRole('switch', { name: 'Activé' }).waitFor();
    await popup.getByRole('button', { name: /Bruit de fond/ }).click();
    await popup.getByText('@clash_permanent').waitFor();
    const height = await popup.evaluate(() => document.documentElement.scrollHeight);
    await popup.setViewportSize({ width: 360, height });
    await popup.waitForTimeout(200);
    const form = toBox(
      await popup
        .getByPlaceholder('@compte ou lien x.com')
        .locator('xpath=ancestor::form[1]')
        .boundingBox(),
    );
    const shot = await popup.screenshot();
    writeFileSync(path.join(TEMP, 'raw-04-popup.png'), shot);
    const scale = Math.min(1.5, 720 / height);
    const size = { width: 360, height };
    const left = 1210 - 360 * scale;
    const top = (H - height * scale) / 2;
    await shoot(
      '04-popup.png',
      stageSide({
        title: 'Vos listes, vos règles',
        text: 'Créez des listes, ajoutez un compte par son @ ou son lien, activez ou coupez le masquage d’un geste.',
        shot: dataUrl(shot),
        size,
        scale,
        notes: [
          {
            box: form,
            label: 'Ajouter un compte',
            light: true,
            at: { x: left - 190, y: top + (form.y + form.h / 2) * scale },
          },
        ],
      }),
    );
    console.log(`  (popup : ${360}×${height}, échelle ${scale.toFixed(2)})`);
    await popup.close();
  }

  // 5. Options.
  {
    const options = await ctx.newPage();
    await options.setViewportSize(RAW);
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    const discreet = options.getByRole('switch', { name: 'Mode discret' });
    await discreet.waitFor();
    await options.evaluate(() => {
      const legend = [...document.querySelectorAll('legend')].find((l) =>
        l.textContent.includes('Ce qui est masqué'),
      );
      scrollTo(0, legend.getBoundingClientRect().top + scrollY - 16);
    });
    await options.waitForTimeout(200);
    // Halo sur l'interrupteur et son libellé, pas sur le texte d'aide.
    const option = union(
      toBox(await discreet.boundingBox()),
      toBox(await options.getByText('Mode discret', { exact: true }).boundingBox()),
    );
    const shot = await options.screenshot();
    writeFileSync(path.join(TEMP, 'raw-05-options.png'), shot);
    const p = { x: FRAME.x + option.x * FRAME.scale, y: FRAME.y + option.y * FRAME.scale };
    await shoot(
      '05-options.png',
      stageFrame({
        caption: 'Réglez l’encart, ce qui est masqué et le mode discret',
        shot: dataUrl(shot),
        notes: [{ box: option, label: 'Zéro trace', at: { x: p.x - 170, y: p.y + 10 } }],
      }),
    );
    await options.close();
  }

  // Vignettes promo.
  console.log('Vignettes :');
  const tile = (
    w,
    h,
    body,
    css,
  ) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; }
    html, body { width: ${w}px; height: ${h}px; overflow: hidden; }
    body { background: ${C.black}; position: relative; font-family: system-ui, 'Segoe UI', sans-serif; }
    .logo svg { width: 100%; height: 100%; display: block; }
    .name { font: 700 1px/1 ${MONO}; color: ${C.acid}; text-transform: uppercase; letter-spacing: 0.06em; }
    .tag { color: ${C.concrete}; }
    ${css}</style></head><body>${body}</body></html>`;
  {
    const page = await stage.newPage();
    await page.setViewportSize({ width: 440, height: 280 });
    await page.setContent(
      tile(
        440,
        280,
        `<div class="wrap"><div class="row"><span class="logo">${ICON}</span><span class="name">Blindspot</span></div>
         <p class="tag">Choisissez ce que vous<br>ne voulez plus voir.</p></div><div class="bar"></div>`,
        `.wrap { position: absolute; inset: 0 0 14px 0; display: flex; flex-direction: column; justify-content: center; padding: 0 36px; gap: 22px; }
         .row { display: flex; align-items: center; gap: 18px; }
         .logo { width: 76px; height: 76px; flex: none; }
         .name { font-size: 46px; }
         .tag { font-size: 20px; line-height: 1.35; max-width: 330px; }
         .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 14px; background: ${C.acid}; }`,
      ),
    );
    save('promo-petite-440x280.png', await page.screenshot({ type: 'png' }), 440, 280);
    await page.close();
  }
  {
    const page = await stage.newPage();
    await page.setViewportSize({ width: 1400, height: 560 });
    const line = (w) => `<i style="width:${w}%"></i>`;
    const card = (color, widths) =>
      `<div class="card"><span class="av" style="background:${color}"></span><div class="lines">${widths.map(line).join('')}</div></div>`;
    await page.setContent(
      tile(
        1400,
        560,
        `<div class="left"><span class="logo">${ICON}</span><div><div class="name">Blindspot</div>
           <p class="tag">Choisissez ce que vous<br>ne voulez plus voir.</p></div></div>
         <div class="cards">${card('#F2A65A', [70, 92, 55])}
           <div class="card hidden">Post masqué par Blindspot</div>${card('#3B8EA5', [62, 88, 40])}</div>`,
        `.left { position: absolute; left: 96px; top: 0; bottom: 0; width: 760px; display: flex; align-items: center; gap: 44px; }
         .logo { width: 176px; height: 176px; flex: none; }
         .name { font-size: 92px; }
         .tag { font-size: 30px; line-height: 1.35; margin-top: 20px; max-width: 500px; }
         .cards { position: absolute; right: 96px; top: 50%; transform: translateY(-50%); width: 400px; display: flex; flex-direction: column; gap: 16px; }
         .card { height: 112px; border-radius: 16px; background: ${C.concrete}; display: flex; gap: 18px; padding: 22px; }
         .av { width: 48px; height: 48px; border-radius: 50%; flex: none; }
         .lines { flex: 1; display: flex; flex-direction: column; gap: 12px; padding-top: 4px; }
         .lines i { display: block; height: 12px; border-radius: 6px; background: #c9c9c4; }
         .card.hidden { background: ${C.graphite}; color: ${C.acid}; align-items: center; justify-content: center;
           font: 700 20px/1 ${MONO}; text-transform: uppercase; letter-spacing: 0.05em; box-shadow: 0 0 0 3px ${C.acid}; }`,
      ),
    );
    save('promo-grande-1400x560.png', await page.screenshot({ type: 'png' }), 1400, 560);
    await page.close();
  }

  console.log(`${produced.length} visuels dans ${path.relative(process.cwd(), OUT)}`);
} finally {
  await ctx.close();
  await stageBrowser.close();
}
