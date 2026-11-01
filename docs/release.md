# Publier une version

Pousser un tag `vX.Y.Z` déclenche `.github/workflows/release.yml`, qui produit la release GitHub avec les zips. L'envoi aux stores reste manuel.

## 1. Bump de version

Depuis `main` à jour, arbre de travail propre :

```sh
pnpm release patch   # 0.1.1 → 0.1.2 ; minor → 0.2.0 ; major → 1.0.0
```

Le script (`scripts/release.mjs`) met à jour `version` dans `package.json`, commite « Version X.Y.Z » et crée le tag annoté `vX.Y.Z`. Il ne pousse rien : relire le commit, puis lancer la commande qu'il affiche.

En cas d'erreur avant le push : `git tag -d vX.Y.Z && git reset --hard HEAD~1`.

## 2. Push du tag

```sh
git push --follow-tags
```

Le workflow vérifie que le tag correspond à `version` dans `package.json` (échec sinon), lance `pnpm lint`, `pnpm typecheck` et `pnpm test`, puis `pnpm zip:share`, et crée la release avec des notes générées à partir des PR fusionnées. Suivi : onglet Actions du dépôt.

## 3. Récupérer les zips

Sur la page de la release (`gh release download vX.Y.Z` ou l'onglet Releases) :

| Fichier                                | Usage                                          |
| -------------------------------------- | ---------------------------------------------- |
| `blindspot-X.Y.Z-chrome.zip`           | Chrome Web Store                               |
| `blindspot-X.Y.Z-firefox.zip`          | AMO (module)                                   |
| `blindspot-X.Y.Z-sources.zip`          | AMO (sources, le code étant minifié)           |
| `blindspot-X.Y.Z-chrome-nolists.zip`   | Variante sans liste fournie, à partager à part |
| `blindspot-X.Y.Z-firefox-nolists.zip`  | Variante sans liste fournie, à partager à part |

Les trois premiers correspondent à la variante `politiques` de `pnpm zip:share`, celle des stores.

## 4. Envoi aux stores

- **Chrome Web Store** : console développeur, « Paquet » → « Importer un nouveau paquet » avec le zip Chrome, puis « Envoyer pour examen ». Textes de la fiche : notes privÃ©es du mainteneur.
- **Firefox (AMO)** : page du module → « Importer une nouvelle version » avec le zip Firefox, puis le zip de sources et les notes aux relecteurs.


## Option : envoi automatique aux stores (non mis en place)

Le workflow pourrait aussi publier directement : API Chrome Web Store (identifiants OAuth : client ID, client secret, refresh token) et API AMO via `web-ext sign --channel listed` (clé et secret JWT). Les identifiants iraient dans les secrets GitHub du dépôt, jamais dans le code. Écarté pour l'instant : chaque envoi passe par une revue humaine des stores, et un envoi manuel permet de relire la release avant.
