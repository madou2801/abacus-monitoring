-- relance_caller_infra.sql — infra du relance-caller Lucie (Q2, option B, arbitrage Fable COMMS 45).
-- État APPLIQUÉ le 15/07/2026 sur le projet Supabase MPCPF (ygphyzky), via API Management, GO Madou (§8).
-- Additif + réversible. Le producteur reste en DRY-RUN (aucun appel) tant que GO final Madou non donné.
--
-- ⚠️ POLITIQUE basée sur `wedof_state` (source de vérité du cycle), PAS sur `dossiers_bpc.statut`
--    (champ OBSOLÈTE/figé — ex. Koukoui : statut='pending' mais wedof_state='serviceDoneValidated'=terminé).

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

-- 3) Vue-politique : QUI est dû pour un appel de relance (gated dossier action-requise = lien existant).
--    wedof_state ∈ {accepted, validated} = accepté/validé mais PAS encore démarré (relance utile).
--    Exclut de fait : serviceDone*, inTraining, refused*, canceled*, rejected* (terminés/morts).
drop view if exists crm.vw_relance_calls_due;
create view crm.vw_relance_calls_due as
select coalesce(b.canonical_person_id, b.id) as person_id, d.id as beneficiary_id,
       d.beneficiaire_prenom as prenom, upper(coalesce(d.beneficiaire_nom,'')) as nom,
       d.beneficiaire_telephone as telephone, d.wedof_state,
       coalesce(d.intitule_formation, d.formation_type) as formation,
       d.updated_at as dossier_maj, (now()::date - d.updated_at::date) as jours_bloque
from public.dossiers_bpc d
join crm.beneficiaries b on b.id = d.id
where coalesce(d.wedof_state,'') in ('accepted','validated')          -- action requise (lien existant)
  and d.updated_at <= now() - interval '3 days'                       -- bloqué >= 3j
  and coalesce(d.beneficiaire_telephone,'') ~ '[0-9]{6,}'             -- téléphone valide
  and lower(coalesce(d.beneficiaire_email,'')) <> 'md@abacus-rh.com'  -- exclut tests
  and not exists (select 1 from crm.beneficiaries bo                  -- opt-out (niveau personne)
        where coalesce(bo.canonical_person_id,bo.id) = coalesce(b.canonical_person_id,b.id)
          and bo.relance_opt_out = true)
  and not exists (select 1 from crm.calls c                           -- pas d'appel <7j
        where c.beneficiary_id = d.id and c.started_at > now() - interval '7 days')
  and not exists (select 1 from crm.follow_up_tasks f                 -- pas de callback en attente
        where f.beneficiary_id = d.id and f.channel in ('call','voice','telephone') and f.status = 'pending')
  and not exists (select 1 from crm.relance_attempts ra               -- jamais 2x le même jour
        where ra.person_id = coalesce(b.canonical_person_id,b.id) and ra.dispatched_at::date = now()::date)
  and (select count(*) from crm.relance_attempts ra                   -- max 3 tentatives
        where ra.person_id = coalesce(b.canonical_person_id,b.id)) < 3;
grant select on crm.vw_relance_calls_due to service_role;

-- Fenêtre horaire (L-V 10-13h/14-20h France) + plafond quotidien (15/j) = dans le producteur
-- /opt/campaign-tracker/relance_caller.py (DRY_RUN par défaut). Dispatch réel + insert relance_attempts
-- + capture opt-out (Lucie/STOP) = APRÈS revue liste Madou + GO final.
--
-- ROLLBACK : drop view crm.vw_relance_calls_due; drop table crm.relance_attempts;
--            alter table crm.beneficiaries drop column relance_opt_out;
