-- 0004_relances.sql
-- Automatisations de relance : règles déclenchées par des évènements,
-- file de tâches déduplicée, fonctions de planification et de collecte.

-- ---------------------------------------------------------------------------
-- Règles de relance (référentiel paramétrable)
-- ---------------------------------------------------------------------------
create table if not exists crm.follow_up_rules (
  code           text primary key,
  label          text not null,
  trigger_event  text not null,        -- call_no_answer | call_voicemail | wedof_to_complete | stale_in_stage
  channel        text not null,        -- call | email | sms
  delay_minutes  integer not null default 0,
  max_attempts   integer not null default 3,
  template_code  text,
  active         boolean not null default true,
  description    text
);

insert into crm.follow_up_rules
  (code, label, trigger_event, channel, delay_minutes, max_attempts, template_code, description) values
  ('relance_no_answer',  'Rappel après non-réponse', 'call_no_answer',   'call',  1440, 3, 'tpl_call_back',
     'Replanifie un appel J+1 quand le bénéficiaire n''a pas décroché.'),
  ('relance_voicemail',  'Email après messagerie',   'call_voicemail',   'email',   60, 2, 'tpl_voicemail_followup',
     'Envoie un email de relance après un appel tombé sur messagerie.'),
  ('relance_wedof_doc',  'Relance pièces Wedof',      'wedof_to_complete','email',  120, 4, 'tpl_wedof_documents',
     'Relance le bénéficiaire pour compléter son dossier Wedof.'),
  ('relance_stale',      'Relance dossier dormant',   'stale_in_stage',   'call',     0, 5, 'tpl_stale_revival',
     'Relance un dossier resté trop longtemps dans la même étape.')
on conflict (code) do update
  set label = excluded.label,
      trigger_event = excluded.trigger_event,
      channel = excluded.channel,
      delay_minutes = excluded.delay_minutes,
      max_attempts = excluded.max_attempts,
      template_code = excluded.template_code,
      description = excluded.description;

-- ---------------------------------------------------------------------------
-- File des tâches de relance
-- ---------------------------------------------------------------------------
create table if not exists crm.follow_up_tasks (
  id              uuid primary key default gen_random_uuid(),
  beneficiary_id  uuid not null references crm.beneficiaries(id) on delete cascade,
  rule_code       text not null references crm.follow_up_rules(code),
  channel         text not null,
  status          text not null default 'pending',  -- pending | done | canceled | failed
  attempt_no      integer not null default 1,
  due_at          timestamptz not null,
  template_code   text,
  payload         jsonb not null default '{}'::jsonb,
  result          text,
  last_error      text,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index if not exists idx_fut_due
  on crm.follow_up_tasks (due_at)
  where status = 'pending';
create index if not exists idx_fut_benef on crm.follow_up_tasks (beneficiary_id);

-- Une seule relance "pending" par (dossier, règle) : évite les doublons.
create unique index if not exists uniq_fut_pending
  on crm.follow_up_tasks (beneficiary_id, rule_code)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- schedule_follow_up : planifie une relance selon une règle.
-- Respecte max_attempts, le délai de la règle, et déduplique les 'pending'.
-- Retourne l'id de la tâche créée, ou null si rien n'a été planifié.
-- ---------------------------------------------------------------------------
create or replace function crm.schedule_follow_up(
  p_beneficiary uuid,
  p_rule_code   text,
  p_payload     jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_rule    crm.follow_up_rules%rowtype;
  v_done    integer;
  v_attempt integer;
  v_task_id uuid;
begin
  select * into v_rule from crm.follow_up_rules where code = p_rule_code and active;
  if not found then
    return null;  -- règle inconnue ou désactivée
  end if;

  -- Déjà une relance en attente pour cette règle ? On ne double pas.
  if exists (
    select 1 from crm.follow_up_tasks
     where beneficiary_id = p_beneficiary
       and rule_code = p_rule_code
       and status = 'pending'
  ) then
    return null;
  end if;

  -- Nombre de tentatives déjà consommées (done/failed) pour plafonner.
  select count(*) into v_done
    from crm.follow_up_tasks
   where beneficiary_id = p_beneficiary
     and rule_code = p_rule_code
     and status in ('done', 'failed');

  if v_done >= v_rule.max_attempts then
    return null;  -- quota de relances atteint
  end if;

  v_attempt := v_done + 1;

  insert into crm.follow_up_tasks
    (beneficiary_id, rule_code, channel, attempt_no, due_at, template_code, payload)
  values
    (p_beneficiary,
     p_rule_code,
     v_rule.channel,
     v_attempt,
     now() + make_interval(mins => v_rule.delay_minutes),
     v_rule.template_code,
     coalesce(p_payload, '{}'::jsonb))
  returning id into v_task_id;

  return v_task_id;
end;
$$;

comment on function crm.schedule_follow_up is
  'Planifie une relance (déduplication des pending + respect de max_attempts).';

-- ---------------------------------------------------------------------------
-- due_follow_ups : relances échues à traiter (consommé par process-relances).
-- ---------------------------------------------------------------------------
create or replace function crm.due_follow_ups(p_limit integer default 100)
returns setof crm.follow_up_tasks
language sql
stable
as $$
  select *
    from crm.follow_up_tasks
   where status = 'pending'
     and due_at <= now()
   order by due_at asc
   limit p_limit;
$$;

-- ---------------------------------------------------------------------------
-- complete_follow_up : marque une relance traitée (done/failed).
-- ---------------------------------------------------------------------------
create or replace function crm.complete_follow_up(
  p_task_id uuid,
  p_status  text default 'done',
  p_result  text default null,
  p_error   text default null
)
returns void
language plpgsql
as $$
begin
  update crm.follow_up_tasks
     set status = p_status,
         result = p_result,
         last_error = p_error,
         completed_at = now()
   where id = p_task_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- detect_stale_and_schedule : balaie les dossiers dormants et planifie
-- une relance 'relance_stale'. À appeler par un cron (process-relances).
-- Un dossier est "dormant" s'il dépasse target_hours du point de contrôle
-- de son étape courante sans avancer. Retourne le nombre de relances créées.
-- ---------------------------------------------------------------------------
create or replace function crm.detect_stale_and_schedule()
returns integer
language plpgsql
as $$
declare
  v_count integer := 0;
  r record;
begin
  for r in
    select b.id
      from crm.beneficiaries b
      join crm.pipeline_stages s on s.code = b.pipeline_stage
      left join crm.control_points cp on cp.from_stage = b.pipeline_stage
     where s.is_terminal = false
       and cp.target_hours is not null
       and b.stage_changed_at < now() - make_interval(hours => cp.target_hours::int)
  loop
    if crm.schedule_follow_up(r.id, 'relance_stale') is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
