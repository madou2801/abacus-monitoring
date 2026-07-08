-- 0022_work_layer.sql
-- Couche « travail » du CRM (style HubSpot) : notes, tâches manuelles,
-- édition des propriétés du dossier avec historique + verrouillage
-- anti-écrasement par le sync. Portable / testable (crm.* uniquement) ;
-- la prise en compte de locked_fields côté sync vit dans
-- ops/ygphyzky/sync_from_public.sql. 100 % additive.

-- ---------------------------------------------------------------------------
-- Notes staff sur un dossier
-- ---------------------------------------------------------------------------
create table if not exists crm.notes (
  id             uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references crm.beneficiaries(id) on delete cascade,
  author_email   text,
  content        text not null,
  created_at     timestamptz not null default now()
);
create index if not exists idx_notes_benef on crm.notes (beneficiary_id, created_at desc);
comment on table crm.notes is 'Notes libres du staff sur un dossier (équiv. Notes HubSpot).';

-- ---------------------------------------------------------------------------
-- Tâches manuelles staff (distinctes de follow_up_tasks = relances automatiques)
-- ---------------------------------------------------------------------------
create table if not exists crm.tasks (
  id             uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references crm.beneficiaries(id) on delete cascade,
  title          text not null,
  status         text not null default 'open',   -- open | done | canceled
  due_at         timestamptz,
  assignee_email text,
  created_by     text,
  created_at     timestamptz not null default now(),
  completed_at   timestamptz,
  constraint tasks_status_chk check (status in ('open','done','canceled'))
);
create index if not exists idx_tasks_benef on crm.tasks (beneficiary_id, created_at desc);
create index if not exists idx_tasks_open_due on crm.tasks (due_at) where status = 'open';
comment on table crm.tasks is 'Tâches manuelles du staff (rappels, actions), équiv. Tasks HubSpot.';

