-- ops/ygphyzky/sync_from_public.sql  — SPÉCIFIQUE au projet ygphyzky.
-- ⚠️ NE PAS mettre dans supabase/migrations/ : référence public.leads/dossiers_bpc
--    (absents des tests PGlite et d'un projet crm vierge).
-- Branchement intake « site → CRM » sans toucher le site ni n8n : un cron interne
-- rafraîchit crm.beneficiaries depuis leads+dossiers et, pour les NOUVEAUX dossiers
-- 'attente_validation' (après la date-butoir), crée le devis CRM + planifie la
-- relance (PAS d'envoi tant que process-relances n'est pas déployé + flip).

-- État du sync (une seule ligne).
create table if not exists crm.sync_state (
  id          int primary key default 1,
  cutoff_at   timestamptz not null default now(),  -- pas de relance pour l'historique < cutoff
  last_run_at timestamptz,
  last_stats  jsonb,
  constraint sync_state_singleton check (id = 1)
);
insert into crm.sync_state (id) values (1) on conflict (id) do nothing;

create or replace function crm.sync_from_public()
returns jsonb
language plpgsql
as $$
declare
  v_since   timestamptz;
  v_cutoff  timestamptz;
  v_bdoss   int := 0;
  v_bleads  int := 0;
  v_quotes  int := 0;
  v_matched int := 0;
  v_stats   jsonb;
begin
  select coalesce(last_run_at - interval '15 minutes', 'epoch'::timestamptz), cutoff_at
    into v_since, v_cutoff from crm.sync_state where id = 1;

  -- 1) Bénéficiaires depuis dossiers_bpc (modifiés depuis v_since), idempotent id=id.
  with up as (
    insert into crm.beneficiaries
      (id, first_name, last_name, email, phone, wedof_folder_id, wedof_state, pipeline_stage,
       source, financeur, wedof_codes_possibles, siret_formation, ville_formation, stage_changed_at,
       date_creation, date_inscription, intitule_formation, code_postal, motif)
    select
      d.id, d.beneficiaire_prenom, d.beneficiaire_nom, lower(nullif(d.beneficiaire_email,'')),
      d.beneficiaire_telephone, d.external_id, d.wedof_state,
      case lower(coalesce(d.wedof_state,''))
        when 'accepted' then 'inscrit' when 'validated' then 'inscrit' when 'registered' then 'inscrit'
        when 'notprocessed' then 'inscrit' when 'tocheck' then 'inscrit' when 'tovalidate' then 'inscrit'
        when 'intraining' then 'en_formation' when 'inprogress' then 'en_formation'
        when 'terminated' then 'certifie' when 'completed' then 'certifie'
        when 'serviceisdone' then 'certifie' when 'servicedonevalidated' then 'certifie'
        when 'canceled' then 'perdu' when 'cancelled' then 'perdu' when 'canceledbyattendee' then 'perdu'
        when 'canceledbyattendeenotrealized' then 'perdu' when 'canceledbyfinancer' then 'perdu'
        when 'refused' then 'perdu' when 'refusedbyattendee' then 'perdu' when 'refusedbyorganism' then 'perdu'
        when 'rejected' then 'perdu' when 'rejectedwithouttitulairesuite' then 'perdu' when 'aborted' then 'perdu'
        else 'inscrit' end,
      'wedof',
      case lower(coalesce(d.type_financement,''))
        when 'cpf' then 'edof' when 'opco' then 'opco' when 'france_travail' then 'kairos'
        when 'ft' then 'kairos' when 'entreprise' then 'entreprise' when 'autofinancement' then 'autofinancement'
        else null end,
      case when jsonb_typeof(d.codes_possibles)='array'
           then array(select jsonb_array_elements_text(d.codes_possibles)) else '{}'::text[] end,
      nullif(d.of_partenaire_siret,''),
      coalesce(nullif(d.of_partenaire_ville,''), nullif(d.beneficiaire_ville,'')),
      coalesce(d.created_at, now()),
      coalesce(d.created_at, now()),
      coalesce(d.date_acceptation, d.date_entree_formation, d.date_demarrage_formation),
      coalesce(nullif(d.intitule_formation,''), nullif(d.training_title,''),
               nullif(d.formation_type,''), nullif(d.type_permis,'')),
      nullif(d.beneficiaire_code_postal,''),
      nullif(d.commentaire,'')
    from public.dossiers_bpc d
    where d.updated_at >= v_since
      and coalesce(lower(d.beneficiaire_email),'') not like '%example.com%'
      and coalesce(lower(d.beneficiaire_email),'') not like '%edof-test%'
    on conflict (id) do update set
      first_name=excluded.first_name, last_name=excluded.last_name, email=excluded.email,
      phone=excluded.phone, wedof_folder_id=excluded.wedof_folder_id, wedof_state=excluded.wedof_state,
      pipeline_stage=excluded.pipeline_stage, financeur=excluded.financeur,
      wedof_codes_possibles=excluded.wedof_codes_possibles, siret_formation=excluded.siret_formation,
      ville_formation=excluded.ville_formation,
      -- date_creation NON modifiée (immuable) ; les autres suivent la source.
      date_inscription=excluded.date_inscription, intitule_formation=excluded.intitule_formation,
      code_postal=excluded.code_postal, motif=coalesce(excluded.motif, crm.beneficiaries.motif)
    returning 1)
  select count(*) into v_bdoss from up;

  -- 2) Bénéficiaires depuis leads orphelins (modifiés depuis v_since), hors tests.
  with up as (
    insert into crm.beneficiaries
      (id, first_name, last_name, email, phone, pipeline_stage, source, financeur,
       ville_formation, is_france_travail, stage_changed_at,
       date_creation, date_inscription, intitule_formation, code_postal, motif)
    select
      l.id, l.prenom, l.nom, lower(nullif(l.email,'')), l.telephone,
      case lower(coalesce(l.statut,'nouveau'))
        when 'nouveau' then 'lead' when 'contacte' then 'contact_etabli' when 'qualifie' then 'qualifie'
        when 'converti' then 'inscrit' when 'perdu' then 'perdu' else 'lead' end,
      coalesce(nullif(l.source,''),'lead'),
      case when coalesce(l.source,'')='france_travail' then 'kairos' else null end,
      nullif(l.ville,''),
      (coalesce(l.source,'')='france_travail'),
      coalesce(l.created_at, now()),
      coalesce(l.created_at, now()),
      l.inscription_date,
      nullif(l.type_demande,''),
      nullif(l.code_postal,''),
      coalesce(nullif(l.data_brute->>'motivation',''), nullif(l.data_brute->>'call_summary',''),
               nullif(l.data->>'motivation',''))
    from public.leads l
    where l.updated_at >= v_since
      and not exists (select 1 from public.dossiers_bpc d where d.lead_id = l.id)
      and coalesce(l.source,'') not in ('test_workflow','test-e2e-stripe-robot')
      and coalesce(lower(l.email),'') not like '%example.com%'
    on conflict (id) do update set
      first_name=excluded.first_name, last_name=excluded.last_name, email=excluded.email,
      phone=excluded.phone, pipeline_stage=excluded.pipeline_stage, source=excluded.source,
      financeur=excluded.financeur, ville_formation=excluded.ville_formation,
      is_france_travail=excluded.is_france_travail,
      date_inscription=excluded.date_inscription, intitule_formation=excluded.intitule_formation,
      code_postal=excluded.code_postal, motif=coalesce(excluded.motif, crm.beneficiaries.motif)
    returning 1)
  select count(*) into v_bleads from up;

  -- 3) NOUVEAUX 'attente_validation' (après cutoff) sans devis CRM -> devis + relance.
  for v_stats in
    select to_jsonb(d) from public.dossiers_bpc d
    where d.statut_parcours = 'attente_validation'
      and d.updated_at >= greatest(v_cutoff, v_since)
      and coalesce(lower(d.beneficiaire_email),'') not like '%example.com%'
      and exists (select 1 from crm.beneficiaries b where b.id = d.id)
      and not exists (select 1 from crm.quotes q where q.beneficiary_id = d.id)
  loop
    perform crm.create_quote(
      (v_stats->>'id')::uuid,
      coalesce(case lower(coalesce(v_stats->>'type_financement',''))
        when 'cpf' then 'edof' when 'opco' then 'opco' when 'france_travail' then 'kairos'
        when 'ft' then 'kairos' when 'entreprise' then 'entreprise' when 'autofinancement' then 'autofinancement'
        else 'edof' end, 'edof'),
      nullif(v_stats->>'montant_total_ttc','')::numeric::int,
      nullif(v_stats->>'intitule_formation',''),
      v_stats->>'external_id'
    );
    v_quotes := v_quotes + 1;
  end loop;

  -- 4) Matching des bénéficiaires pas encore appariés.
  select count(crm.match_auto_ecole(id)) into v_matched
    from crm.beneficiaries where auto_ecole_id is null
      and (array_length(wedof_codes_possibles,1) is not null or siret_formation is not null or ville_formation is not null);

  v_stats := jsonb_build_object(
    'benef_dossiers', v_bdoss, 'benef_leads', v_bleads,
    'devis_crees', v_quotes, 'matched', v_matched,
    'since', v_since, 'cutoff', v_cutoff, 'ran_at', now());
  update crm.sync_state set last_run_at = now(), last_stats = v_stats where id = 1;
  return v_stats;
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill des champs HubSpot (0017) pour les lignes DÉJÀ mirrorées.
-- Idempotent : date_creation protégée par coalesce (jamais écrasée) ; les
-- autres champs suivent la source. Rejouable sans effet de bord.
-- ---------------------------------------------------------------------------
update crm.beneficiaries b set
  date_creation      = coalesce(b.date_creation, d.created_at),
  date_inscription   = coalesce(d.date_acceptation, d.date_entree_formation, d.date_demarrage_formation),
  intitule_formation = coalesce(nullif(d.intitule_formation,''), nullif(d.training_title,''),
                                nullif(d.formation_type,''), nullif(d.type_permis,'')),
  code_postal        = nullif(d.beneficiaire_code_postal,''),
  motif              = coalesce(b.motif, nullif(d.commentaire,''))
from public.dossiers_bpc d
where d.id = b.id;

update crm.beneficiaries b set
  date_creation      = coalesce(b.date_creation, l.created_at),
  date_inscription   = coalesce(b.date_inscription, l.inscription_date),
  intitule_formation = coalesce(b.intitule_formation, nullif(l.type_demande,'')),
  code_postal        = coalesce(b.code_postal, nullif(l.code_postal,'')),
  motif              = coalesce(b.motif, nullif(l.data_brute->>'motivation',''),
                                nullif(l.data_brute->>'call_summary',''), nullif(l.data->>'motivation',''))
from public.leads l
where l.id = b.id;
