// Lance un vrai Brave (ou Chrome) avec un profil dédié (.x-brave/, ignoré par git) et un
// port de débogage local. Aucun flag d'automatisation : X accepte la connexion, faite à la
// main. Les scripts de spike s'y attachent ensuite via
// chromium.connectOverCDP('http://127.0.0.1:9333').
//
// ⚠️ Tant que ce navigateur est ouvert, tout programme local peut le piloter par ce port.
// Le fermer après les tests.
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';

const candidates = [
  process.env.X_BROWSER,
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
  `${process.env.LOCALAPPDATA}/BraveSoftware/Brave-Browser/Application/brave.exe`,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/usr/bin/brave-browser',
].filter(Boolean);
const executable = candidates.find((p) => existsSync(p));
if (!executable) throw new Error('Brave ou Chrome introuvable : définir X_BROWSER');

const profile = path.resolve('.x-brave');
// `--extension` : charge le build Chrome (`pnpm build:chrome`) dans ce navigateur de test.
const withExtension = process.argv.includes('--extension');
const extensionArgs = withExtension
  ? [
      `--load-extension=${path.resolve('.output/chrome-mv3')}`,
      '--enable-unsafe-extension-debugging',
    ]
  : [];
// Chromium garde en cache le service worker d'une extension non empaquetée tant que la version
// du manifest ne change pas : on le vide pour charger le dernier build.
if (withExtension) {
  rmSync(path.join(profile, 'Default', 'Service Worker'), { recursive: true, force: true });
}
spawn(
  executable,
  [
    `--user-data-dir=${profile}`,
    '--remote-debugging-port=9333',
    '--remote-debugging-address=127.0.0.1',
    '--no-first-run',
    ...extensionArgs,
    'https://x.com/login',
  ],
  { detached: true, stdio: 'ignore' },
).unref();
console.log(`Navigateur lancé (${path.basename(executable)}), profil ${profile}.`);
console.log('Connecte-toi à X normalement, puis laisse la fenêtre ouverte.');
