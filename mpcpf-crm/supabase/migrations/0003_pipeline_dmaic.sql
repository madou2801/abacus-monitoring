-- 0003_pipeline_dmaic.sql
-- Pipeline commercial cadré par la méthode Harvey / DMAIC.
-- Chaque transition d'étape franchit un "point de contrôle" mesurable.

-- ---------------------------------------------------------------------------
-- Étapes du pipeline (référentiel)
-- ---------------------------------------------------------------------------
create table if not exists crm.pipeline_stages (
  code         text primary key,
  label        text not null,
  rank         integer not null,            -- ordre dans l'entonnoir
  dmaic_phase  text not null,               -- Define | Measure | Analyze | Improve | Control
  is_terminal  boolean not null default false,
  is_won       boolean not null default false,
  description  text
);

insert into crm.pipeline_stages (code, label, rank, dmaic_phase, is_terminal, is_won, description) values
  ('lead',           'Lead entrant',          1, 'Define',  false, false, 'Dossier créé, coordonnées capturées.'),
  ('contact_etabli', 'Contact établi',        2, 'Measure', false, false, 'Au moins un appel décroché.'),
  ('qualifie',       'Qualifié / éligible',   3, 'Analyze', false, false, 'Éligibilité CPF confirmée + besoin identifié.'),
  ('inscrit',        'Inscrit (Wedof)',       4, 'Improve', false, false, 'Dossier d''inscription créé/validé sur Wedof.'),
  ('en_formation',   'En formation',          5, 'Improve', false, false, 'Formation démarrée (Wedof inTraining).'),
  ('certifie',       'Certifié / clôturé',    6, 'Control', true,  true,  'Formation terminée + certification obtenue.'),
  ('perdu',          'Perdu / abandon',      99, 'Control', true,  false, 'Dossier abandonné ou non éligible.')
on conflict (code) do update
  set label = excluded.label,
      rank = excluded.rank,
      dmaic_phase = excluded.dmaic_phase,
      is_terminal = excluded.is_terminal,
      is_won = excluded.is_won,
      description = excluded.description;

-- ---------------------------------------------------------------------------
-- Points de contrôle DMAIC (gates entre étapes) + objectifs mesurables
-- ---------------------------------------------------------------------------
create table if not exists crm.control_points (
  code         text primary key,
  from_stage   text not null references crm.pipeline_stages(code),
  to_stage     text not null references crm.pipeline_stages(code),
  dmaic_phase  text not null,
  criterion    text not null,               -- critère de franchissement
  target_rate  numeric(5,2),                -- objectif de conversion (0..1)
  target_hours numeric(8,2)                 -- délai cible de franchissement (h)
);

insert into crm.control_points (code, from_stage, to_stage, dmaic_phase, criterion, target_rate, target_hours) values
  ('cp_contact',    'lead',           'contact_etabli', 'Measure',  'Premier appel décroché',                 0.60, 48),
  ('cp_qualif',     'contact_etabli', 'qualifie',       'Analyze',  'Éligibilité CPF + besoin confirmés',     0.55, 72),
  ('cp_inscription','qualifie',       'inscrit',        'Improve',  'Dossier Wedof créé/validé',              0.50, 120),
  ('cp_demarrage',  'inscrit',        'en_formation',   'Improve',  'Entrée en formation (Wedof inTraining)', 0.85, 336),
  ('cp_completion', 'en_formation',   'certifie',       'Control',  'Certification obtenue',                  0.80, 2160)
on conflict (code) do update
  set criterion = excluded.criterion,
      target_rate = excluded.target_rate,
      target_hours = excluded.target_hours;

-- ---------------------------------------------------------------------------
-- Historique des transitions d'étape
-- ---------------------------------------------------------------------------
create table if not exists crm.pipeline_transitions (
  id              uuid primary key default gen_random_uuid(),
  beneficiary_id  uuid not null references crm.beneficiaries(id) on delete cascade,
  from_stage      text,
  to_stage        text not null,
  control_point   text references crm.control_points(code),
  reason          text,
  actor           text,                       -- 'retell-webhook' | 'wedof-webhook' | email | manuel
  hours_in_prev   numeric(10,2),              -- temps passé dans l'étape précédente
  occurred_at     timestamptz not null default now()
);

create index if not exists idx_transitions_benef on crm.pipeline_transitions (beneficiary_id, occurred_at);

-- ---------------------------------------------------------------------------
-- set_stage : point d'entrée unique pour faire avancer un dossier.
-- Journalise la transition, rattache le point de contrôle et calcule le délai.
-- N'effectue rien si l'étape est inchangée. Refuse les régressions sauf 'perdu'.
-- ---------------------------------------------------------------------------
create or replace function crm.set_stage(
  p_beneficiary uuid,
  p_to_stage    text,
  p_actor       text default 'system',
  p_reason      text default null,
  p_force       boolean default false
)
returns boolean
language plpgsql
as $$
declare
  v_from        text;
  v_changed_at  timestamptz;
  v_from_rank   integer;
  v_to_rank     integer;
  v_cp          text;
  v_hours       numeric(10,2);
begin
  select pipeline_stage, stage_changed_at
    into v_from, v_changed_at
    from crm.beneficiaries
   where id = p_beneficiary
   for update;

  if not found then
    raise exception 'Bénéficiaire % introuvable', p_beneficiary;
  end if;

  if not exists (select 1 from crm.pipeline_stages where code = p_to_stage) then
    raise exception 'Étape "%" inconnue', p_to_stage;
  end if;

  if v_from = p_to_stage then
    return false;  -- aucune transition
  end if;

  select rank into v_from_rank from crm.pipeline_stages where code = v_from;
  select rank into v_to_rank   from crm.pipeline_stages where code = p_to_stage;

  -- On bloque les retours en arrière (sauf 'perdu' ou force explicite).
  if v_to_rank < v_from_rank and p_to_stage <> 'perdu' and not p_force then
    return false;
  end if;

  v_hours := round(extract(epoch from (now() - v_changed_at)) / 3600.0, 2);

  select code into v_cp
    from crm.control_points
   where from_stage = v_from and to_stage = p_to_stage;

  update crm.beneficiaries
     set pipeline_stage = p_to_stage,
         stage_changed_at = now()
   where id = p_beneficiary;

  insert into crm.pipeline_transitions
    (beneficiary_id, from_stage, to_stage, control_point, reason, actor, hours_in_prev)
  values
    (p_beneficiary, v_from, p_to_stage, v_cp, p_reason, p_actor, v_hours);

  return true;
end;
$$;

comment on function crm.set_stage is
  'Fait avancer un dossier dans le pipeline en journalisant la transition et son point de contrôle DMAIC.';
