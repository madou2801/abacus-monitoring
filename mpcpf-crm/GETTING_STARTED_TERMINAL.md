# Reprendre le travail dans le Terminal (Claude Code CLI)

Ce guide sert à passer de l'environnement web (verrouillé sur un seul dépôt)
au **Terminal en local**, où Claude Code voit **tous tes dépôts** et peut
utiliser tes **vrais identifiants** (Supabase, Retell, Wedof, n8n, ClickSend, SSH VPS)
pour auditer l'existant et tester les flux de bout en bout.

> Règle qui ne change pas : **on ne remplace rien de l'existant avant ton GO**.
> Tout se fait sur une branche dédiée, on teste d'abord.

---

## 1. Installer Claude Code

**macOS / Linux / WSL :**
```bash
curl -fsSL https://claude.ai/install.sh | bash
```

**Windows :** via WSL (recommandé, même commande) — ou PowerShell :
```powershell
irm https://claude.ai/install.ps1 | iex
```

Puis lancer une fois pour s'authentifier (navigateur) :
```bash
claude
```

---

## 2. Organiser les dépôts

Regroupe tous les projets dans un dossier parent commun, par ex. `~/abacus/` :

```
~/abacus/
├── abacus-platform/
├── portail-auto-ecole/        # <-- le portail à brancher (nom/URL à confirmer)
├── abacus-monitoring/         # <-- contient mpcpf-crm (le CRM)
└── ...
```

Lancer Claude en voyant plusieurs repos à la fois :
```bash
cd ~/abacus
claude --add-dir ./abacus-platform ./portail-auto-ecole ./abacus-monitoring
```
(ou `/add-dir <chemin>` en cours de session.)

---

## 3. Reprendre CE travail (CRM mpcpf-crm)

**Option A — la plus fluide : rapatrier cette session web**
```bash
claude --teleport
```
On reprend exactement là où on en est, avec tout le contexte.

**Option B — repartir du code (branche de la PR #3)**
```bash
git clone <url>/madou2801/abacus-monitoring.git
cd abacus-monitoring
git checkout claude/mpcpf-crm-audit-integration-hxl53q
cd mpcpf-crm
npm install
npm test        # doit afficher 49/49 verts
```

---

## 4. Sécurité des permissions (en local)

En local, Claude a accès au vrai système de fichiers et aux identifiants.

- Démarre en mode **`default`** : validation demandée avant chaque commande/édition.
- `Shift+Tab` pour changer de mode pendant la session.
- N'utilise `bypassPermissions` que dans un environnement isolé.

Pré-autoriser les commandes sûres sans être interrompu (optionnel),
`mpcpf-crm/.claude/settings.json` :
```json
{
  "permissions": {
    "defaultMode": "default",
    "allow": ["Bash(npm run *)", "Bash(npm test *)", "Bash(git status)", "Bash(git diff *)"]
  }
}
```

---

## 5. Checklist des identifiants à réunir

À placer dans `mpcpf-crm/.env` (voir `.env.example`) **et** côté Supabase
(`supabase secrets set --env-file .env`) :

- [ ] `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (projet de **staging** de préférence)
- [ ] `RETELL_API_KEY` (signature des webhooks de l'agent Lucie)
- [ ] `WEDOF_WEBHOOK_SECRET` + clé API Wedof/EDOF (création de dossiers, devis)
- [ ] `N8N_EMAIL_WEBHOOK` (webhook n8n → Gmail OAuth2) + `CLICKSEND_USERNAME`/`CLICKSEND_API_KEY` (SMS)
- [ ] `INTAKE_API_SECRET` (auth de l'API parcours appelée par le portail)
- [ ] Accès **SSH VPS** `76.13.59.88` si on doit inspecter les services existants (3700, 3402, …)

À me communiquer aussi :
- [ ] Le **nom/URL exact du dépôt du portail auto-école**.
- [x] Fournisseur **SMS/email** : n8n Gmail + ClickSend (adaptateur `MpcpfNotifier` aligné).

---

## 6. Ce qu'on fera une fois dans le terminal

1. **Audit en lecture seule** de l'existant (portail + services VPS) → cartographie.
2. **Brancher le portail** sur l'API `intake-api` du CRM (formulaires → parcours).
3. **Connecter Wedof/EDOF + n8n Gmail + ClickSend réels**, rejouer les tests contre un Supabase de staging.
4. Te proposer le **plan de bascule** — exécuté uniquement après ton GO.
