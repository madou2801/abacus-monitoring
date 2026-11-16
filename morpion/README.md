# Morpion

Le morpion, à la craie sur ardoise. À deux sur le même appareil ou contre la machine.
Une seule page, aucune dépendance.

## Ce que contient la page

- **Deux grilles** : le 3 × 3 classique (trois signes alignés) et le 11 × 11 du papier
  quadrillé (cinq signes alignés), nettement plus ouvert.
- **Contre la machine, trois niveaux.** En 3 × 3, le niveau *Fort* explore la partie entière
  et ne peut pas perdre — au mieux vous obtenez la nulle. En 11 × 11 il combine une
  évaluation par fenêtres de cinq cases et une recherche alpha-bêta limitée au voisinage
  des signes déjà posés.
- **Chrono par coup** en option (12, 8, 5 ou 3 secondes) : le temps écoulé fait perdre la manche.
- **Score de la série**, annulation, reprise des réglages.
- Jouable au doigt, à la souris (aperçu du signe au survol) et au clavier
  (`flèches` puis `Entrée`, `Ctrl`+`Z` pour annuler).
- Traits et signes dessinés à la craie : les tracés SVG passent par un filtre de
  déplacement qui leur donne le grain du bâton sur l'ardoise.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `index.html` | Le jeu entier : mise en page, ardoise, moteur, règles |
| `manifest.webmanifest` | Métadonnées d'installation |
| `sw.js` | Cache hors ligne |
| `icon.svg` | Icône de l'application |
