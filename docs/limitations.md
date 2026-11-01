# Limites connues

## Accessibilité

L'approche « zéro empreinte DOM » interdit de poser `aria-hidden` ou `inert` sur le contenu masqué.

- Le texte de l'encart (`::after { content: … }`) est exposé aux lecteurs d'écran par Chrome et Firefox.
- **Le contenu du post masqué reste dans l'arbre d'accessibilité** : un lecteur d'écran le lit toujours.
- La navigation au clavier reste possible jusqu'au post (`j`/`k`, Tab), mais les raccourcis d'engagement sont neutralisés (`guards.ts`).

Piste si besoin : une option « mode lecteur d'écran » qui pose `aria-hidden` sur les posts masqués depuis le content script. Elle laisse une empreinte DOM et doit donc rester désactivée par défaut.

## Détectabilité

**Boutons dans la page (par défaut, #72)** : un élément est ajouté sous `<html>`, avec un shadow DOM fermé. La page peut donc détecter la présence de l'extension ; le contenu du shadow DOM lui reste fermé. Le **mode discret** retire cet élément.

**Aucun marqueur passif** : le CSS de masquage ne pose aucune propriété personnalisée (`--…`), ni sur `:root` ni sur les posts masqués. Les couleurs du thème sont écrites dans les règles de l'encart, et les gardes du content script retrouvent les posts masqués elles-mêmes, à partir du stockage de l'extension (`src/core/hidden.ts`, `matcher.ts`). Une page qui ne fait que lire `getComputedStyle(document.documentElement)` ne voit rien. L'e2e le vérifie.

**Risque résiduel : sondage actif.** En mode discret, rien n'est ajouté au DOM ni au CSSOM (`document.styleSheets`), mais tout masquage par CSS reste observable sur les éléments qu'il touche. Un script exécuté dans x.com (X lui-même, un script tiers, une XSS) peut :

- lire `getComputedStyle(el, '::after')` (contenu, fond) ou `document.elementFromPoint` sur un post masqué, ce qui révèle la présence de l'extension dès qu'un post visible est masqué ;
- **insérer des posts de test** (`[data-testid="cellInnerDiv"]` avec un lien `/<handle>`) pour des milliers de handles et regarder lesquels reçoivent l'encart : il reconstitue ainsi les comptes masqués (listes fournies, ajouts, exclusions, listes perso) ;
- remarquer les vidéos mises en pause et coupées par la garde médias.

Ce sondage demande un code écrit exprès pour Blindspot, et l'extension n'émet aucune requête : rien ne sort sans que X ou le script le transmette lui-même. Seul un masquage sans CSS visible par la page (retrait de nœuds, ce qui laisse une empreinte DOM) le supprimerait. La liste « Politiques de droite / ED » étant activée par défaut, le simple constat qu'elle masque un compte peut laisser inférer une opinion politique : à garder en tête avant de présenter le mode discret comme indétectable.

## Sélecteurs X

Les sélecteurs de `src/platforms/x/selectors.ts` reposent sur la structure connue de x.com et ne sont pas encore validés sur le vrai site. Les tests navigateur utilisent un DOM synthétique.

## Firefox

- Version minimale : 140 (requise par `data_collection_permissions`).
- `web-ext lint` signale un `innerHTML` (`UNSAFE_VAR_ASSIGNMENT`) dans le runtime Svelte : il clone les gabarits statiques générés à la compilation, via une politique Trusted Types. Aucune donnée utilisateur n'y passe. À mentionner dans les notes de soumission AMO.
