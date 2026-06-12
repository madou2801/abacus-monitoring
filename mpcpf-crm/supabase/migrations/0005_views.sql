-- 0005_views.sql
-- Vues unifiées : dossier 360°, fil chronologique, métriques DMAIC, relances.

-- ---------------------------------------------------------------------------
-- vw_beneficiary_overview : une ligne par dossier, vue 360° synthétique.
-- ---------------------------------------------------------------------------
create or replace view crm.vw_beneficiary_overview as
select
  b.id,
  b.first_name,
  b.last_name,
  b.email,
  b.phone_e164,
  b.source,
  b.owner_email,
  b.pipeline_stage,
  s.label                      as stage_label,
  s.dmaic_phase,
  s.rank                       as stage_rank,
  b.stage_changed_at,
  b.wedof_state,
  b.wedof_folder_id,
  coalesce(c.calls_count, 0)   as calls_count,
  coalesce(c.recordings_count, 0) as recordings_count,
  coalesce(e.emails_count, 0)  as emails_count,
  greatest(c.last_call_at, e.last_email_at) as last_contact_at,
  f.next_follow_up_at,
  f.pending_follow_ups,
  b.created_at
from crm.beneficiaries b
join crm.pipeline_stages s on s.code = b.pipeline_stage
left join lateral (
  select count(*)                                  as calls_count,
         count(*) filter (where recording_path is not null) as recordings_count,
         max(started_at)                           as last_call_at
    from crm.calls where beneficiary_id = b.id
) c on true
left join lateral (
  select count(*) as emails_count, max(sent_at) as last_email_at
    from crm.emails where beneficiary_id = b.id
) e on true
left join lateral (
  select min(due_at) as next_follow_up_at, count(*) as pending_follow_ups
    from crm.follow_up_tasks
   where beneficiary_id = b.id and status = 'pending'
) f on true;

comment on view crm.vw_beneficiary_overview is 'Vue 360° synthétique d''un dossier bénéficiaire.';

-- ---------------------------------------------------------------------------
-- vw_beneficiary_timeline : fil chronologique unifié (appels, emails,
-- évènements Wedof, transitions de pipeline) pour l'affichage du dossier.
-- ---------------------------------------------------------------------------
create or replace view crm.vw_beneficiary_timeline as
  select
    beneficiary_id,
    'call'::text                                   as event_type,
    coalesce(started_at, created_at)               as occurred_at,
    coalesce('Appel ' || coalesce(outcome, call_status), 'Appel') as title,
    summary                                        as detail,
    id                                             as ref_id,
    jsonb_build_object(
      'direction', direction,
      'duration_ms', duration_ms,
      'recording_path', recording_path,
      'sentiment', sentiment
    )                                              as payload
  from crm.calls
union all
  select
    beneficiary_id,
    'email',
    coalesce(sent_at, created_at),
    coalesce('Email : ' || subject, 'Email'),
    status,
    id,
    jsonb_build_object('direction', direction, 'to', to_addr, 'template', template_code)
  from crm.emails
union all
  select
    beneficiary_id,
    'wedof',
    occurred_at,
    coalesce('Wedof : ' || state, 'Wedof'),
    event_type,
    id,
    jsonb_build_object('state', state, 'previous_state', previous_state)
  from crm.wedof_events
union all
  select
    beneficiary_id,
    'stage',
    occurred_at,
    'Étape : ' || coalesce(from_stage, '∅') || ' → ' || to_stage,
    reason,
    id,
    jsonb_build_object('control_point', control_point, 'actor', actor, 'hours_in_prev', hours_in_prev)
  from crm.pipeline_transitions;

comment on view crm.vw_beneficiary_timeline is 'Fil chronologique unifié de toute l''activité d''un dossier.';

-- ---------------------------------------------------------------------------
-- vw_pipeline_metrics : mesure DMAIC de chaque point de contrôle.
-- Conversion réelle vs objectif, délai médian de franchissement vs cible.
-- ---------------------------------------------------------------------------
create or replace view crm.vw_pipeline_metrics as
select
  cp.code                                          as control_point,
  cp.dmaic_phase,
  cp.from_stage,
  cp.to_stage,
  cp.criterion,
  cp.target_rate,
  cp.target_hours,
  count(t.id)                                      as transitions,
  -- Nb de dossiers ayant atteint l'étape de départ (dénominateur de conversion).
  (select count(*) from crm.pipeline_transitions tt where tt.to_stage = cp.from_stage)
    + (select count(*) from crm.beneficiaries bb
        join crm.pipeline_stages ss on ss.code = bb.pipeline_stage
        where bb.pipeline_stage = cp.from_stage) as reached_from_stage,
  round(avg(t.hours_in_prev)::numeric, 2)          as avg_hours,
  round((percentile_cont(0.5) within group (order by t.hours_in_prev))::numeric, 2) as median_hours
from crm.control_points cp
left join crm.pipeline_transitions t on t.control_point = cp.code
group by cp.code, cp.dmaic_phase, cp.from_stage, cp.to_stage,
         cp.criterion, cp.target_rate, cp.target_hours
order by min(cp.from_stage);

comment on view crm.vw_pipeline_metrics is 'Mesure DMAIC : conversion et délais par point de contrôle.';

-- ---------------------------------------------------------------------------
-- vw_funnel : répartition courante des dossiers par étape.
-- ---------------------------------------------------------------------------
create or replace view crm.vw_funnel as
select
  s.code  as stage,
  s.label,
  s.rank,
  s.dmaic_phase,
  count(b.id) as beneficiaries
from crm.pipeline_stages s
left join crm.beneficiaries b on b.pipeline_stage = s.code
group by s.code, s.label, s.rank, s.dmaic_phase
order by s.rank;

comment on view crm.vw_funnel is 'Répartition courante des dossiers dans l''entonnoir.';
