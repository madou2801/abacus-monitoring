# La Récré — le site

La page d'accueil des jeux. Une seule page, aucune dépendance.

## Ajouter un jeu

Tout part du catalogue, en haut du `<script>` de `index.html` :

```js
{
  cle: 'dames',
  nom: 'Dames',
  accroche: 'Une phrase, pas deux.',
  dossier: 'dames',                     // le dossier à côté de celui-ci
  publie: 'https://claude.ai/...',      // la page publiée, pour les liens partagés
  joueurs: '2 joueurs',
  duree: '10 à 30 min',
  etiquettes: ['duo', 'ligne']          // solo · duo · ligne · court
}
```

Puis une vignette dans `VIGNETTES`, qui dessine l'objet dans sa matière.
Rien d'autre à toucher : la grille, les filtres et le compteur suivent.

Un jeu encore à faire se met dans `AVENIR` et apparaît en case pointillée.

## Deux hébergements, deux comportements

La page demande `/sante` au chargement.

- **Servie par le serveur de jeu** : les cartes pointent vers `/solitaire/`,
  `/puissance4/`, `/morpion/`, et le jeu à distance fonctionne.
- **Ouverte depuis un lien partagé** : les cartes pointent vers les pages
  publiées, et la page explique que le jeu à distance est hors de portée —
  le bac à sable d'une page partagée bloque toute connexion sortante.

Le nom du site tient en un seul endroit : le `<title>` et le `<h1>`.
