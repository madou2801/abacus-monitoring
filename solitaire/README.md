# Solitaire Octogone

Le jeu de solitaire en bois — plateau octogonal, 37 trous, 36 pions — en version web,
jouable au doigt sur téléphone et tablette, à la souris ou au clavier sur ordinateur.

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

## Ce que contient la page

- **Deux plateaux** : octogone à 37 trous (le plateau français classique) et croix
  anglaise à 33 trous.
- **Sauts en diagonale** en option — quatre directions de plus, partie nettement plus facile.
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
