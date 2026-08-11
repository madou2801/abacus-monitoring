-- 0002_core_tables.sql
-- Tables coeur de la vue unifiée d'un dossier bénéficiaire.

-- ---------------------------------------------------------------------------
-- Bénéficiaires (dossiers)
-- ---------------------------------------------------------------------------
create table if not exists crm.beneficiaries (
  id                 uuid primary key default gen_random_uuid(),
  first_name         text,
  last_name          text,
  email              text,
  phone              text,                       -- tel saisi
  phone_e164         text generated always as (crm.normalize_phone(phone)) stored,
  -- Références externes
  wedof_folder_id    text,                       -- registrationFolder Wedof
  retell_contact_id  text,
  source             text default 'inconnu',     -- ads, organique, partenaire...
  owner_email        text,                       -- commercial responsable
  -- Pipeline (détaillé dans 0003)
  pipeline_stage     text not null default 'lead',
  stage_changed_at   timestamptz not null default now(),
  wedof_state        text,                        -- dernier état Wedof connu
  consent_rgpd       boolean not null default false,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_benef_phone_e164 on crm.beneficiaries (phone_e164);
create index if not exists idx_benef_email       on crm.beneficiaries (lower(email));
create index if not exists idx_benef_wedof       on crm.beneficiaries (wedof_folder_id);
create index if not exists idx_benef_stage       on crm.beneficiaries (pipeline_stage);

drop trigger if exists trg_benef_updated_at on crm.beneficiaries;
create trigger trg_benef_updated_at
  before update on crm.beneficiaries
  for each row execute function crm.set_updated_at();

comment on table crm.beneficiaries is 'Dossier bénéficiaire — entité pivot du CRM.';

-- ---------------------------------------------------------------------------
-- Appels Retell
-- ---------------------------------------------------------------------------
create table if not exists crm.calls (
  id                    uuid primary key default gen_random_uuid(),
  beneficiary_id        uuid references crm.beneficiaries(id) on delete set null,
  retell_call_id        text not null unique,
  agent_id              text,
  direction             text,                     -- inbound | outbound
  from_number           text,
  to_number             text,
  call_status           text,                     -- registered | ongoing | ended | error
  disconnection_reason  text,                     -- user_hangup | no_answer | voicemail | ...
  started_at            timestamptz,
  ended_at              timestamptz,
  duration_ms           integer,
  -- Enregistrement audio
  recording_source_url  text,                     -- URL Retell d'origine (éphémère)
  recording_bucket      text,                     -- bucket Supabase Storage
  recording_path        text,                     -- chemin dans le bucket
  recording_bytes       bigint,
  -- Analyse Retell
  call_successful       boolean,
  sentiment             text,                     -- positive | neutral | negative
  summary               text,
  outcome               text,                     -- answered | no_answer | voicemail | callback | not_interested
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_calls_benef   on crm.calls (beneficiary_id);
create index if not exists idx_calls_started on crm.calls (started_at desc);

drop trigger if exists trg_calls_updated_at on crm.calls;
create trigger trg_calls_updated_at
  before update on crm.calls
  for each row execute function crm.set_updated_at();

comment on table crm.calls is 'Appels Retell rattachés à un dossier (enregistrement dans Supabase Storage).';

-- ---------------------------------------------------------------------------
-- Transcripts d'appels
-- ---------------------------------------------------------------------------
create table if not exists crm.transcripts (
  id           uuid primary key default gen_random_uuid(),
  call_id      uuid not null references crm.calls(id) on delete cascade,
  full_text    text,
  utterances   jsonb,                             -- [{role, content, words...}]
  word_count   integer,
  language     text default 'fr',
  created_at   timestamptz not null default now(),
  unique (call_id)
);

comment on table crm.transcripts is 'Transcription texte intégrale d''un appel Retell.';

-- ---------------------------------------------------------------------------
-- Emails (entrants / sortants)
-- ---------------------------------------------------------------------------
create table if not exists crm.emails (
  id                  uuid primary key default gen_random_uuid(),
  beneficiary_id      uuid references crm.beneficiaries(id) on delete set null,
  direction           text not null default 'outbound',  -- inbound | outbound
  subject             text,
  body                text,
  from_addr           text,
  to_addr             text,
  status              text default 'queued',     -- queued | sent | delivered | opened | clicked | bounced | failed
  provider            text,                       -- gmail | resend | ...
  provider_message_id text,
  template_code       text,
  sent_at             timestamptz,
  opened_at           timestamptz,
  clicked_at          timestamptz,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_emails_benef on crm.emails (beneficiary_id);

drop trigger if exists trg_emails_updated_at on crm.emails;
create trigger trg_emails_updated_at
  before update on crm.emails
  for each row execute function crm.set_updated_at();

comment on table crm.emails is 'Emails échangés avec un bénéficiaire.';

-- ---------------------------------------------------------------------------
-- Évènements Wedof (statuts CPF)
-- ---------------------------------------------------------------------------
create table if not exists crm.wedof_events (
  id              uuid primary key default gen_random_uuid(),
  beneficiary_id  uuid references crm.beneficiaries(id) on delete set null,
  wedof_folder_id text,
  event_type      text,                           -- registrationFolder.* / proposal.* ...
  state           text,                           -- notProcessed | toCheck | validated | inTraining | terminated | canceled ...
  previous_state  text,
  occurred_at     timestamptz not null default now(),
  raw             jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists idx_wedof_benef  on crm.wedof_events (beneficiary_id);
create index if not exists idx_wedof_folder on crm.wedof_events (wedof_folder_id);

comment on table crm.wedof_events is 'Historique des changements de statut Wedof d''un dossier.';

-- ---------------------------------------------------------------------------
-- Journal des webhooks (idempotence + audit)
-- ---------------------------------------------------------------------------
create table if not exists crm.webhook_events (
  id               uuid primary key default gen_random_uuid(),
  provider         text not null,                 -- retell | wedof
  event_type       text,
  external_id      text,                          -- call_id, folder id... pour dédup
  signature_valid  boolean,
  processed        boolean not null default false,
  error            text,
  payload          jsonb not null default '{}'::jsonb,
  received_at      timestamptz not null default now(),
  processed_at     timestamptz,
  -- Une même (provider, event_type, external_id) ne doit être traitée qu'une fois.
  unique (provider, event_type, external_id)
);

create index if not exists idx_webhook_provider on crm.webhook_events (provider, received_at desc);

comment on table crm.webhook_events is 'Journal brut des webhooks entrants (idempotence + audit).';
