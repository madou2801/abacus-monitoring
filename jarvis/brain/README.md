# JARVIS — brain (cerveau orchestrateur)

Le cœur du super-agent : un routeur qui couple **GLM (z.ai)** en couche réflexe et
**Claude** en couche profonde. Voir `../ARCHITECTURE.md` pour la vision d'ensemble.

## Lancer un dialogue texte (test bout-en-bout)

Node ≥ 18 requis. Aucune dépendance npm à installer (stdlib seulement).

```bash
cd jarvis/brain
cp .env.example .env            # puis renseigne GLM_API_KEY et ANTHROPIC_API_KEY
export $(grep -v '^#' .env | xargs)

npm run cli                     # REPL texte : tu parles, JARVIS répond
# ou le service HTTP :
npm start                       # GET /health · POST /turn · POST /confirm  (port 3860)
```

Exemple via le service HTTP :

```bash
curl -s localhost:3860/turn -H 'content-type: application/json' \
  -d '{"text":"tout tourne côté infra ?"}' | jq
```

## Tests (offline, sans clé ni réseau)

```bash
npm test        # prouve le couplage : réflexe→direct, escalade Claude, garde-fou confirmation
```

## Câblage des clés

| Couche | Variable | Où |
|---|---|---|
| Réflexe (GLM) | `GLM_API_KEY` | https://z.ai |
| Profond (Claude) | `ANTHROPIC_API_KEY` | https://console.anthropic.com |

**Option zéro-nouveau-secret** : router le réflexe par ton **LLM Router interne** (VPS:3800,
compatible OpenAI) au lieu de z.ai direct — pointe `reflex.baseUrl` de `config.json` vers le
router. La clé et l'URL restent en variables d'environnement, jamais dans le repo.

## Structure

- `router.js` — le couplage (réflexe → escalade), garde-fou confirmation. `handleTurn(cfg, text, now, {call})`.
- `providers.js` — clients GLM / Claude interchangeables.
- `memory.js` — mémoire persistante de Madou.
- `tools.js` — registre d'outils (infra branché ; email/agenda/CRM/code en squelette).
- `server.js` — service HTTP. `cli.js` — REPL texte.
