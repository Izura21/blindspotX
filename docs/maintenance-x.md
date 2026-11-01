# Maintenance X : « X a cassé quelque chose »

X change son DOM sans préavis. Blindspot repère les posts par des sélecteurs CSS (`data-testid`, liens de profil, avatars) : si l'un d'eux ne correspond plus, le masquage s'arrête en silence. L'objectif est de publier un correctif **en moins de 48 h** après la casse.

Tous les sélecteurs vivent dans [`src/platforms/x/selectors.ts`](../src/platforms/x/selectors.ts). Quelques motifs secondaires restent dans le code qui les utilise : `[data-testid="placementTracking"]` et `<id>-follow` dans `inpage.ts`, `a[href^="/"]` (lien de profil dans le bloc auteur) dans `inpage.ts` et le smoke test.

| Étape | Délai visé |
|---|---|
| 1. Détecter | dès le signalement |
| 2. Diagnostiquer | < 4 h |
| 3. Corriger + tests | < 24 h |
| 4. Vérifier sur le vrai X | < 24 h |
| 5. Publier | < 48 h (revue des stores comprise, voir plus bas) |

## 1. Détecter

### Symptômes et sélecteur probable

| Symptôme | Sélecteur à regarder |
|---|---|
| Plus aucun post masqué, nulle part | `cell`, `tweet`, `userName` (ou les liens `a[href="/handle"]` dans le bloc auteur) |
| Posts masqués, mais aussi des posts qui ne devraient pas l'être | `quote` (le bloc cité est pris pour le bloc auteur) |
| Citations d'un compte listé plus masquées | `quote`, `avatarPrefix` |
| Reposts faits par un compte listé plus masqués | `socialContext` |
| Encart de mauvaise couleur (thème) | `body` + `THEMES` (style inline du body) |
| Plus d'icône « Masquer » à côté de l'heure | `permalink`, `userName` |
| Plus de bouton dans le menu « … » d'un post | `caret`, `menu` |
| Plus de bouton sur l'en-tête d'un profil, userId non capturé | `profileActions`, `profileFollowButton` |
| Compteur de posts ignorés bloqué | `cell`, `permalink` (identifiant du post) |
| Raccourcis clavier ou médias plus neutralisés | `cell` (voir `src/core/guards.ts`) |

Sources de signalement : retours d'utilisateurs (avis des stores, issues), usage quotidien, ou le smoke test lancé de temps en temps (avant chaque release au minimum).

### Smoke test `pnpm smoke:x`

Il s'attache au Brave de test, visite 3 pages (accueil, profil d'un compte listé, recherche), scrolle et vérifie :

- **chaque sélecteur de `selectors.ts`** : trouvé / introuvable, avec le nombre d'éléments par page ;
- **les posts des comptes listés sont masqués** (comparaison post par post, harnais `scripts/validate-x.mjs`) ;
- **aucun faux positif** (post masqué alors que son auteur n'est pas listé) ;
- **les citations** d'un compte listé masquées, et seulement elles ;
- l'auteur est reconnu sur le profil listé (sinon, un sélecteur d'auteur est cassé) ;
- l'**hôte des boutons in-page** existe (`src/core/inpage.ts`) ; le **caret** est vérifié avec les sélecteurs.

```bash
pnpm build:chrome
node scripts/x-browser.mjs --extension   # puis se connecter à X à la main dans la fenêtre
pnpm smoke:x                             # ou : pnpm smoke:x /home /ECiotti "/search?q=Zemmour&f=live"
```

Lecture seule : scroll uniquement, aucun clic, aucun like, post ni follow. **4 pages au plus par exécution** : X limite le débit des chargements de profils. Les identifiants X ne sont jamais demandés ni stockés : la connexion se fait à la main dans la fenêtre, la session reste dans `.x-brave/` (ignoré par git).

Lecture du résultat :

- `✅` vérification passée, `⚠️` non vérifiable ici (citation ou repost absent du fil du moment, menu qui exige un clic, profil non listé), `❌` échec.
- Code de sortie : `0` tout passe, `1` au moins un échec, `2` navigateur de test non lancé ou session X fermée.
- Détail complet dans `temp/smoke-x.json`. Un `⚠️` sur `quote` ou `socialContext` se lève en ajoutant une page riche en citations, par exemple `"/search?q=Bardella&f=live"`.
- L'hôte des boutons in-page est absent en **mode discret** : désactiver ce réglage avant de lancer le test.

