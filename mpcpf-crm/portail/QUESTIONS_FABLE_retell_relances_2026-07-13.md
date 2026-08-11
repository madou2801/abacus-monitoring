# Questions pour Fable — Relances vocales Lucie & contexte Retell (13/07/2026)

> Déposé par la session **Portail (Opus)**. Contexte + questions ouvertes sur lesquelles on a
> besoin de ton arbitrage avant de brancher les **relances sortantes** de Lucie.

## Ce qui a été fait cette session (contexte)

1. **Sync Retell → CRM** (cron VPS `/opt/campaign-tracker/retell_calls_sync.py`, 05h45) :
   remplit `crm.calls` (résumé/sentiment/outcome via `call_analysis.call_summary`) et
   `crm.transcripts` (texte via `get-call` par appel > 8s), **rattachés au bénéficiaire par
   téléphone** (9 derniers chiffres). Le `retell-handler` du CRM existait déjà mais 0 donnée
   (webhooks Retell non branchés). Backfill 365j fait, ~383 appels/318 transcripts.
2. **Inbound FAIT** : `/t/precall-lookup` (campaign-tracker) injecte désormais
   `resume_dernier_appel` + `a_deja_appele` dans les dynamic_variables du bénéficiaire connu →
   **Lucie Suivi** (`agent_a4c7ca25e5e5a07b598bf388c9`) a l'historique quand un bénéficiaire
   **appelle** pour un suivi. Vérifié en réel.
3. Déprécation Retell résolue (`/v2/list-calls`→`/v3/list-calls`) ; edge `wedof-webhook` déployée ;
   n° dossier CPF/EDOF (Wedof `externalId`) capturé + sync quotidien.

## Question 1 — Trigger des relances SORTANTES de Lucie (bloquant)

On veut injecter le même contexte (résumé du dernier appel + statut dossier) quand **Lucie
appelle** un bénéficiaire en **relance**. Mais le seul flux d'appels sortants trouvé,
`triggerAlexandraCall` (campaign-tracker) → `commercial-server /api/commercial/batch-call`,
sert **Alexandra / prospects commerciaux**, PAS les relances bénéficiaires.

Or les résumés montrent que des relances de dossier ont bien lieu
(« reminder about CPF dossier being canceled »).

**→ Où/comment sont déclenchées les relances-appels de Lucie aux bénéficiaires ?**
(quel service PM2 / quel agent — l'agent « Rappel » `agent_55b1205c…` ? cron ? n8n ? manuel ?)

## Question 2 — Approche : brancher l'existant (A) vs relance-caller dédié (B)

- **(A)** Injecter le contexte dans le **trigger existant** (si tu nous pointes le service/agent).
- **(B)** Construire un **relance-caller dédié** : cron qui lit les relances dues du CRM
  (`crm.follow_up_tasks` / logique `process-relances`) et lance l'appel Lucie **avec le résumé +
  le statut dossier** déjà chargés en dynamic_variables.

**→ Tu recommandes A ou B ?** (B est plus autonome mais c'est un nouveau chantier ; il faut
décider qui « possède » l'orchestration des relances — CRM edge vs service VPS.)

## Question 3 — Prompt de l'agent Lucie Suivi

La variable `resume_dernier_appel` est disponible côté webhook, mais le **prompt** de Lucie Suivi
doit la référencer pour l'utiliser (ex. « Si `{{a_deja_appele}}` = oui, tiens compte de
`{{resume_dernier_appel}}` »).

**→ OK pour qu'on modifie le prompt Retell via l'API (ajout ciblé, non destructif) ?**
Un risque à surveiller côté comportement agent ?

## Question 4 — Doublons bénéficiaires (impacte le matching)

Un même email crée **2 lignes** dans `crm.beneficiaries` (`source='sms-inscription'` +
`source='wedof'`). Le sync appels/CPF rattache par téléphone, mais la fiche montre des doublons.

**→ On dédoublonne (fusion par email/téléphone) ? Côté sync `sync_from_public` ou en amont ?**

---
*Réponds ici (ou dans `DECISIONS.md`) — on exécute selon ton arbitrage. — Portail (Opus)*
