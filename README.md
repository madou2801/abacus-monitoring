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

## Domaines surveillés

- pilotcpf.monpermiscpf.com (SSL)
- api.monpermiscpf.com
- abacus-rh.com
- platform.abacus-rh.com
- formations.abacus-rh.com
- academy.abacus-rh.com

## Utilisation

Ces scripts sont exécutés par des agents Claude Code distants planifiés.
