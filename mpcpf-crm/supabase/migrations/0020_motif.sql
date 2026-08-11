-- 0020_motif.sql
-- Motif d'appel / résumé sur le dossier (utile pour les fiches SANS nom : appels
-- entrants Retell qui n'ont qu'un numéro). Portable (crm.* uniquement) ; le
-- peuplement depuis la source vit dans ops/ygphyzky/sync_from_public.sql.

alter table crm.beneficiaries add column if not exists motif text;
comment on column crm.beneficiaries.motif is
  'Motif d''appel / résumé (Retell motivation||call_summary, ou commentaire dossier).';

-- La vue enrichie fige la liste de colonnes de b.* à sa création → on la recrée
-- pour qu'elle expose `motif`. `create or replace` refuse le décalage de colonnes
-- (b.* gagne une colonne) → on drop d'abord.
drop view if exists crm.vw_beneficiary_enriched;
create view crm.vw_beneficiary_enriched as
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

grant select on crm.vw_beneficiary_enriched to service_role, authenticated;
