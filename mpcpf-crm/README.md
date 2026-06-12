# MPCPF CRM

CRM opérationnel MonPermisCPF : chaque **dossier bénéficiaire** dispose d'une
**vue unifiée** (appels Retell + enregistrements audio dans Supabase Storage,
transcripts, emails, statuts Wedof), d'**automatisations de relance**, et d'un
**pipeline cadré par la méthode Harvey / DMAIC** avec des points de contrôle
mesurables.

Construit nativement sur **Supabase** (Postgres + Edge Functions + Storage).

---

## Architecture

| Couche | Emplacement | Rôle |
|--------|-------------|------|
| Schéma | `supabase/migrations/0001..0006_*.sql` | Tables, fonctions DMAIC, relances, vues unifiées, RLS, bucket Storage |
| Webhook Retell | `supabase/functions/retell-webhook/` | Reçoit les évènements d'appel, vérifie la signature HMAC |
| Webhook Wedof | `supabase/functions/wedof-webhook/` | Reçoit les changements de statut CPF |
| Moteur de relances | `supabase/functions/process-relances/` | Traite les relances échues (cron) |
| Logique partagée | `supabase/functions/_shared/` | Handlers, automatisations, ports d'accès aux données (testables) |
| Tests | `tests/` | DB réelle (PGlite), unitaires, intégration de bout en bout |

La logique métier (`_shared/`) est **agnostique du runtime** : elle dépend du
port `CrmStore` et de `fetch` injectés. En production c'est `SupabaseCrmStore`
qui est branché ; en test c'est `PgliteCrmStore`, qui exécute **le vrai SQL des
migrations** dans un Postgres en mémoire. Les flux sont donc validés de bout en
bout sans dépendance réseau.

## Modèle de données (schéma `crm`)

- `beneficiaries` — dossier pivot (téléphone normalisé E.164, étape pipeline, état Wedof)
- `calls` — appels Retell + référence de l'enregistrement dans Storage
- `transcripts` — transcription intégrale d'un appel
- `emails` — emails entrants/sortants
- `wedof_events` — historique des statuts CPF
- `webhook_events` — journal brut (idempotence + audit)
- `pipeline_stages`, `control_points`, `pipeline_transitions` — pipeline DMAIC
- `follow_up_rules`, `follow_up_tasks` — relances

### Vues unifiées

- `vw_beneficiary_overview` — vue 360° synthétique (1 ligne / dossier)
- `vw_beneficiary_timeline` — fil chronologique (appels + emails + Wedof + transitions)
- `vw_pipeline_metrics` — mesure DMAIC par point de contrôle
- `vw_funnel` — répartition des dossiers dans l'entonnoir

## Pipeline Harvey / DMAIC

Chaque transition d'étape franchit un **point de contrôle mesurable** (objectif
de conversion + délai cible), journalisé dans `pipeline_transitions`.

| Étape | Phase DMAIC | Point de contrôle (gate) | Obj. conversion | Délai cible |
|-------|-------------|--------------------------|-----------------|-------------|
| Lead entrant | Define | dossier créé | — | — |
| Contact établi | Measure | 1er appel décroché | 60 % | 48 h |
| Qualifié / éligible | Analyze | éligibilité CPF + besoin | 55 % | 72 h |
| Inscrit (Wedof) | Improve | dossier Wedof validé | 50 % | 120 h |
| En formation | Improve | entrée en formation | 85 % | 14 j |
| Certifié / clôturé | Control | certification obtenue | 80 % | 90 j |
| Perdu / abandon | Control | (terminal) | — | — |

`crm.set_stage()` interdit les régressions (sauf `perdu`), rattache le point de
contrôle et mesure le temps passé dans l'étape précédente — la matière première
du pilotage DMAIC, exposée par `vw_pipeline_metrics`.

## Flux de bout en bout

**Appel Retell** → `retell-webhook` :
signature HMAC → idempotence → rapprochement par téléphone (E.164) → upsert appel
→ transcript → **téléchargement de l'enregistrement vers Storage** (`call-recordings`)
→ automatisations : décroché → `contact_etabli`, non-réponse → relance J+1,
messagerie → email, non intéressé → `perdu`.

**Statut Wedof** → `wedof-webhook` :
secret partagé → idempotence → rapprochement (folder id puis email) → mise à jour
du dossier + historisation → automatisations : `inTraining` → `en_formation`,
`terminated` → `certifie`, `toComplete` → relance pièces.

**Relances** → `process-relances` (cron) :
détection des dossiers dormants (dépassement du délai cible du point de contrôle)
→ planification → dispatch par canal (email / appel) → marquage `done`/`failed`.

## Tests

```bash
npm install
npm test            # 36 tests : DB réelle (PGlite) + unitaires + intégration
npm run typecheck   # tsc --noEmit
```

Sous-ensembles : `npm run test:db`, `npm run test:unit`, `npm run test:integration`.

## Déploiement

```bash
# 1. Migrations
supabase db push          # applique supabase/migrations/*

# 2. Secrets
cp .env.example .env && $EDITOR .env
supabase secrets set --env-file .env

# 3. Edge functions
supabase functions deploy retell-webhook  --no-verify-jwt
supabase functions deploy wedof-webhook   --no-verify-jwt
supabase functions deploy process-relances

# 4. Webhooks
#   Retell  -> https://<project>.supabase.co/functions/v1/retell-webhook
#   Wedof   -> https://<project>.supabase.co/functions/v1/wedof-webhook  (header x-wedof-signature)

# 5. Cron des relances (pg_cron) — toutes les 15 min
#   select cron.schedule('mpcpf-relances','*/15 * * * *', $$
#     select net.http_post(
#       'https://<project>.supabase.co/functions/v1/process-relances',
#       headers => jsonb_build_object('Authorization','Bearer '||current_setting('app.service_key'))
#     ); $$);
```

## Sécurité / RGPD

- Webhooks authentifiés (signature HMAC Retell, secret partagé Wedof).
- Idempotence garantie par `webhook_events (provider, event_type, external_id)`.
- RLS activé sur les tables `crm` : accès réservé au `service_role` (edge functions) ;
  lecture des référentiels et vues ouverte aux rôles authentifiés (dashboards).
- Bucket `call-recordings` **privé** (URLs signées à la demande).
