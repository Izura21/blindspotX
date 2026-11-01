// Bump de version : `pnpm release <patch|minor|major>`. Met à jour package.json, commite
// « Version X.Y.Z » et crée le tag annoté vX.Y.Z, sans pousser. Voir docs/release.md.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const level = process.argv[2];
const levels = ['patch', 'minor', 'major'];
if (!levels.includes(level)) fail(`Usage : pnpm release <${levels.join('|')}>`);
if (git('status', '--porcelain'))
  fail('Arbre de travail non propre : commite ou range tes changements avant.');

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(pkg.version);
if (!match) fail(`Version inattendue dans package.json : ${pkg.version}`);
let [major, minor, patch] = match.slice(1).map(Number);
if (level === 'major') [major, minor, patch] = [major + 1, 0, 0];
else if (level === 'minor') [minor, patch] = [minor + 1, 0];
else patch += 1;
const version = `${major}.${minor}.${patch}`;
const tag = `v${version}`;
if (git('tag', '--list', tag)) fail(`Le tag ${tag} existe déjà.`);

pkg.version = version;
writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
git('add', 'package.json');
git('commit', '-m', `Version ${version}`);
git('tag', '-a', tag, '-m', `Version ${version}`);

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
console.log(`${pkg.version} commitée et taguée ${tag} sur ${branch}.`);
if (branch !== 'main') console.log('Attention : la release part normalement de main.');
console.log('Pour publier : git push --follow-tags');
