#!/bin/bash
# Deploiement des sites moncaces.com et abacus-rh.com sur le VPS ABACUS
# Meme modele que deploy.sh (health-server) : scp + PM2 + Nginx
# Usage : bash sites/deploy-sites.sh   (depuis la racine du repo, machine locale)

set -e

VPS="root@76.13.59.88"
REMOTE_BASE="/home/abacus/sites"
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "=== Deploiement moncaces.com + abacus-rh.com ==="

# 1. Creer les dossiers distants
ssh $VPS "mkdir -p $REMOTE_BASE/moncaces.com $REMOTE_BASE/abacus-rh.com"

# 2. Copier les fichiers des deux sites
scp -r "$HERE/moncaces.com/server.js" "$HERE/moncaces.com/package.json" "$HERE/moncaces.com/public" $VPS:$REMOTE_BASE/moncaces.com/
scp -r "$HERE/abacus-rh.com/server.js" "$HERE/abacus-rh.com/package.json" "$HERE/abacus-rh.com/public" $VPS:$REMOTE_BASE/abacus-rh.com/

# 3. (Re)demarrer avec PM2
ssh $VPS "cd $REMOTE_BASE/moncaces.com && pm2 restart moncaces-site 2>/dev/null || pm2 start server.js --name moncaces-site"
ssh $VPS "cd $REMOTE_BASE/abacus-rh.com && pm2 restart abacus-rh-site 2>/dev/null || pm2 start server.js --name abacus-rh-site"
ssh $VPS "pm2 save"

# 4. Copier les configs Nginx (activation manuelle, voir ci-dessous)
scp "$HERE/nginx/moncaces.com.conf" $VPS:/etc/nginx/sites-available/moncaces.com
scp "$HERE/nginx/abacus-rh.com.conf" $VPS:/etc/nginx/sites-available/abacus-rh.com

echo "
--- ETAPES MANUELLES (une seule fois) ---
1. DNS : faire pointer moncaces.com (A + www) vers 76.13.59.88.
   abacus-rh.com pointe deja vers le VPS : verifier le vhost existant avant
   d'activer le nouveau (fusionner si besoin).

2. Activer les vhosts :
   ssh $VPS
   ln -sf /etc/nginx/sites-available/moncaces.com /etc/nginx/sites-enabled/
   ln -sf /etc/nginx/sites-available/abacus-rh.com /etc/nginx/sites-enabled/
   nginx -t && systemctl reload nginx

3. Certificats SSL :
   certbot --nginx -d moncaces.com -d www.moncaces.com
   certbot --nginx -d abacus-rh.com -d www.abacus-rh.com

4. Verification :
   curl -s http://127.0.0.1:3810/health   # moncaces-site
   curl -s http://127.0.0.1:3820/health   # abacus-rh-site
   curl -sI https://moncaces.com
   curl -sI https://abacus-rh.com
"

echo "=== Deploiement termine ==="
