// Zips à partager (Chrome et Firefox) pour chaque variante de listes fournies :
// .output/share/<variante>/. Voir src/core/lists/bundled.ts.
import { execSync } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';

// La variante normale en dernier : les dossiers .output/*-mv3 restent sur la version complète.
const variants = { 'sans-liste': 'nolists', politiques: 'production' };
rmSync('.output/share', { recursive: true, force: true });
for (const [name, mode] of Object.entries(variants)) {
  const dir = `.output/share/${name}`;
  mkdirSync(dir, { recursive: true });
  for (const args of ['', '-b firefox --mv3']) {
    execSync(`pnpm exec wxt zip ${args} --mode ${mode}`, { stdio: 'ignore' });
    for (const file of readdirSync('.output').filter((f) => f.endsWith('.zip'))) {
      renameSync(`.output/${file}`, `${dir}/${file}`);
    }
  }
  console.log(`${dir} : ${readdirSync(dir).join(', ')}`);
}
// Remet les dossiers de dev (.output/*-mv3, chargés dans les navigateurs) sur la version normale.
execSync('pnpm build', { stdio: 'ignore' });
