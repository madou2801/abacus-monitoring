# JARVIS — Assistante vocale personnelle de Madou

> Un super-agent personnel, à la voix, qui accompagne Madou au quotidien comme le font
> Claude et Claude Code : il **écoute**, **répond** (voix + écrit), **agit** sur ses outils,
> **se souvient** et **anticipe**. Pensé comme le JARVIS d'Iron Man — pas un bot client de plus.
>
> Décisions initiales (Madou, 30/07/2026) : canal principal = **app mobile** ;
> périmètre V1 = **emails+agenda, infra/VPS, CRM/relances, code** ;
> LLM chinois = **choix Claude → GLM (z.ai) pour le réflexe** ; comportement = **proactif dès le début**.

## 1. Principe directeur — le couplage LLM chinois × Claude

Un **routeur cerveau** choisit le bon modèle par tour, exactement la logique du
`ft/INTENT_ROUTER_DESIGN.md` mais appliquée à Madou lui-même :

- **Réflexe (GLM, z.ai)** — comprend l'intention, tient la conversation FR, répond vite,
  classe, route. ~90 % des tours. Rapide, pas cher, déjà branché dans l'infra.
- **Cerveau profond (Claude Opus 4.8 / Claude Code)** — raisonnement dur, code, orchestration
  multi-outils, jugement, tout ce qui est sensible ou irréversible. Les « mains » qui agissent.

Règle d'escalade : le réflexe **délègue à Claude** dès que la tâche devient complexe, risquée,
ou touche du code / une décision engageante. Le modèle est interchangeable (config), jamais figé.

## 2. Architecture en couches

```
   ┌─────────────────────────────────────────────────────────────┐
   │  MOBILE (V1 canal)  — push-to-talk / wake word "Jarvis"      │
   │  micro → audio ; retour voix (TTS) + transcript écrit + cartes │
   └───────────────┬─────────────────────────────────────────────┘
                   │  audio / texte  (WebSocket)
   ┌───────────────▼─────────────────────────────────────────────┐
   │  VOIX     STT (ASR)  +  TTS  +  barge-in / wake word          │
   │           candidat temps réel : Qwen3-Omni (speech-to-speech) │
   └───────────────┬─────────────────────────────────────────────┘
                   │  texte + intention
   ┌───────────────▼─────────────────────────────────────────────┐
   │  CERVEAU  (jarvis/brain)                                      │
   │   routeur : GLM (réflexe)  ⇄  Claude (profond)                │
   │   mémoire persistante  +  registre d'outils  +  garde-fous    │
   └───────────────┬─────────────────────────────────────────────┘
                   │  appels d'outils (MCP + APIs internes)
   ┌───────────────▼─────────────────────────────────────────────┐
   │  MAINS   Gmail · Agenda · Drive · GitHub · CRM PilotCPF ·     │
   │          VPS/health-server · Claude Code (déploiements)       │
   └─────────────────────────────────────────────────────────────┘
```

| Couche | Rôle | Techno / état |
|---|---|---|
| **Mobile** | I/O quotidien de Madou | à construire (V1 : PWA/React Native, push-to-talk) |
| **Voix** | STT + TTS + wake word + barge-in | à câbler ; GLM-4-Voice ou Qwen3-Omni candidats |
| **Cerveau** | routeur GLM↔Claude, mémoire, outils, garde-fous | **`jarvis/brain` — démarré ici** |
| **Mémoire** | qui est Madou, projets, décisions, préférences | store JSON versionné → SQLite plus tard |
| **Mains** | agir sur les outils | MCP déjà dispo (Gmail/Calendar/Drive/GitHub) + APIs VPS |

## 3. Couche proactive (dès le V1)

L'agent ne fait pas qu'attendre. Un **superviseur** tourne en tâche de fond et pousse des
alertes vers le mobile (notification + résumé vocal si Madou est en session) :

- **Infra** : un service critique tombe (`health-server` /health-report) → alerte immédiate.
- **Email** : mail important/urgent détecté (classif GLM) → « tu as un mail de X à voir ».
- **CRM** : relance EDOF prête à valider, dossier bloqué → « 3 relances t'attendent ».
- **Agenda** : prochain créneau, conflit, préparation de RDV.

Garde-fous proactifs (repris du cadre COMMS existant) : **digest** si volume élevé (pas de
spam de notifs), fenêtre horaire respectée, chaque alerte est **réversible** (`on/off` par canal),
et **jamais d'action engageante sans confirmation vocale** de Madou.

## 4. Garde-fous transverses (hérités de la culture COMMS/Lucie)

1. **Confirmation avant l'irréversible** — envoyer un mail, lancer une relance, déployer,
   supprimer : l'agent **annonce et attend le « go » vocal**. Jamais de succès annoncé sur un
   échec backend (bug Lucie #2 — un outil qui échoue n'est jamais présenté comme réussi).
2. **Contenu réglementaire = template validé** — sur CPF/AIF/montants, l'agent ne génère jamais
   de texte libre (règle du routeur d'intention).
3. **Secrets** — clés en variables d'environnement uniquement, jamais dans le repo, jamais lues
   à voix haute, jamais loggées.
4. **Traçabilité** — chaque tour et chaque action outil sont journalisés (transcript + audit).
5. **RGPD** — cadre DPA existant inchangé ; aucun nouveau transfert de données non prévu.

## 5. Feuille de route

**Phase 0 — Fondation (en cours)**
- [x] Architecture verrouillée (ce document)
- [x] Cerveau orchestrateur : routeur GLM↔Claude, registre d'outils, mémoire, garde-fous, serveur HTTP
- [ ] Brancher les vraies clés (GLM z.ai déjà en infra ; Claude) et test bout-en-bout texte

**Phase 1 — Voix**
- [ ] STT + TTS temps réel (évaluer Qwen3-Omni vs GLM-4-Voice vs pipeline Whisper/ElevenLabs)
- [ ] Wake word « Jarvis » + barge-in + WebSocket audio

**Phase 2 — Mobile**
- [ ] App mobile (push-to-talk d'abord, wake word ensuite), transcript + cartes d'action

**Phase 3 — Les 4 domaines** (branchés un par un sur le registre d'outils)
- [ ] Emails + Agenda (MCP Gmail/Calendar)
- [ ] Infra/VPS (health-server, restart service, logs)
- [ ] CRM / relances (piloter à la voix ce que Lucie/Fable font en écrit)
- [ ] Assistant de code (piloter Claude Code : script, déploiement, PR)
- [ ] _(5e domaine « Autre » de Madou — à préciser)_

**Phase 4 — Proactif complet**
- [ ] Superviseur infra/email/CRM/agenda + digest + notifications push

## 6. Arborescence

```
jarvis/
  ARCHITECTURE.md        ← ce document
  brain/
    package.json
    config.json          ← routing des modèles + seuils d'escalade
    router.js            ← le couplage GLM (réflexe) ↔ Claude (profond)
    providers.js         ← clients GLM (z.ai) et Claude, interchangeables
    memory.js            ← mémoire persistante de Madou
    tools.js             ← registre d'outils (Gmail/Agenda/infra/CRM/code)
    server.js            ← service HTTP/WebSocket exposant le cerveau (+ /health)
```
