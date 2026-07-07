# ABACUS Monitoring

Scripts de monitoring et health check pour l'infrastructure VPS ABACUS (76.13.59.88).

## Services surveillés

| Service | Port | Endpoint |
|---------|------|----------|
| COMEX Dashboard API | 3751 | /api/overview |
| LLM Router | 3800 | /health |
| Commercial Server | 3760 | /health |
| Campaign Tracker | 3770 | /health |
| Stripe Webhook | 3780 | /health |
| PilotCPF Site | 3790 | / |
| BDR Alexandra | 3402 | /health |
| PilotCPF CRM | 3700 | /health |
| MonCACESCPF Site | 3810 | /health |
| ABACUS RH Site | 3820 | /health |

## Domaines surveillés

- pilotcpf.monpermiscpf.com (SSL)
- api.monpermiscpf.com
- abacus-rh.com
- platform.abacus-rh.com
- formations.abacus-rh.com
- academy.abacus-rh.com
- moncacescpf.com

## Sites web (`sites/`)

Le dossier `sites/` contient les deux sites vitrines servis sur le VPS,
construits sur la même architecture que les autres services (Node.js natif
sans dépendance, écoute sur 127.0.0.1, PM2, reverse proxy Nginx, endpoint
`/health` monitored) :

| Site | Port | Contenu |
|------|------|---------|
| `sites/moncacescpf.com` | 3810 | Formations CACES®, sécurité & prévention — présentiel + e-learning (catalogue E Forma Pro), financement CPF/OPCO |
| `sites/abacus-rh.com` | 3820 | E-learning (catalogue SCORM), bilan de compétences en ligne (BOVC), VAE en ligne, outplacement — financements OPCO, AIF, personnel, entreprises |

Chaque site expose `POST /api/lead` (formulaire de contact → `leads.jsonl`).
Déploiement : `bash sites/deploy-sites.sh` (voir les étapes manuelles DNS/SSL
affichées en fin de script). Configs Nginx : `sites/nginx/`.

Test local : `node sites/moncacescpf.com/server.js` puis
`curl http://127.0.0.1:3810/health` (idem port 3820 pour abacus-rh).

## Utilisation

Ces scripts sont exécutés par des agents Claude Code distants planifiés.
