-- 0007_parcours.sql
-- Parcours bénéficiaire : acquisition Lucie (capture d'infos + notifications),
-- formulaires d'intake, pièces justificatives, devis multi-financeurs (EDOF /
-- Kairos / OPCO / entreprise) et cas France Travail.
-- 100 % additif : n'altère aucune table existante.

-- ---------------------------------------------------------------------------
-- Financeurs (référentiel)
-- ---------------------------------------------------------------------------
create table if not exists crm.financeurs (
  code        text primary key,
  label       text not null,
  channel     text not null,        -- edof | kairos | opco | entreprise | autofinancement
  description text
);

insert into crm.financeurs (code, label, channel, description) values
  ('edof',            'CPF (EDOF)',            'edof',            'Financement via le Compte Personnel de Formation, dossier EDOF/Wedof.'),
  ('kairos',          'France Travail (Kairos)','kairos',         'Financement France Travail via Kairos (AIF).'),
  ('opco',            'OPCO',                  'opco',            'Financement par un OPCO (salariés).'),
  ('entreprise',      'Entreprise (direct)',   'entreprise',      'Prise en charge directe par l''employeur.'),
  ('autofinancement', 'Autofinancement',       'autofinancement', 'Paiement direct par le bénéficiaire.')
on conflict (code) do update set label = excluded.label, channel = excluded.channel, description = excluded.description;

-- On mémorise le financeur pressenti sur le dossier (sans contrainte stricte
-- pour rester tolérant aux dossiers en cours de qualification).
alter table crm.beneficiaries add column if not exists financeur text;
alter table crm.beneficiaries add column if not exists is_france_travail boolean not null default false;

-- ---------------------------------------------------------------------------
-- Soumissions de formulaires (intake, éligibilité, France Travail)
-- ---------------------------------------------------------------------------
create table if not exists crm.intake_submissions (
  id              uuid primary key default gen_random_uuid(),
  beneficiary_id  uuid not null references crm.beneficiaries(id) on delete cascade,
  form_type       text not null,        -- intake | eligibility | france_travail | financeur
  source          text not null default 'portail',  -- portail | lucie | web
  payload         jsonb not null default '{}'::jsonb,
  completed       boolean not null default true,
  submitted_at    timestamptz not null default now()
);

create index if not exists idx_intake_benef on crm.intake_submissions (beneficiary_id);

-- ---------------------------------------------------------------------------
-- Pièces justificatives (upload dans Supabase Storage)
-- ---------------------------------------------------------------------------
create table if not exists crm.documents (
  id              uuid primary key default gen_random_uuid(),
  beneficiary_id  uuid not null references crm.beneficiaries(id) on delete cascade,
  doc_type        text not null,        -- cni | justif_domicile | rib | attestation_ft | devis_signe | ...
  status          text not null default 'requested',  -- requested | uploaded | validated | rejected
  bucket          text,
  path            text,
  bytes           bigint,
  requested_at    timestamptz not null default now(),
  uploaded_at     timestamptz,
  validated_at    timestamptz,
  metadata        jsonb not null default '{}'::jsonb
);

create index if not exists idx_documents_benef on crm.documents (beneficiary_id);

-- ---------------------------------------------------------------------------
-- Devis multi-financeurs
-- ---------------------------------------------------------------------------
create table if not exists crm.quotes (
  id              uuid primary key default gen_random_uuid(),
  beneficiary_id  uuid not null references crm.beneficiaries(id) on delete cascade,
  financeur       text not null references crm.financeurs(code),
  formation_label text,
  amount_cents    integer,
  currency        text not null default 'EUR',
  status          text not null default 'draft',  -- draft | sent | accepted | refused | expired
  external_ref    text,                 -- ref EDOF/Wedof, n° AIF Kairos, ref OPCO...
  valid_until     date,
  sent_at         timestamptz,
  decided_at      timestamptz,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_quotes_benef on crm.quotes (beneficiary_id);

drop trigger if exists trg_quotes_updated_at on crm.quotes;
create trigger trg_quotes_updated_at
  before update on crm.quotes
  for each row execute function crm.set_updated_at();

-- ---------------------------------------------------------------------------
-- Notifications sortantes unifiées (SMS + email)
-- ---------------------------------------------------------------------------
create table if not exists crm.notifications (
  id                  uuid primary key default gen_random_uuid(),
  beneficiary_id      uuid references crm.beneficiaries(id) on delete set null,
  channel             text not null,    -- sms | email
  template_code       text,
  to_addr             text,             -- email ou numéro
  subject             text,
  body                text,
  status              text not null default 'queued',  -- queued | sent | delivered | failed
  provider            text,
  provider_message_id text,
  follow_up_task      uuid references crm.follow_up_tasks(id) on delete set null,
  sent_at             timestamptz,
  error               text,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

create index if not exists idx_notif_benef on crm.notifications (beneficiary_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Étapes du parcours (ce que le bénéficiaire doit accomplir)
-- ---------------------------------------------------------------------------
create table if not exists crm.journey_steps (
  code             text primary key,
  label            text not null,
  rank             integer not null,
  unlocks_stage    text references crm.pipeline_stages(code),  -- étape pipeline débloquée une fois l'étape parcours faite
  requires_form    text,                 -- form_type attendu dans intake_submissions
  requires_docs    text[] not null default '{}',  -- doc_types attendus validés
  requires_quote_accepted boolean not null default false,  -- un devis doit être accepté
  description      text
);

insert into crm.journey_steps (code, label, rank, unlocks_stage, requires_form, requires_docs, requires_quote_accepted, description) values
  ('intake',       'Formulaire de prise de contact', 1, null,        'intake',      '{}',                    false, 'Coordonnées + objectif (permis visé).'),
  ('eligibilite',  'Éligibilité au financement',     2, 'qualifie',  'eligibility', '{}',                    false, 'Vérification CPF / France Travail / OPCO.'),
  ('pieces',       'Pièces justificatives',          3, null,        null,          '{cni,justif_domicile}', false, 'Dépôt CNI + justificatif de domicile.'),
  ('devis',        'Acceptation du devis',           4, 'inscrit',   null,          '{}',                    true,  'Devis transmis et accepté par le financeur.')
on conflict (code) do update
  set label = excluded.label, rank = excluded.rank, unlocks_stage = excluded.unlocks_stage,
      requires_form = excluded.requires_form, requires_docs = excluded.requires_docs,
      requires_quote_accepted = excluded.requires_quote_accepted,
      description = excluded.description;

-- ---------------------------------------------------------------------------
-- Règles de relance additionnelles (parcours)
-- ---------------------------------------------------------------------------
insert into crm.follow_up_rules
  (code, label, trigger_event, channel, delay_minutes, max_attempts, template_code, description) values
  ('relance_intake',    'Relance formulaire intake', 'intake_incomplete', 'sms',   720, 3, 'tpl_intake_reminder',
     'Relance par SMS si le formulaire de prise de contact n''est pas complété.'),
  ('relance_pieces',    'Relance pièces manquantes', 'documents_missing', 'email', 1440, 4, 'tpl_documents_reminder',
     'Relance email pour déposer les pièces justificatives manquantes.'),
  ('relance_devis',     'Relance acceptation devis', 'quote_sent',        'sms',   2880, 3, 'tpl_quote_reminder',
     'Relance pour accepter le devis transmis.')
on conflict (code) do update
  set label = excluded.label, trigger_event = excluded.trigger_event, channel = excluded.channel,
      delay_minutes = excluded.delay_minutes, max_attempts = excluded.max_attempts,
      template_code = excluded.template_code, description = excluded.description;
