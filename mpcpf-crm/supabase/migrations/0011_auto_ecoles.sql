-- 0011_auto_ecoles.sql
-- Appariement bénéficiaire ↔ auto-école (porté depuis Sync Wedof v8 « Matcher Auto-Ecole »).
-- Logique 3 niveaux : (1) codes_actions (intersection), (2) SIRET, (3) ville (l'AE
-- contient la ville du dossier). 100 % additive.

-- ---------------------------------------------------------------------------
-- Référentiel auto-écoles (miroir des champs utiles au matching + dispatch)
-- L'id reprend l'id prod (`public.auto_ecoles.id`) pour aligner les deux bases.
-- ---------------------------------------------------------------------------
create table if not exists crm.auto_ecoles (
  id              uuid primary key default gen_random_uuid(),
  nom             text,
  raison_sociale  text,
  siret           text,
  codes_actions   text[] not null default '{}',
  ville           text,
  code_postal     text,
  email           text,
  contact_email   text,
  telephone       text,
  active          boolean not null default true,
  statut          text,
  tarif_horaire   numeric,
  user_id         uuid,                 -- non null => AE inscrite (a un compte)
  sites_formation jsonb not null default '[]'::jsonb,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_ae_siret on crm.auto_ecoles (siret) where siret is not null;
create index if not exists idx_ae_codes on crm.auto_ecoles using gin (codes_actions);

drop trigger if exists trg_auto_ecoles_updated_at on crm.auto_ecoles;
create trigger trg_auto_ecoles_updated_at
  before update on crm.auto_ecoles
  for each row execute function crm.set_updated_at();

-- ---------------------------------------------------------------------------
-- Champs d'appariement sur le dossier bénéficiaire (issus de Wedof)
-- ---------------------------------------------------------------------------
alter table crm.beneficiaries add column if not exists wedof_codes_possibles text[] not null default '{}';
alter table crm.beneficiaries add column if not exists siret_formation text;
alter table crm.beneficiaries add column if not exists ville_formation text;
alter table crm.beneficiaries add column if not exists auto_ecole_id uuid references crm.auto_ecoles(id) on delete set null;
alter table crm.beneficiaries add column if not exists ae_match_method text;  -- code_session | siret | ville | none

-- ---------------------------------------------------------------------------
-- Normalisation ville (majuscules, lettres seulement) — identique au Matcher v8.
-- ---------------------------------------------------------------------------
create or replace function crm._norm_ville(p text)
returns text language sql immutable as $$
  select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z]', '', 'g'));
$$;

-- ---------------------------------------------------------------------------
-- match_auto_ecole : applique la logique 3 niveaux, rattache l'AALE au dossier,
-- renvoie l'id de l'auto-école trouvée (ou null). N'apparie que des AE actives.
-- ---------------------------------------------------------------------------
create or replace function crm.match_auto_ecole(p_benef uuid)
returns uuid
language plpgsql
as $$
declare
  v_codes   text[];
  v_siret   text;
  v_villen  text;
  v_ae      uuid;
  v_method  text := 'none';
begin
  select wedof_codes_possibles, siret_formation, crm._norm_ville(ville_formation)
    into v_codes, v_siret, v_villen
    from crm.beneficiaries where id = p_benef;

  -- 1. par codes_actions (intersection de tableaux)
  if v_codes is not null and array_length(v_codes, 1) is not null then
    select id into v_ae
      from crm.auto_ecoles
     where active and codes_actions && v_codes
     order by created_at
     limit 1;
    if v_ae is not null then v_method := 'code_session'; end if;
  end if;

  -- 2. par SIRET
  if v_ae is null and v_siret is not null and v_siret <> '' then
    select id into v_ae
      from crm.auto_ecoles
     where active and siret = v_siret
     order by created_at
     limit 1;
    if v_ae is not null then v_method := 'siret'; end if;
  end if;

  -- 3. par ville (la ville de l'AE contient celle du dossier)
  if v_ae is null and v_villen <> '' then
    select id into v_ae
      from crm.auto_ecoles
     where active and crm._norm_ville(ville) <> ''
       and crm._norm_ville(ville) like '%' || v_villen || '%'
     order by created_at
     limit 1;
    if v_ae is not null then v_method := 'ville'; end if;
  end if;

  update crm.beneficiaries
     set auto_ecole_id = v_ae, ae_match_method = v_method
   where id = p_benef;

  return v_ae;
end;
$$;

-- ---------------------------------------------------------------------------
-- Vue : dossiers et leur auto-école appariée (suivi du dispatch)
-- ---------------------------------------------------------------------------
create or replace view crm.vw_auto_ecole_dispatch as
select
  b.id              as beneficiary_id,
  b.first_name, b.last_name, b.pipeline_stage,
  b.ville_formation, b.siret_formation,
  b.ae_match_method,
  ae.id             as auto_ecole_id,
  coalesce(ae.raison_sociale, ae.nom) as auto_ecole,
  coalesce(ae.email, ae.contact_email) as auto_ecole_email,
  (ae.user_id is not null)            as auto_ecole_inscrite
from crm.beneficiaries b
left join crm.auto_ecoles ae on ae.id = b.auto_ecole_id;

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table crm.auto_ecoles enable row level security;
drop policy if exists auto_ecoles_service_all on crm.auto_ecoles;
create policy auto_ecoles_service_all on crm.auto_ecoles
  for all to service_role using (true) with check (true);

grant all on crm.auto_ecoles to service_role;
grant select on crm.auto_ecoles to authenticated;
grant select on crm.vw_auto_ecole_dispatch to authenticated, service_role;
