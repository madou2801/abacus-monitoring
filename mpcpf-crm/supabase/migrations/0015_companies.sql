-- 0015_companies.sql
-- Entreprises (façon HubSpot Companies) : objet à part entière, rattachable aux
-- bénéficiaires (salariés), avec possibilité d'émettre un devis / une facture
-- AU NOM DE L'ENTREPRISE (financement OPCO / employeur). 100 % additive.

-- ---------------------------------------------------------------------------
-- Entreprises
-- ---------------------------------------------------------------------------
create table if not exists crm.companies (
  id               uuid primary key default gen_random_uuid(),
  raison_sociale   text not null,
  siret            text,
  siren            text,
  adresse          text,
  code_postal      text,
  ville            text,
  email            text,
  telephone        text,
  contact_prenom   text,
  contact_nom      text,
  contact_fonction text,
  opco             text,        -- OPCO de rattachement le cas échéant
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_companies_siret on crm.companies (siret) where siret is not null;
create index if not exists idx_companies_nom on crm.companies (lower(raison_sociale));

drop trigger if exists trg_companies_updated_at on crm.companies;
create trigger trg_companies_updated_at
  before update on crm.companies
  for each row execute function crm.set_updated_at();

-- ---------------------------------------------------------------------------
-- Rattachements : salarié -> entreprise ; devis / facture -> entreprise
-- ---------------------------------------------------------------------------
alter table crm.beneficiaries add column if not exists company_id uuid references crm.companies(id) on delete set null;
alter table crm.quotes        add column if not exists company_id uuid references crm.companies(id) on delete set null;
alter table crm.invoices      add column if not exists company_id uuid references crm.companies(id) on delete set null;

create index if not exists idx_benef_company on crm.beneficiaries (company_id);

-- ---------------------------------------------------------------------------
-- upsert_company : crée/maj une entreprise (clé naturelle = SIRET si fourni).
-- ---------------------------------------------------------------------------
create or replace function crm.upsert_company(
  p_raison_sociale   text,
  p_siret            text default null,
  p_adresse          text default null,
  p_code_postal      text default null,
  p_ville            text default null,
  p_email            text default null,
  p_telephone        text default null,
  p_contact_prenom   text default null,
  p_contact_nom      text default null,
  p_contact_fonction text default null,
  p_opco             text default null
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  if p_siret is not null and p_siret <> '' then
    select id into v_id from crm.companies where siret = p_siret limit 1;
  end if;

  if v_id is not null then
    update crm.companies set
      raison_sociale   = coalesce(p_raison_sociale, raison_sociale),
      adresse          = coalesce(p_adresse, adresse),
      code_postal      = coalesce(p_code_postal, code_postal),
      ville            = coalesce(p_ville, ville),
      email            = coalesce(p_email, email),
      telephone        = coalesce(p_telephone, telephone),
      contact_prenom   = coalesce(p_contact_prenom, contact_prenom),
      contact_nom      = coalesce(p_contact_nom, contact_nom),
      contact_fonction = coalesce(p_contact_fonction, contact_fonction),
      opco             = coalesce(p_opco, opco)
    where id = v_id;
    return v_id;
  end if;

  insert into crm.companies
    (raison_sociale, siret, adresse, code_postal, ville, email, telephone,
     contact_prenom, contact_nom, contact_fonction, opco)
  values
    (p_raison_sociale, nullif(p_siret,''), p_adresse, p_code_postal, p_ville, p_email, p_telephone,
     p_contact_prenom, p_contact_nom, p_contact_fonction, p_opco)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- link_beneficiary_company : rattache un salarié à une entreprise.
-- ---------------------------------------------------------------------------
create or replace function crm.link_beneficiary_company(p_benef uuid, p_company uuid)
returns void
language plpgsql
as $$
begin
  if p_company is not null and not exists (select 1 from crm.companies where id = p_company) then
    raise exception 'Entreprise % introuvable', p_company;
  end if;
  update crm.beneficiaries set company_id = p_company where id = p_benef;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_quote (v2) : ajoute p_company_id => devis émis AU NOM DE L'ENTREPRISE.
-- Remplace la version 0014 (drop de l'ancienne signature pour éviter l'overload).
-- ---------------------------------------------------------------------------
drop function if exists crm.create_quote(uuid, text, integer, text, text, date, boolean, jsonb);

create or replace function crm.create_quote(
  p_benef           uuid,
  p_financeur       text,
  p_amount_cents    integer default null,
  p_formation_label text default null,
  p_external_ref    text default null,
  p_valid_until     date default null,
  p_transmit        boolean default true,
  p_metadata        jsonb default '{}'::jsonb,
  p_company_id      uuid default null           -- si fourni : devis au nom de l'entreprise
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from crm.beneficiaries where id = p_benef) then
    raise exception 'Bénéficiaire % introuvable', p_benef;
  end if;
  if not exists (select 1 from crm.financeurs where code = p_financeur) then
    raise exception 'Financeur "%" inconnu', p_financeur;
  end if;
  if p_company_id is not null and not exists (select 1 from crm.companies where id = p_company_id) then
    raise exception 'Entreprise % introuvable', p_company_id;
  end if;

  insert into crm.quotes
    (beneficiary_id, company_id, financeur, formation_label, amount_cents, external_ref, valid_until, metadata)
  values
    (p_benef, p_company_id, p_financeur, p_formation_label, p_amount_cents, p_external_ref, p_valid_until,
     coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;

  if p_transmit then
    perform crm.transmit_quote(v_id);
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Vue entreprise : salariés + devis + factures rattachés.
-- ---------------------------------------------------------------------------
create or replace view crm.vw_company_overview as
select
  c.id, c.raison_sociale, c.siret, c.ville, c.opco,
  c.contact_prenom, c.contact_nom, c.email, c.telephone,
  (select count(*) from crm.beneficiaries b where b.company_id = c.id) as nb_salaries,
  (select count(*) from crm.quotes q where q.company_id = c.id)        as nb_devis,
  (select count(*) from crm.invoices i where i.company_id = c.id)      as nb_factures,
  (select coalesce(sum(i.amount_cents),0) from crm.invoices i where i.company_id = c.id) as total_facture_cents
from crm.companies c;

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table crm.companies enable row level security;
drop policy if exists companies_service_all on crm.companies;
create policy companies_service_all on crm.companies
  for all to service_role using (true) with check (true);

grant all on crm.companies to service_role;
grant select on crm.companies to authenticated;
grant select on crm.vw_company_overview to authenticated, service_role;
