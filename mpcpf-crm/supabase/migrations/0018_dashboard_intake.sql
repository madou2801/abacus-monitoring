-- 0018_dashboard_intake.sql
-- Tableau de bord temps réel « du jour » multicanal (dédupliqué) + enrichissement
-- bénéficiaire style HubSpot (dernière activité, prochaine relance, nb interactions,
-- montant devis, statut lead). Portable / testable (crm.* uniquement).

-- ---------------------------------------------------------------------------
-- Canal d'acquisition dérivé de la source (+ drapeau France Travail).
-- ---------------------------------------------------------------------------
create or replace function crm.intake_channel(p_source text, p_is_ft boolean)
returns text language sql immutable as $$
  select case
    when coalesce(p_is_ft, false) or lower(coalesce(p_source,'')) = 'france_travail' then 'ft'
    when lower(coalesce(p_source,'')) like 'appel%'
      or lower(coalesce(p_source,'')) like 'retell%'                                  then 'retell'
    when lower(coalesce(p_source,'')) like 'formulaire%'
      or lower(coalesce(p_source,'')) in ('typeform','page_contact')                 then 'formulaire'
    when lower(coalesce(p_source,'')) in ('email_contact','email')                   then 'email'
    when lower(coalesce(p_source,'')) = 'wedof'                                       then 'edof'
    else 'autre'
  end;
$$;

-- ---------------------------------------------------------------------------
-- Intake du jour (fuseau Europe/Paris), dédupliqué par personne
-- (clé = email normalisé, sinon téléphone E.164, sinon id).
--   demandes_*  = nouveaux dossiers créés aujourd'hui  (date_creation)
--   valides_*   = devis/dossiers validés aujourd'hui   (date_inscription = acceptation)
-- Les compteurs par canal peuvent sommer > total (un bénéficiaire multicanal
-- est compté une fois par canal mais une seule fois dans le total).
-- ---------------------------------------------------------------------------
create or replace view crm.vw_intake_today as
with base as (
  select
    coalesce(lower(nullif(b.email,'')), b.phone_e164, b.id::text) as person_key,
    crm.intake_channel(b.source, b.is_france_travail)             as canal,
    ((b.date_creation    at time zone 'Europe/Paris')::date
        = (now() at time zone 'Europe/Paris')::date)              as is_demande_today,
    ((b.date_inscription at time zone 'Europe/Paris')::date
        = (now() at time zone 'Europe/Paris')::date)              as is_valide_today
  from crm.beneficiaries b
)
select
  count(distinct person_key) filter (where is_demande_today)                          as demandes_total,
  count(distinct person_key) filter (where is_demande_today and canal='retell')       as demandes_retell,
  count(distinct person_key) filter (where is_demande_today and canal='formulaire')   as demandes_formulaire,
  count(distinct person_key) filter (where is_demande_today and canal='ft')           as demandes_ft,
  count(distinct person_key) filter (where is_demande_today and canal='email')        as demandes_email,
  count(distinct person_key) filter (where is_demande_today and canal='edof')         as demandes_edof,
  count(distinct person_key) filter (where is_demande_today and canal='autre')        as demandes_autre,
  count(distinct person_key) filter (where is_valide_today)                           as valides_total,
  count(distinct person_key) filter (where is_valide_today and canal='retell')        as valides_retell,
  count(distinct person_key) filter (where is_valide_today and canal='formulaire')    as valides_formulaire,
  count(distinct person_key) filter (where is_valide_today and canal='ft')            as valides_ft,
  count(distinct person_key) filter (where is_valide_today and canal='email')         as valides_email,
  count(distinct person_key) filter (where is_valide_today and canal='edof')          as valides_edof,
  count(distinct person_key) filter (where is_valide_today and canal='autre')         as valides_autre
from base;

-- ---------------------------------------------------------------------------
-- Bénéficiaire enrichi (champs style HubSpot) — sert la liste + la fiche.
-- ---------------------------------------------------------------------------
create or replace view crm.vw_beneficiary_enriched as
select
  b.*,
  crm.intake_channel(b.source, b.is_france_travail) as canal,
  la.last_activity_at,
  coalesce(la.nb_interactions, 0)                    as nb_interactions,
  fr.next_relance_at,
  qt.montant_devis_cents,
  case
    when b.pipeline_stage = 'perdu'                                        then 'perdu'
    when b.pipeline_stage in ('inscrit','en_formation','certifie')        then 'client'
    when coalesce(la.nb_interactions,0) > 0
      or b.pipeline_stage in ('contact_etabli','qualifie')                then 'en_cours'
    else 'nouveau'
  end                                                as lead_status
from crm.beneficiaries b
left join lateral (
  select max(occurred_at) as last_activity_at, count(*) as nb_interactions
  from crm.vw_beneficiary_timeline t where t.beneficiary_id = b.id
) la on true
left join lateral (
  select min(due_at) as next_relance_at
  from crm.follow_up_tasks f where f.beneficiary_id = b.id and f.status = 'pending'
) fr on true
left join lateral (
  select amount_cents as montant_devis_cents
  from crm.quotes q where q.beneficiary_id = b.id
  order by q.created_at desc limit 1
) qt on true;

-- Grants (mêmes droits que les autres vues crm : lecture service_role + authenticated).
grant select on crm.vw_intake_today       to service_role, authenticated;
grant select on crm.vw_beneficiary_enriched to service_role, authenticated;
