-- relance_caller_infra.sql — infra du relance-caller Lucie (Q2, option B, arbitrage Fable COMMS 45).
-- État APPLIQUÉ le 15/07/2026 sur le projet Supabase MPCPF (ygphyzky), via API Management, GO Madou (§8).
-- Additif + réversible. Le producteur reste en DRY-RUN (aucun appel) tant que GO final Madou non donné.
--
-- ⚠️ Le cycle dossier = `wedof_state` (Wedof), PAS `dossiers_bpc.statut` (champ OBSOLÈTE/figé — ex.
--    Koukoui : statut='pending' mais wedof_state='serviceDoneValidated'=terminé).
-- CIBLE (choix Madou 15/07) = « devis envoyé / VALIDÉ POUR EDOF, en attente d'accord bénéficiaire » :
--    dossier soumis à EDOF (date_soumission_edof ✓) mais edof_date_accord_beneficiaire NULL → la
--    personne doit valider son dossier sur Mon Compte Formation. C'est le nudge le plus utile/légitime.

-- 1) Opt-out relances (séparé de consent_rgpd, jamais gaté dessus).
alter table crm.beneficiaries add column if not exists relance_opt_out boolean default false;
comment on column crm.beneficiaries.relance_opt_out is
  'Opt-out relances sortantes (appel+SMS), definitif. Separe de consent_rgpd. true = ne plus contacter.';

-- 2) Compteur de tentatives (cap : jamais 2x/jour + max 3 par personne).
create table if not exists crm.relance_attempts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid, beneficiary_id uuid, telephone text,
  rule text default 'relance_dossier', status text default 'dispatched',
  dry_run boolean default true, dispatched_at timestamptz not null default now()
);
alter table crm.relance_attempts enable row level security;   -- crm = service_role only
grant select, insert on crm.relance_attempts to service_role;
create index if not exists idx_relance_attempts_person on crm.relance_attempts(person_id, dispatched_at);

-- 3) Vue-politique = QUI est dû (cible Option B : soumis EDOF, en attente accord bénéficiaire).
drop view if exists crm.vw_relance_calls_due;
create view crm.vw_relance_calls_due as
select coalesce(b.canonical_person_id, b.id) as person_id, d.id as beneficiary_id,
       d.beneficiaire_prenom as prenom, upper(coalesce(d.beneficiaire_nom,'')) as nom,
       d.beneficiaire_telephone as telephone, d.wedof_state,
       coalesce(d.intitule_formation, d.formation_type) as formation,
       d.date_soumission_edof::date as soumis_edof_le,
       (now()::date - d.date_soumission_edof::date) as jours_bloque, d.numero_edof
from public.dossiers_bpc d
join crm.beneficiaries b on b.id = d.id
where d.date_soumission_edof is not null                              -- soumis à EDOF
  and d.edof_date_accord_beneficiaire is null                        -- accord bénéficiaire manquant
  and d.date_soumission_edof <= now() - interval '3 days'            -- soumis depuis >= 3j
  and coalesce(d.wedof_state,'') not in ('serviceDoneValidated','serviceDoneDeclared','inTraining',
        'refusedByAttendee','refusedByOrganism','refusedByFinancer','canceledByAttendee',
        'canceledByAttendeeNotRealized','canceledByFinancer','canceledByOrganism','rejectedWithoutTitulaireSuite')
  and coalesce(d.beneficiaire_telephone,'') ~ '[0-9]{6,}'            -- téléphone valide
  and lower(coalesce(d.beneficiaire_email,'')) <> 'md@abacus-rh.com' -- exclut tests
  and not exists (select 1 from crm.beneficiaries bo                 -- opt-out (niveau personne)
        where coalesce(bo.canonical_person_id,bo.id) = coalesce(b.canonical_person_id,b.id)
          and bo.relance_opt_out = true)
  and not exists (select 1 from crm.calls c                          -- pas d'appel <7j
        where c.beneficiary_id = d.id and c.started_at > now() - interval '7 days')
  and not exists (select 1 from crm.follow_up_tasks f                -- pas de callback en attente
        where f.beneficiary_id = d.id and f.channel in ('call','voice','telephone') and f.status = 'pending')
  and not exists (select 1 from crm.relance_attempts ra              -- jamais 2x le même jour
        where ra.person_id = coalesce(b.canonical_person_id,b.id) and ra.dispatched_at::date = now()::date)
  and (select count(*) from crm.relance_attempts ra                  -- max 3 tentatives
        where ra.person_id = coalesce(b.canonical_person_id,b.id)) < 3;
grant select on crm.vw_relance_calls_due to service_role;

-- Producteur + DISPATCH = /opt/campaign-tracker/relance_caller.py.
--   DRY_RUN par défaut. Réel = DRY_RUN=false ET RELANCE_ARMED=yes (double garde-fou) + fenêtre L-V
--   10-13h/14-20h France + plafond MAX_PER_DAY (15). Appel via Retell create-phone-call (from
--   +33974991515, agent Rappel), contexte en dynamic_variables, journal crm.relance_attempts.
--
-- ROLLBACK : drop view crm.vw_relance_calls_due; drop table crm.relance_attempts;
--            alter table crm.beneficiaries drop column relance_opt_out;