-- ---------------------------------------------------------------------------
-- Historique des modifications de propriétés (équiv. property history HubSpot)
-- ---------------------------------------------------------------------------
create table if not exists crm.field_changes (
  id             uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references crm.beneficiaries(id) on delete cascade,
  actor          text,
  changes        jsonb not null,     -- { champ: { "from": ..., "to": ... }, ... }
  created_at     timestamptz not null default now()
);
create index if not exists idx_field_changes_benef on crm.field_changes (beneficiary_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Champs verrouillés : une correction manuelle ne doit plus être écrasée par
-- le sync source→CRM (le sync lit cette liste — cf. ops/sync_from_public.sql).
-- ---------------------------------------------------------------------------
alter table crm.beneficiaries
  add column if not exists locked_fields text[] not null default '{}';
comment on column crm.beneficiaries.locked_fields is
  'Champs modifiés manuellement dans le CRM : le sync source→CRM ne les écrase plus.';

-- ---------------------------------------------------------------------------
-- update_beneficiary_fields : édition contrôlée des propriétés d'un dossier.
--   - allowlist de champs éditables ;
--   - ne journalise et ne verrouille que ce qui change réellement ;
--   - historise dans crm.field_changes (visible dans la timeline).
-- Renvoie true si au moins un champ a changé.
-- ---------------------------------------------------------------------------
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
    'intitule_formation','code_postal','ville_formation','motif','owner_email'
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

  -- Diff : uniquement les valeurs réellement changées ('' compte comme null).
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
    first_name         = case when v_diff ? 'first_name'         then nullif(p_changes->>'first_name','')         else first_name         end,
    last_name          = case when v_diff ? 'last_name'          then nullif(p_changes->>'last_name','')          else last_name          end,
    email              = case when v_diff ? 'email'              then lower(nullif(p_changes->>'email',''))       else email              end,
    phone              = case when v_diff ? 'phone'              then nullif(p_changes->>'phone','')              else phone              end,
    financeur          = case when v_diff ? 'financeur'          then nullif(p_changes->>'financeur','')          else financeur          end,
    intitule_formation = case when v_diff ? 'intitule_formation' then nullif(p_changes->>'intitule_formation','') else intitule_formation end,
    code_postal        = case when v_diff ? 'code_postal'        then nullif(p_changes->>'code_postal','')        else code_postal        end,
    ville_formation    = case when v_diff ? 'ville_formation'    then nullif(p_changes->>'ville_formation','')    else ville_formation    end,
    motif              = case when v_diff ? 'motif'              then nullif(p_changes->>'motif','')              else motif              end,
    owner_email        = case when v_diff ? 'owner_email'        then lower(nullif(p_changes->>'owner_email','')) else owner_email        end,
    locked_fields      = (
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

comment on function crm.update_beneficiary_fields is
  'Édition contrôlée des propriétés d''un dossier : allowlist, diff, historique (field_changes), verrouillage anti-sync.';

-- ---------------------------------------------------------------------------
-- Timeline : + notes, tâches, modifications de fiche.
-- vw_beneficiary_enriched dépend de la timeline ET fige b.* (locked_fields est
-- une nouvelle colonne) → drop de l'enrichie, replace de la timeline (mêmes
-- colonnes de sortie), recréation de l'enrichie (même définition que 0020).
-- ---------------------------------------------------------------------------
drop view if exists crm.vw_beneficiary_enriched;

create or replace view crm.vw_beneficiary_timeline as
  select beneficiary_id, 'call'::text as event_type,
         coalesce(started_at, created_at) as occurred_at,
         coalesce('Appel ' || coalesce(outcome, call_status), 'Appel') as title,
         summary as detail, id as ref_id,
         jsonb_build_object('direction', direction, 'duration_ms', duration_ms,
                            'recording_path', recording_path, 'sentiment', sentiment) as payload
    from crm.calls
union all
  select beneficiary_id, 'email', coalesce(sent_at, created_at),
         coalesce('Email : ' || subject, 'Email'), status, id,
         jsonb_build_object('direction', direction, 'to', to_addr, 'template', template_code)
    from crm.emails
union all
  select beneficiary_id, 'notification', coalesce(sent_at, created_at),
         upper(channel) || ' : ' || coalesce(template_code, subject, ''), status, id,
         jsonb_build_object('channel', channel, 'to', to_addr, 'provider', provider)
    from crm.notifications
union all
  select beneficiary_id, 'wedof', occurred_at,
         coalesce('Wedof : ' || state, 'Wedof'), event_type, id,
         jsonb_build_object('state', state, 'previous_state', previous_state)
    from crm.wedof_events
union all
  select beneficiary_id, 'stage', occurred_at,
         'Étape : ' || coalesce(from_stage, '∅') || ' → ' || to_stage, reason, id,
         jsonb_build_object('control_point', control_point, 'actor', actor, 'hours_in_prev', hours_in_prev)
    from crm.pipeline_transitions
union all
  select beneficiary_id, 'form', submitted_at,
         'Formulaire : ' || form_type, source, id,
         jsonb_build_object('form_type', form_type, 'completed', completed)
    from crm.intake_submissions
union all
  select beneficiary_id, 'document', coalesce(uploaded_at, requested_at),
         'Pièce : ' || doc_type, status, id,
         jsonb_build_object('doc_type', doc_type, 'status', status)
    from crm.documents
union all
  select beneficiary_id, 'quote', coalesce(sent_at, created_at),
         'Devis ' || financeur || ' (' || status || ')', formation_label, id,
         jsonb_build_object('financeur', financeur, 'amount_cents', amount_cents, 'status', status)
    from crm.quotes
union all
  select beneficiary_id, 'note', created_at,
         'Note de ' || coalesce(author_email, 'staff'), content, id,
         jsonb_build_object('author', author_email)
    from crm.notes
union all
  select beneficiary_id, 'task', created_at,
         'Tâche : ' || title,
         case status when 'done' then 'terminée' when 'canceled' then 'annulée'
           else 'à faire' || coalesce(' — échéance ' ||
                to_char(due_at at time zone 'Europe/Paris', 'DD/MM/YYYY'), '') end,
         id,
         jsonb_build_object('status', status, 'due_at', due_at, 'assignee', assignee_email)
    from crm.tasks
union all
  select beneficiary_id, 'edit', created_at,
         'Fiche modifiée par ' || coalesce(actor, 'staff'),
         (select string_agg(k, ', ' order by k) from jsonb_object_keys(changes) k),
         id, changes
    from crm.field_changes;

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

-- ---------------------------------------------------------------------------
-- RLS + grants (mêmes règles que le reste du schéma crm : service_role only)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['notes','tasks','field_changes'] loop
    execute format('alter table crm.%I enable row level security', t);
    execute format('drop policy if exists %I_service_all on crm.%I', t, t);
    execute format('create policy %I_service_all on crm.%I for all to service_role using (true) with check (true)', t, t);
    execute format('grant all on crm.%I to service_role', t);
  end loop;
end $$;

grant select on crm.vw_beneficiary_enriched to service_role, authenticated;
