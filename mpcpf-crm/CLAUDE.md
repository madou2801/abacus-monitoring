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

- `supabase/migrations/0001..0009_*.sql` — schéma, DMAIC, relances, parcours, vues, RLS, buckets, **facturation (0009)**
- `supabase/functions/_shared/` — logique métier **agnostique du runtime** (port `CrmStore` + `fetch`/`Notifier` injectés) ; inclut `billing.ts` (facturation)
- `supabase/functions/{retell-webhook,wedof-webhook,intake-api,process-relances}/` — edge functions (Deno)
- `tests/` — DB réelle via **PGlite**, unitaires, intégration (60 tests)

## Commandes

```bash
cd mpcpf-crm
npm install
npm test          # 60/60 attendus (scripts en --test-concurrency=1 : séquentiel, évite l'OOM V8 sur machine à faible RAM)
npm run typecheck # tsc --noEmit, doit passer
```

## Conventions / décisions prises

- **Dependency injection partout** : les handlers dépendent du port `CrmStore`
  (impl prod `SupabaseCrmStore`, impl test `PgliteCrmStore` qui exécute le VRAI
  SQL des migrations). Ne jamais coupler un handler à Supabase directement.
- **Web Crypto** pour la signature HMAC Retell (marche sous Node + Deno).
- **Notifications** : port `Notifier`. Défaut `QueueNotifier` (trace sans envoi) ;
  en prod `MpcpfNotifier` = **stack réelle** : email via webhook n8n (Gmail OAuth2,
  `N8N_EMAIL_WEBHOOK`) + SMS via ClickSend (`CLICKSEND_USERNAME`/`CLICKSEND_API_KEY`).
  **Pas de Brevo** (décision client 08/07) — swappable en 1 fichier.
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

**Facturation (ajout 27/06, migration 0009 + `billing.ts`)** — « jusqu'à facturation » :
table `crm.invoices` (cycle `a_emettre→emise→transmise→payee→encaissee`/`annulee`,
ref externe Wedof/Chorus/Stripe, échéance), **orthogonale** au pipeline commercial
(0 modif des tables/tests existants). Canal dérivé du financeur
(edof→wedof, kairos→france_travail, opco→opco, entreprise→facture_directe,
autofinancement→stripe). Auto-facture à la **certification Wedof** depuis le devis
accepté (idempotent). Relance `relance_facture_impayee` + `detect_overdue_invoices`
branchée dans `process-relances`. API `intake-api` : actions `create_invoice` /
`set_invoice_status`. Vues `vw_facturation` (retard) + `vw_facturation_funnel`.
Le CRM **pilote/consolide** la facturation tous financeurs ; il ne re-facture pas
le CPF (géré par Wedof) mais en suit le cycle via les refs externes.

**Couche de travail HubSpot (ajout 08/07, migration 0022 + web)** — le CRM
devient éditable : `crm.notes` (notes staff), `crm.tasks` (tâches manuelles,
distinctes des relances auto `follow_up_tasks`), `crm.field_changes`
(historique des propriétés) et `crm.update_beneficiary_fields` (édition
allowlistée + diff + **verrouillage `locked_fields`** : un champ corrigé à la
main n'est plus écrasé par `sync_from_public` — helper `crm.sync_keep`).
Timeline enrichie (note/task/edit). Web : fiche 360° avec **édition inline**
(identité, dossier), **propriétaire assignable** (app_users), notes, tâches
(échéance + retard), **création manuelle** de dossier (`/beneficiaires/nouveau`)
et de **devis** (via `crm.create_quote`) ; liste bénéficiaires avec filtre
propriétaire + **pagination** ; pipeline avec **€ par colonne** ; pages
**Entreprises** et **Facturation** réelles (funnel cliquable + avancement du
cycle via `crm.set_invoice_status`) ; labels FR pour statuts Wedof/devis.

**Dashboard cliquable + devis validables (ajout 08/07 soir)** — chaque donnée
du tableau de bord mène à la liste filtrée correspondante (filtres `canal` et
`jour=demandes|valides` ajoutés à /beneficiaires, minuit Europe/Paris) ;
création manuelle d'**entreprise** (/entreprises) et de **facture**
(/facturation, via `crm.create_invoice`). **Devis validables en un clic**
sur la fiche (✓ Valider / ✗ Refuser sur les devis draft/sent) : même logique
que l'action `decide_quote` de l'intake-api (statut + `advance_journey` →
devis accepté = passage à Inscrit). Rattrapage des devis historiques en
'attente_validation' : `ops/ygphyzky/rattrapage_devis.sql` (idempotent).

**📌 Coordination inter-sessions** : le canal de communication entre sessions
Claude (CRM ↔ portail/Claude Opus) est **`COMMS.md` à la racine du repo, sur
`master`** : lire à chaque reprise de session, répondre en ajoutant une entrée
datée + push sur master (ajout pur). Il contient notamment le contrat
`intake-api` complet (`decide_quote`, `send_quote`, …) pour brancher la page
devis du site au CRM. L'id CRM d'un dossier = l'id de `public.dossiers_bpc`
(miroir 1:1 du sync).

## Décisions / infos EN ATTENTE du client

1. **Nom/URL exact du dépôt du portail auto-école** (à ajouter au périmètre / cloner)
   pour brancher les formulaires sur `intake-api` et préparer la bascule.
2. ~~Fournisseur SMS/email~~ **Tranché (08/07)** : n8n Gmail + ClickSend (pas de Brevo).
3. Accès **Supabase staging** + clés **Retell / Wedof(EDOF) / n8n / ClickSend** + **SSH VPS**
   (`76.13.59.88`, services 3700/3402/...) pour audit et tests réels.

## Prochaines étapes prévues

1. Audit **lecture seule** de l'existant (portail + services VPS) → cartographie.
2. Brancher le portail → `intake-api` (formulaires : intake, France Travail, pièces).
3. Connecter **Wedof/EDOF + n8n Gmail + ClickSend réels**, rejouer les tests contre Supabase staging.
4. Proposer le **plan de bascule** (remplacement de l'existant) — exécuté après GO.

Détails d'install/reprise terminal : voir `GETTING_STARTED_TERMINAL.md`.
