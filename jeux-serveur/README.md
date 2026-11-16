# Serveur de jeu

Sert le site et les jeux, et tient les parties à distance.

Aucune dépendance : le protocole WebSocket est implémenté dans `serveur.js`,
pour que le déploiement reste un `scp` et un PM2 comme `health-server.js`,
sans `npm install` sur le VPS.

## Lancer en local

```sh
node jeux-serveur/serveur.js
# puis http://localhost:3860
```

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `JEUX_PORT` | `3860` | Port d'écoute |
| `JEUX_RACINE` | le dépôt | Dossier servi en statique |

Seuls `site/`, `solitaire/`, `puissance4/` et `morpion/` sont servis ; le
reste du dépôt reste invisible, et une barrière empêche de remonter
au-dessus de la racine.

## Déployer

```sh
bash jeux-serveur/deploy-jeux.sh
```

Puis insérer `nginx-jeux.conf` dans le vhost et recharger nginx. **Le site
doit être servi en HTTPS** : un navigateur refuse une WebSocket en clair
depuis une page chargée en HTTPS.

## Les parties à distance

Un salon porte un code de quatre lettres, tiré d'un alphabet sans
caractères qu'on confond à l'oral — ni I, ni O, ni 0, ni 1.

Le serveur arbitre : il tient la grille, le tour et le score, et refuse un
coup hors tour ou sur une case prise. Le client n'est jamais cru.

Chaque joueur reçoit un jeton. En cas de coupure, la page le renvoie et
retrouve sa place et la partie en cours. Un salon sans personne depuis deux
heures est effacé.

### Messages

Du client vers le serveur : `creer`, `rejoindre`, `reprendre`, `coup`,
`nouvelle`, `quitter`, `ping`.

Du serveur vers le client : `salon` (code, place, jeton), `etat` (la partie
entière après chaque changement), `erreur`, `parti`, `pong`.

### Ajouter un jeu

Dans `serveur.js`, ajouter une entrée à `JEUX` avec `normaliser`, `creer` et
`jouer`. `jouer` renvoie `null` si le coup est accepté, sinon le message
d'erreur à montrer au joueur. Le reste — salons, reprise, score, diffusion —
est commun.

## Points de vigilance

- `/sante` renvoie l'état au format du reste du dépôt : la page d'accueil
  s'en sert pour savoir si elle est servie par le serveur de jeu ou ouverte
  depuis un lien partagé.
- La constante `GUID` de la poignée de main WebSocket est celle de la
  RFC 6455. Elle est vérifiable avec le vecteur de test de la RFC : la clé
  `dGhlIHNhbXBsZSBub25jZQ==` doit donner `s3pPLMBiTxaQ9kYGzzhZRbK+xOo=`.
  Un seul caractère de travers et tous les navigateurs refusent la connexion,
  sans qu'un client écrit avec la même constante s'en aperçoive.
