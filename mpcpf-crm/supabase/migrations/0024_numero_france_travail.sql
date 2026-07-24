-- 0024_numero_france_travail.sql
-- N° identifiant France Travail (demandeur d'emploi) sur le dossier : requis pour
-- créer un devis Kairos/AIF (le robot recherche le DE via ce numéro).
-- Portable (crm.* uniquement).

alter table crm.beneficiaries add column if not exists numero_france_travail text;
comment on column crm.beneficiaries.numero_france_travail is
  'Identifiant France Travail (n° demandeur d''emploi) — requis pour les devis Kairos/AIF.';

-- update_beneficiary_fields : + numero_france_travail dans l'allowlist et l'update.
create or replace function crm.update_beneficiary_fields(
  p_benef   uuid,
  p_changes jsonb,
  p_actor   text default null
)
returns boolean
language plpgsql
as $$
declare
  v_allowed constant text[] := array[
    'first_name','last_name','email','phone','financeur',
    'intitule_formation','code_postal','ville_formation','motif','owner_email',
    'numero_france_travail'
  ];
  v_key  text;
  v_old  jsonb;
  v_diff jsonb;
begin
  select to_jsonb(b) into v_old from crm.beneficiaries b where id = p_benef for update;
  if v_old is null then
    raise exception 'Bénéficiaire % introuvable', p_benef;
  end if;

  for v_key in select jsonb_object_keys(coalesce(p_changes, '{}'::jsonb)) loop
    if not (v_key = any (v_allowed)) then
      raise exception 'Champ "%" non modifiable', v_key;
    end if;
  end loop;

  if coalesce(nullif(p_changes->>'financeur',''), '') <> ''
     and not exists (select 1 from crm.financeurs where code = p_changes->>'financeur') then
    raise exception 'Financeur "%" inconnu', p_changes->>'financeur';
  end if;

  select coalesce(jsonb_object_agg(k, jsonb_build_object(
           'from', v_old->k,
           'to',   coalesce(to_jsonb(nullif(p_changes->>k,'')), 'null'::jsonb))), '{}'::jsonb)
    into v_diff
  from jsonb_object_keys(coalesce(p_changes, '{}'::jsonb)) k
  where coalesce(v_old->>k, '') <> coalesce(nullif(p_changes->>k,''), '');

  if v_diff = '{}'::jsonb then
    return false;
  end if;

  update crm.beneficiaries set
    first_name            = case when v_diff ? 'first_name'            then nullif(p_changes->>'first_name','')            else first_name            end,
    last_name             = case when v_diff ? 'last_name'             then nullif(p_changes->>'last_name','')             else last_name             end,
    email                 = case when v_diff ? 'email'                 then lower(nullif(p_changes->>'email',''))          else email                 end,
    phone                 = case when v_diff ? 'phone'                 then nullif(p_changes->>'phone','')                 else phone                 end,
    financeur             = case when v_diff ? 'financeur'             then nullif(p_changes->>'financeur','')             else financeur             end,
    intitule_formation    = case when v_diff ? 'intitule_formation'    then nullif(p_changes->>'intitule_formation','')    else intitule_formation    end,
    code_postal           = case when v_diff ? 'code_postal'           then nullif(p_changes->>'code_postal','')           else code_postal           end,
    ville_formation       = case when v_diff ? 'ville_formation'       then nullif(p_changes->>'ville_formation','')       else ville_formation       end,
    motif                 = case when v_diff ? 'motif'                 then nullif(p_changes->>'motif','')                 else motif                 end,
    owner_email           = case when v_diff ? 'owner_email'           then lower(nullif(p_changes->>'owner_email','')) else owner_email           end,
    numero_france_travail = case when v_diff ? 'numero_france_travail' then nullif(p_changes->>'numero_france_travail','') else numero_france_travail end,
    locked_fields         = (
      select coalesce(array_agg(distinct f), '{}'::text[])
      from unnest(locked_fields
                  || (select coalesce(array_agg(k), '{}'::text[])
                      from jsonb_object_keys(v_diff) k)) f
    )
  where id = p_benef;

  insert into crm.field_changes (beneficiary_id, actor, changes)
  values (p_benef, p_actor, v_diff);

  return true;
end;
$$;

-- Recréer la vue enrichie pour exposer numero_france_travail (b.* est figé à la création).
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
