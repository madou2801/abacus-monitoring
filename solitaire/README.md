# Solitaire Octogone

Le jeu de solitaire en bois en version web — cinq plateaux, du triangle à 15 trous pour
débuter jusqu'à l'octogone français à 37 trous. Jouable au doigt sur téléphone et
tablette, à la souris ou au clavier sur ordinateur.

## Lancer le jeu

Tout tient dans `index.html`. Il suffit de l'ouvrir dans un navigateur, sans serveur ni
installation.

Pour la version installable (icône sur l'écran d'accueil, fonctionnement hors ligne),
servir le dossier en HTTPS, par exemple :

```sh
npx http-server solitaire -p 8080
```

Le service worker (`sw.js`) ne s'enregistre qu'en HTTPS ou sur `localhost`.

## Règle

Au départ, tous les trous sont occupés sauf celui du centre. Un pion saute par-dessus un
pion voisin pour atterrir dans le trou vide juste derrière ; le pion enjambé est retiré.
Le but : finir avec un seul pion, au centre si possible.

## Les cinq plateaux

| Plateau | Trous | Minimum réellement atteignable, départ standard |
| --- | --- | --- |
| Octogone français | 37 | **2 pions** — un seul est impossible |
| Croix anglaise | 33 | 1 pion, au centre |
| Triangle | 15 | 1 bille, et elle peut revenir dans le trou du départ |
| Petit octogone | 21 | 4 pions sans les diagonales, 1 avec |
| Découverte (9 pions au centre) | 33 | 2 pions sans les diagonales, 1 avec |

Ces minimums sont calculés, pas supposés : invariant de Reiss sur GF(4) pour établir
les impossibilités, recherche exhaustive ou solution explicite pour l'atteignabilité.
C'est pourquoi l'objectif affiché à côté du titre change avec le plateau et avec
l'option *Diagonales* — annoncer « finir avec un seul pion » sur l'octogone à 37 trous
serait promettre une chose impossible.

Le **triangle à 15 trous** est le meilleur plateau pour débuter : les billes y sautent
dans six directions et la partie se termine sur une bille unique depuis n'importe lequel
des quinze départs.

## Ce que contient la page

- **Sauts en diagonale** en option sur les plateaux carrés — quatre directions de plus,
  partie nettement plus facile. Sans objet sur le triangle, qui a déjà ses six directions.
- **Trois façons de jouer** : appui sur le pion puis sur la case d'arrivée, glisser-déposer,
  ou flèches + Entrée au clavier.
- **Annulation illimitée** (`Ctrl`+`Z`), reprise de la partie en cours après fermeture,
  chronomètre, et record du plus petit nombre de pions atteint par plateau.
- **Indices** : met en évidence les pions qui peuvent encore sauter.
- Détection automatique de la victoire et du blocage.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `index.html` | Le jeu entier : mise en page, plateau SVG, règles et logique |
| `manifest.webmanifest` | Métadonnées d'installation (PWA) |
| `sw.js` | Cache hors ligne |
| `icon.svg` | Icône de l'application |

Aucune dépendance, aucun outil de compilation, aucun appel réseau hormis les polices
Google Fonts (la page reste lisible sans elles).
