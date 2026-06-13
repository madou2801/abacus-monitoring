-- 0008_parcours_functions.sql
-- Fonctions du parcours, vues enrichies, bucket documents, RLS des nouvelles tables.

-- ---------------------------------------------------------------------------
-- _step_satisfied : une étape de parcours est-elle remplie pour ce dossier ?
-- (formulaire complété + pièces validées + devis accepté selon la définition)
-- ---------------------------------------------------------------------------
create or replace function crm._step_satisfied(p_benef uuid, p_step crm.journey_steps)
returns boolean
language plpgsql
stable
as $$
declare
  d text;
begin
  if p_step.requires_form is not null and not exists (
    select 1 from crm.intake_submissions
     where beneficiary_id = p_benef and form_type = p_step.requires_form and completed
  ) then
    return false;
  end if;

  if array_length(p_step.requires_docs, 1) is not null then
    foreach d in array p_step.requires_docs loop
      if not exists (
        select 1 from crm.documents
         where beneficiary_id = p_benef and doc_type = d and status = 'validated'
      ) then
        return false;
      end if;
    end loop;
  end if;

  if p_step.requires_quote_accepted and not exists (
    select 1 from crm.quotes where beneficiary_id = p_benef and status = 'accepted'
  ) then
    return false;
  end if;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- beneficiary_next_step : première étape du parcours non satisfaite (ou null).
-- ---------------------------------------------------------------------------
create or replace function crm.beneficiary_next_step(p_benef uuid)
returns text
language plpgsql
stable
as $$
declare
  s crm.journey_steps%rowtype;
begin
  for s in select * from crm.journey_steps order by rank loop
    if not crm._step_satisfied(p_benef, s) then
      return s.code;
    end if;
  end loop;
  return null;  -- parcours complet
end;
$$;

-- ---------------------------------------------------------------------------
-- advance_journey : fait progresser le pipeline jusqu'à l'étape débloquée par
-- le plus long PRÉFIXE d'étapes consécutivement satisfaites (parcours séquentiel),
-- puis renvoie la prochaine étape attendue côté bénéficiaire.
-- ---------------------------------------------------------------------------
create or replace function crm.advance_journey(p_benef uuid, p_actor text default 'parcours')
returns text
language plpgsql
as $$
declare
  s        crm.journey_steps%rowtype;
  v_target text := null;
begin
  for s in select * from crm.journey_steps order by rank loop
    if not crm._step_satisfied(p_benef, s) then
      exit;  -- on s'arrête à la première étape non franchie
    end if;
    if s.unlocks_stage is not null then
      v_target := s.unlocks_stage;
    end if;
  end loop;

  if v_target is not null then
    perform crm.set_stage(p_benef, v_target, p_actor, 'parcours : étapes complétées');
  end if;

  return crm.beneficiary_next_step(p_benef);
end;
$$;

-- ---------------------------------------------------------------------------
-- record_document / validate_document
-- ---------------------------------------------------------------------------
create or replace function crm.record_document(
  p_benef uuid, p_doc_type text, p_bucket text, p_path text, p_bytes bigint default null
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  update crm.documents
     set status='uploaded', bucket=p_bucket, path=p_path, bytes=p_bytes, uploaded_at=now()
   where beneficiary_id=p_benef and doc_type=p_doc_type and status in ('requested','rejected')
   returning id into v_id;

  if v_id is null then
    insert into crm.documents (beneficiary_id, doc_type, status, bucket, path, bytes, uploaded_at)
    values (p_benef, p_doc_type, 'uploaded', p_bucket, p_path, p_bytes, now())
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function crm.validate_document(p_doc uuid)
returns void
language sql
as $$
  update crm.documents set status='validated', validated_at=now() where id=p_doc;
$$;

-- ---------------------------------------------------------------------------
-- transmit_quote : passe un devis à "sent" et planifie la relance d'acceptation.
-- ---------------------------------------------------------------------------
create or replace function crm.transmit_quote(p_quote uuid)
returns boolean
language plpgsql
as $$
declare
  v_benef uuid;
begin
  update crm.quotes
     set status='sent',
         sent_at=now(),
         valid_until=coalesce(valid_until, (now() + interval '30 days')::date)
   where id=p_quote and status in ('draft','sent')
   returning beneficiary_id into v_benef;

  if v_benef is null then
    return false;
  end if;

  perform crm.schedule_follow_up(v_benef, 'relance_devis', jsonb_build_object('quote_id', p_quote));
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Timeline enrichie (ajout notifications / devis / pièces / formulaires).
-- Mêmes colonnes de sortie que 0005 -> create or replace compatible.
-- ---------------------------------------------------------------------------
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
    from crm.quotes;

-- ---------------------------------------------------------------------------
-- Vue parcours : prochaine action, pièces en attente, dernier devis.
-- ---------------------------------------------------------------------------
create or replace view crm.vw_beneficiary_journey as
select
  b.id,
  b.first_name,
  b.last_name,
  b.pipeline_stage,
  b.financeur,
  b.is_france_travail,
  crm.beneficiary_next_step(b.id)              as next_step,
  js.label                                     as next_step_label,
  (select count(*) from crm.documents d
     where d.beneficiary_id = b.id and d.status <> 'validated') as documents_outstanding,
  (select status from crm.quotes q
     where q.beneficiary_id = b.id order by q.created_at desc limit 1) as latest_quote_status
from crm.beneficiaries b
left join crm.journey_steps js on js.code = crm.beneficiary_next_step(b.id);

-- ---------------------------------------------------------------------------
-- Bucket privé des pièces justificatives
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('beneficiary-documents', 'beneficiary-documents', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS des nouvelles tables (service_role only) + lecture des référentiels.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['intake_submissions','documents','quotes','notifications'] loop
    execute format('alter table crm.%I enable row level security', t);
    execute format('drop policy if exists %1$s_service_all on crm.%1$s', t);
    execute format(
      'create policy %1$s_service_all on crm.%1$s for all to service_role using (true) with check (true)', t);
  end loop;
end;
$$;

grant select on crm.financeurs, crm.journey_steps to authenticated, service_role;
grant select on crm.vw_beneficiary_journey to authenticated, service_role;
