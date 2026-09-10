# Puissance 4

Le Puissance 4 classique en version web : à deux sur le même appareil, ou contre la
machine. Une seule page, aucune dépendance — `index.html` s'ouvre directement dans un
navigateur.

## Ce que contient la page

- **Trois grilles** : 7 × 6 classique, 6 × 5 pour une partie courte, 8 × 7 pour une partie longue.
- **Contre la machine, quatre niveaux.** L'adversaire est un négamax avec élagage alpha-bêta,
  coups ordonnés depuis le centre, et détection systématique des victoires et parades
  immédiates. *Facile* joue au hasard mais saisit une victoire à sa portée ; *Moyen* regarde
  quatre coups devant ; *Difficile* six ; *Expert* approfondit tant qu'il lui reste du temps
  dans une enveloppe de 900 ms.
- **Chrono par coup** en option (12, 8, 5 ou 3 secondes) : laisser filer le temps fait perdre
  la manche. Le compte à rebours se met en pause quand l'onglet passe en arrière-plan.
- **Score de la série**, annulation, et reprise des réglages d'une session à l'autre.
- Jouable au doigt, à la souris (avec jeton fantôme au survol) et au clavier
  (`←` `→` puis `Entrée`, `Ctrl`+`Z` pour annuler).
- Thèmes clair et sombre, libellés d'accessibilité sur chaque colonne, annonces `aria-live`.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `index.html` | Le jeu entier : mise en page, grille, moteur de recherche, règles |
| `manifest.webmanifest` | Métadonnées d'installation |
| `sw.js` | Cache hors ligne |
| `icon.svg` | Icône de l'application |
