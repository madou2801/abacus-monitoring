# CLAUDE.md — MPCPF CRM

Contexte projet lu automatiquement par Claude Code. Si tu reprends ce travail
dans une nouvelle session (terminal), **lis ce fichier + la PR #3** et tu as
tout l'état. (Avec `claude --teleport`, le contexte de la session web descend
directement et ce fichier n'est qu'un complément.)

## Objectif

CRM opérationnel MonPermisCPF : chaque **dossier bénéficiaire** a une vue
unifiée (appels Retell de l'agent **Lucie** + enregistrements dans Supabase
Storage, transcripts, emails/SMS, statuts Wedof), un **parcours simple** avec
formulaires, des **relances automatisées**, un **pipeline DMAIC** mesurable, et
des **devis multi-financeurs** (EDOF / Kairos France Travail / OPCO / entreprise).

## Règle d'or (méthode validée avec le client)

**Ne jamais remplacer / modifier l'existant en production avant un GO explicite.**
Tout est **additif**, sur la branche `claude/mpcpf-crm-audit-integration-hxl53q`
(PR #3). On teste d'abord, on bascule après accord.

## Où vit le code

Tout est sous `mpcpf-crm/` (brique Supabase autonome, schéma `crm`) :

- `supabase/migrations/0001..0008_*.sql` — schéma, DMAIC, relances, parcours, vues, RLS, buckets
- `supabase/functions/_shared/` — logique métier **agnostique du runtime** (port `CrmStore` + `fetch`/`Notifier` injectés)
- `supabase/functions/{retell-webhook,wedof-webhook,intake-api,process-relances}/` — edge functions (Deno)
- `tests/` — DB réelle via **PGlite**, unitaires, intégration (49 tests)

## Commandes

```bash
cd mpcpf-crm
npm install
npm test          # 49/49 attendus
npm run typecheck # tsc --noEmit, doit passer
```

## Conventions / décisions prises

- **Dependency injection partout** : les handlers dépendent du port `CrmStore`
  (impl prod `SupabaseCrmStore`, impl test `PgliteCrmStore` qui exécute le VRAI
  SQL des migrations). Ne jamais coupler un handler à Supabase directement.
- **Web Crypto** pour la signature HMAC Retell (marche sous Node + Deno).
- **Notifications** : port `Notifier`. Défaut `QueueNotifier` (trace sans envoi) ;
  adaptateur `BrevoNotifier` (SMS+email) si `BREVO_API_KEY`. Provider à confirmer
  (cf. décisions en attente) — swappable en 1 fichier.
- **Parcours séquentiel** (`crm.journey_steps`) : intake → eligibilite (`qualifie`)
  → pieces → devis accepté (`inscrit`). `crm.advance_journey` n'avance que sur le
  plus long préfixe d'étapes satisfaites.
- **Idempotence** webhooks via `crm.webhook_events (provider,event_type,external_id)`.
- **RLS** : schéma `crm` réservé au `service_role` ; référentiels/vues lisibles par `authenticated`.
- Tests Postgres : le harness (`tests/helpers/migrate.ts`) crée les rôles
  `anon/authenticated/service_role` + stubs `storage`/`auth` avant d'appliquer les migrations.

## État actuel (PR #3)

Fait & testé : dossier unifié, webhook Retell (signature, enregistrement→Storage,
capture Lucie, automatisations), webhook Wedof, API parcours `intake-api`,
devis multi-financeurs, relances, pipeline DMAIC, vues unifiées.

## Décisions / infos EN ATTENTE du client

1. **Nom/URL exact du dépôt du portail auto-école** (à ajouter au périmètre / cloner)
   pour brancher les formulaires sur `intake-api` et préparer la bascule.
2. **Fournisseur SMS/email réellement en prod** (défaut posé : Brevo).
3. Accès **Supabase staging** + clés **Retell / Wedof(EDOF) / Brevo** + **SSH VPS**
   (`76.13.59.88`, services 3700/3402/...) pour audit et tests réels.

## Prochaines étapes prévues

1. Audit **lecture seule** de l'existant (portail + services VPS) → cartographie.
2. Brancher le portail → `intake-api` (formulaires : intake, France Travail, pièces).
3. Connecter **Wedof/EDOF + Brevo réels**, rejouer les tests contre Supabase staging.
4. Proposer le **plan de bascule** (remplacement de l'existant) — exécuté après GO.

Détails d'install/reprise terminal : voir `GETTING_STARTED_TERMINAL.md`.
