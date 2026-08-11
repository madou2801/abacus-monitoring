-- 0021_review_hardening.sql
-- Revue : M1 (contrôle d'appartenance sur les factures) + M2 (colonnes explicites
-- dans vw_beneficiary_enriched pour ne plus recréer la vue à chaque ADD COLUMN).
-- Portable / testable (crm.* uniquement).

-- ---------------------------------------------------------------------------
-- M1 — set_invoice_status accepte un p_beneficiary OPTIONNEL. S'il est fourni et
-- ne correspond pas au propriétaire de la facture, on refuse (anti-usurpation
-- depuis l'API intake). Les appels internes (3 args) restent inchangés.
-- ---------------------------------------------------------------------------
create or replace function crm.set_invoice_status(
  p_invoice      uuid,
  p_status       text,
  p_external_ref text default null,
  p_beneficiary  uuid default null
)
returns boolean
language plpgsql
as $$
declare
  v_benef   uuid;
  v_from    text;
  v_rank    int;
  v_to_rank int;
  v_order   constant text[] := array['a_emettre','emise','transmise','payee','encaissee'];
begin
  select beneficiary_id, status into v_benef, v_from
    from crm.invoices where id = p_invoice for update;
  if not found then
    raise exception 'Facture % introuvable', p_invoice;
  end if;
  if p_beneficiary is not null and v_benef <> p_beneficiary then
    raise exception 'Facture % n''appartient pas au bénéficiaire %', p_invoice, p_beneficiary;
  end if;

  if p_status not in ('a_emettre','emise','transmise','payee','encaissee','annulee') then
    raise exception 'Statut facture "%" inconnu', p_status;
  end if;
  if p_status = v_from then return false; end if;
  if v_from = 'annulee' then return false; end if;  -- terminal
  if p_status = 'annulee' then
    if v_from = 'encaissee' then return false; end if;  -- pas d'annulation d'une encaissée
  else
    v_rank    := array_position(v_order, v_from);
    v_to_rank := array_position(v_order, p_status);
    if v_rank is not null and v_to_rank is not null and v_to_rank < v_rank then
      return false;  -- pas de retour en arrière
    end if;
  end if;

  update crm.invoices
     set status         = p_status,
         external_ref   = coalesce(p_external_ref, external_ref),
         issued_at      = case when p_status = 'emise'     then coalesce(issued_at, now())      else issued_at end,
         transmitted_at = case when p_status = 'transmise' then coalesce(transmitted_at, now()) else transmitted_at end,
         paid_at        = case when p_status = 'payee'     then coalesce(paid_at, now())        else paid_at end,
         settled_at     = case when p_status = 'encaissee' then coalesce(settled_at, now())     else settled_at end
   where id = p_invoice;

  if p_status in ('emise','transmise') then
    perform crm.schedule_follow_up(v_benef, 'relance_facture_impayee',
      jsonb_build_object('invoice_id', p_invoice));
  end if;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- M2 — colonnes explicites (au lieu de b.*) : un futur ADD COLUMN sur
-- crm.beneficiaries n'impacte plus la vue, plus de drop/recreate à chaque champ.
-- ---------------------------------------------------------------------------
drop view if exists crm.vw_beneficiary_enriched;
create view crm.vw_beneficiary_enriched as
select
  b.id, b.first_name, b.last_name, b.email, b.phone, b.phone_e164,
  b.wedof_folder_id, b.retell_contact_id, b.source, b.owner_email,
  b.pipeline_stage, b.stage_changed_at, b.wedof_state, b.consent_rgpd,
  b.metadata, b.created_at, b.updated_at, b.financeur, b.is_france_travail,
  b.wedof_codes_possibles, b.siret_formation, b.ville_formation, b.auto_ecole_id,
  b.ae_match_method, b.ae_match_confidence, b.ae_match_needs_review, b.ae_match_candidates,
  b.company_id, b.date_creation, b.date_inscription, b.intitule_formation,
  b.code_postal, b.motif,
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
