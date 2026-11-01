# Blindspot

Extension Chrome et Firefox qui masque sur X les posts des comptes de vos listes, sans les bloquer, les mettre en sourdine ni les signaler. Le post reste chargé par X ; vous ne voyez qu'un encart neutre.

- Une liste est fournie et activée à l'installation : « Politiques de droite / extrême droite » (comptes officiels de partis, dirigeants et élus, surtout français). Critères : [`docs/lists.md`](docs/lists.md). Vous pouvez la désactiver, en retirer des comptes pour vous seul, créer vos propres listes, les importer, les exporter ou les partager par un code à copier-coller.
- Boutons « Masquer » dans la page (à côté de l'heure d'un post, menu « … », en-tête de profil). Le **mode discret** les retire.
- Reposts, citations et réponses des comptes listés masqués (réglable). Raccourcis d'engagement neutralisés et vidéos en pause sur les posts masqués.

## Confidentialité

L'extension n'émet **aucune requête réseau** et ne collecte aucune donnée : vos listes et réglages restent dans le stockage de votre navigateur. Elle n'agit jamais sur votre compte X. Limites connues (ce qu'une page peut observer) : [`docs/limitations.md`](docs/limitations.md).

Contact, demandes de retrait d'un compte de la liste fournie : **blindspotx-confidentialite@protonmail.com**.

## Développement

Prérequis : Node.js 22, pnpm 10 (`corepack enable`).

```sh
pnpm install
pnpm dev            # Chrome, avec rechargement
pnpm dev:firefox    # Firefox
pnpm build          # builds Chrome et Firefox (MV3) dans .output/
pnpm lint && pnpm typecheck && pnpm test
pnpm test:browser   # tests dans Chromium et Firefox (Playwright)
pnpm test:e2e       # extension chargée sur une page X synthétique, audit d'accessibilité
```

Stack : [WXT](https://wxt.dev), TypeScript, Svelte 5, Vitest, Playwright.

- Masquage par CSS injecté depuis le background (`scripting.insertCSS`), sans toucher à l'arbre DOM de X. Les sélecteurs X sont centralisés dans `src/platforms/x/selectors.ts`.
- X change souvent son DOM : procédure de correctif dans [`docs/maintenance-x.md`](docs/maintenance-x.md), smoke test `pnpm smoke:x` sur un vrai navigateur connecté.
- Publication : [`docs/release.md`](docs/release.md) (`pnpm release patch`, push du tag, release GitHub avec les zips).

## Build reproductible (relecteurs Mozilla)

Le code publié est minifié par Vite. Pour reproduire le paquet Firefox : Node.js 22, pnpm 10.27.0, puis `pnpm install --frozen-lockfile` et `pnpm build:firefox`. Résultat dans `.output/firefox-mv3/`.

Code is minified by Vite. To reproduce the Firefox package: Node.js 22, pnpm 10.27.0 (`corepack enable`), then `pnpm install --frozen-lockfile` and `pnpm build:firefox`; output in `.output/firefox-mv3/`.

## Licence

MIT, voir [`LICENSE`](LICENSE).
