# Liste fournie

Fichier : `src/lists/politiques-droite-ed.json`. Activée à l'installation, désactivable ; l'utilisateur peut en retirer un compte pour lui seul (exclusion locale) ou y ajouter des comptes. Toute autre liste se crée ou s'importe dans l'extension (fichier JSON/CSV ou code de partage).

## Format

```json
{
  "id": "politiques-droite-ed",
  "name": "Politiques de droite / extrême droite",
  "description": "…",
  "version": 1,
  "entries": [{ "platform": "x", "handle": "exemple", "userId": "123", "note": "optionnel" }]
}
```

- `handle` : sans `@`, la casse n'a pas d'importance (il est normalisé au chargement).
- `userId` : recommandé. Il permet de suivre les changements de handle. Sur X, il se lit dans l'attribut `data-testid="<userId>-follow"` du bouton S'abonner sur la page profil.
- Incrémenter `version` à chaque modification du contenu.
- Le build échoue si un fichier est invalide (handle incorrect, champ manquant).

## Critères d'inclusion : `politiques-droite-ed`

La liste ne contient que des comptes politiques publics, qui affichent eux-mêmes leur affiliation.

- **Partis** (France) : Rassemblement National, Reconquête, UDR, Les Républicains, Les Patriotes, Debout la France, Identité-Libertés, et leurs mouvements de jeunesse.
- **Comptes** : comptes officiels des partis et groupes parlementaires, dirigeants et porte-parole, député·es, sénateur·ices et eurodéputé·es en exercice membres de ces partis ou groupes, figures nationales encore actives (anciens candidats à la présidentielle…).
- **Exclus** : particuliers, militants sans mandat ni fonction nationale, comptes parodiques.
- **Sources** : open data de l'Assemblée nationale et du Sénat, Wikidata (P2002 handle, P6552 identifiant numérique), sites officiels des partis.
- **État (version 6)** : 306 comptes. Couverture incomplète : des élu·es sans handle connu dans les sources ne sont pas listés.

## Demande de retrait ou de correction

Une personne listée peut demander une correction ou son retrait : **blindspotx-confidentialite@protonmail.com**. Les demandes sont traitées à la main ; le retrait est publié dans la version suivante de l'extension.