Après les essais, **fermer ce Brave** : tant qu'il est ouvert, son port de débogage (9333) reste accessible à tout programme local.

## 2. Diagnostiquer

1. Dans le Brave de test (ou n'importe quel navigateur connecté à X), ouvrir les DevTools sur un post qui devrait être masqué.
2. Tester les sélecteurs de `selectors.ts` dans la console, un par un :

   ```js
   document.querySelectorAll('[data-testid="cellInnerDiv"]').length;
   document.querySelectorAll('article[data-testid="tweet"]').length;
   document.querySelectorAll('[data-testid="User-Name"] a[href^="/"]').length;
   ```

3. Lister les `data-testid` d'un post pour repérer un renommage (élément sélectionné dans l'inspecteur = `$0`) :

   ```js
   [...new Set([...$0.closest('article').querySelectorAll('[data-testid]')].map((e) => e.dataset.testid))];
   ```

4. Vérifier que le CSS est bien injecté : sur une cellule qui devrait être masquée, `getComputedStyle($0.closest('[data-testid="cellInnerDiv"]'), '::after').content` vaut le texte de l'encart (et non `none`). Le CSS ne pose aucun marqueur lisible : l'encart est le seul signe visible. Les gardes, le compteur et les boutons refont la correspondance côté content script avec les mêmes sélecteurs (`xHiddenSelectors`, `src/core/hidden.ts`), donc une casse de sélecteur les touche aussi. Si l'encart est absent alors que les sélecteurs trouvent bien les éléments, la casse vient d'ailleurs (règle `:has()`, structure parent / enfant changée) : comparer le DOM réel au DOM synthétique de `src/platforms/x/css.browser.test.ts`.
5. Capturer un fragment anonymisé du DOM qui casse (section suivante) : il sert de test de non-régression.

## 3. Capturer un fragment DOM anonymisé

But : garder une trace du DOM réel qui a cassé, sans aucune donnée personnelle, pour écrire un test qui échoue avant le correctif et passe après. Les fixtures vont dans `tests/fixtures/x/`.

1. Dans l'inspecteur, sélectionner le post concerné (n'importe quel élément à l'intérieur : `$0`).
2. Coller ce script dans la console. Il clone la cellule, remplace les handles par `compte1`, `compte2`… (de façon cohérente : liens, avatars, `@handle`), efface les textes, les médias, les identifiants de post et d'utilisateur, puis copie le HTML dans le presse-papiers :

   ```js
   (() => {
     const cell = $0.closest('[data-testid="cellInnerDiv"]');
     const clone = cell.cloneNode(true);
     const aliases = new Map();
     const alias = (h) => {
       const k = h.toLowerCase();
       if (!aliases.has(k)) aliases.set(k, `compte${aliases.size + 1}`);
       return aliases.get(k);
     };
     const AVATAR = 'UserAvatar-Container-';
     for (const el of clone.querySelectorAll('*')) {
       for (const { name, value } of [...el.attributes]) {
         if (name === 'href') {
           const m = value.match(/^\/([A-Za-z0-9_]{1,15})(\/.*)?$/);
           // Seul `/status/<id>` est gardé après le handle (permalien), avec un identifiant fictif.
           const rest = /^\/status\/\d+/.test(m?.[2] ?? '') ? '/status/1' : '';
           el.setAttribute('href', m ? `/${alias(m[1])}${rest}` : '#');
         } else if (name === 'data-testid' && value.startsWith(AVATAR)) {
           el.setAttribute(name, AVATAR + alias(value.slice(AVATAR.length)));
         } else if (name === 'data-testid' && /^\d+-(un)?follow$/.test(value)) {
           el.setAttribute(name, value.replace(/^\d+/, '1'));
         } else if (['src', 'srcset', 'poster', 'alt', 'title', 'aria-label', 'aria-labelledby', 'aria-describedby', 'id'].includes(name)) {
           el.removeAttribute(name);
         } else if (name === 'datetime') {
           el.setAttribute(name, '2026-01-01T00:00:00.000Z');
         } else if (name === 'style' && value.includes('url(')) {
           el.setAttribute(name, value.replace(/url\([^)]*\)/g, 'none'));
         }
       }
     }
     const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
     for (let node; (node = walker.nextNode()); ) {
       const t = node.nodeValue.trim();
       if (!t) continue;
       const at = t.match(/^@([A-Za-z0-9_]{1,15})$/);
       node.nodeValue = at ? `@${alias(at[1])}` : 'texte';
     }
     copy(clone.outerHTML);
     console.log('Copié. Handles :', Object.fromEntries(aliases));
   })();
   ```

