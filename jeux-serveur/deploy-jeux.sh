#!/bin/bash
# Déploie le site de jeux et son serveur sur le VPS.
# À lancer depuis le dépôt : bash jeux-serveur/deploy-jeux.sh
#
# Aucune clé, aucun secret : le serveur de jeu n'en a pas besoin.

set -e

VPS="${JEUX_VPS:-root@76.13.59.88}"
DISTANT="${JEUX_DISTANT:-/home/abacus/jeux}"
PORT="${JEUX_PORT:-3860}"

echo "=== Déploiement du site de jeux sur $VPS ==="

# 1. Dossier distant
ssh "$VPS" "mkdir -p $DISTANT"

# 2. Copie du serveur et des quatre dossiers servis
scp jeux-serveur/serveur.js "$VPS:$DISTANT/"
for dossier in site solitaire puissance4 morpion; do
  ssh "$VPS" "mkdir -p $DISTANT/$dossier"
  scp "$dossier"/* "$VPS:$DISTANT/$dossier/"
done

# 3. Démarrage sous PM2, comme les autres services
ssh "$VPS" "cd $DISTANT && JEUX_PORT=$PORT JEUX_RACINE=$DISTANT \
  pm2 start serveur.js --name jeux --update-env && pm2 save"

# 4. Vérification
echo ""
echo "--- /sante ---"
ssh "$VPS" "curl -s http://127.0.0.1:$PORT/sante" || true
echo ""

cat <<MANUEL

--- ÉTAPE MANUELLE ---
Ajouter le bloc de jeux-serveur/nginx-jeux.conf au vhost choisi, puis :

    nginx -t && systemctl reload nginx

Le serveur doit être joignable en HTTPS : le jeu à distance utilise une
WebSocket, et un navigateur refuse une WebSocket en clair depuis une page
servie en HTTPS.
MANUEL