3. **Relire le HTML avant de le commiter** : chercher le nom, le handle ou un mot du post d'origine (aucun ne doit rester), une URL `pbs.twimg.com` ou `t.co`, un identifiant numérique long. Supprimer à la main ce qui reste (cartes de lien, sondages, vidéos).
4. Enregistrer dans `tests/fixtures/x/<cas>-<date>.html` (ex. `citation-imbriquee-2026-11-03.html`) et noter en tête, dans un commentaire HTML, la page d'origine (type de page, pas l'URL) et la date de capture.
5. Le charger dans un test navigateur (`src/platforms/x/*.browser.test.ts`) avec un import `?raw` de Vite, à la place du DOM synthétique, et vérifier le masquage attendu du compte aliasé (`compte1`, etc.) :

   ```ts
   import fixture from '../../../tests/fixtures/x/citation-imbriquee-2026-11-03.html?raw';
   // render(fixture, ['compte2']) puis expect(overlay(...)).toContain('Post masqué')
   ```

Le script de recapture complet (toutes les pages de #14 en un passage) reste à faire dans #14.

## 4. Corriger

1. **`src/platforms/x/selectors.ts`** : remplacer le sélecteur fautif. Garder un sélecteur aussi stable que possible (`data-testid`, `role`, lien de profil) plutôt qu'une classe générée. Mettre à jour la date de validation en tête du fichier.
2. Si un motif hors de `selectors.ts` est concerné (voir l'introduction), le déplacer dans `selectors.ts` au passage.
3. **Tests unitaires** : `src/platforms/x/css.test.ts` (chaînes de sélecteurs attendues dans le CSS généré), `handle.test.ts` si le format des liens a changé.
4. **Tests navigateur** : mettre le DOM synthétique de `src/platforms/x/css.browser.test.ts` et `inpage.browser.test.ts` au niveau du nouveau DOM, et ajouter le fragment capturé à l'étape 3 comme test de non-régression. Le DOM synthétique de `scripts/e2e-chromium.mjs` et `src/core/*.browser.test.ts` utilise aussi `cellInnerDiv` / `User-Name` : l'adapter si ces sélecteurs ont changé.
5. Si `smoke-x.mjs` signale un nouveau sélecteur sans attente (`EXPECT`), l'ajouter.
6. Lancer :

   ```bash
   pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:browser
   pnpm test:e2e
   ```

## 5. Vérifier sur le vrai X

```bash
pnpm build:chrome
node scripts/x-browser.mjs --extension   # relancer : vide le cache du service worker
pnpm smoke:x
```

Tout doit être `✅` (les `⚠️` de contenu sont acceptables s'ils ont été vérifiés une fois sur une page qui contient des citations et des reposts). Pour une validation plus large : `node scripts/validate-x.mjs <pages…>` (4 pages au plus par lancement là aussi). Vérifier aussi à la main dans Firefox si le correctif touche une règle `:has()` complexe. Fermer le Brave de test ensuite.

## 6. Publier (< 48 h)

La publication suit le flux de release ([`docs/release.md`](release.md)) :

1. PR du correctif vers `main`, relue et fusionnée.
2. `pnpm release patch` : bump de version (patch), commit et tag.
3. Push du tag : la release GitHub produit les zips Chrome et Firefox (et les sources pour AMO).
4. Envoi aux stores : Chrome Web Store et AMO (Firefox). Dans les notes aux relecteurs, indiquer « correctif de compatibilité avec un changement du site X, aucun changement de permission » pour accélérer la revue.

La revue des stores est le poste le plus long et le moins maîtrisé : envoyer le correctif dès que possible, dans la journée qui suit la casse. Une version qui ne change ni les permissions ni le code distant passe en général plus vite.

## Après coup

- Noter dans le commentaire d.en-tÃªte de `src/platforms/x/selectors.ts` la date et le sÃ©lecteur remplacÃ©.
