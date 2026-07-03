-- 0017_hubspot_fields.sql
-- Champs "par défaut" style HubSpot sur le dossier bénéficiaire.
-- Portable / testable (PGlite) : uniquement des ADD COLUMN sur crm.*, aucune
-- référence à public.*. Le peuplement depuis la source vit dans
-- ops/ygphyzky/sync_from_public.sql (backfill + sync incrémental).

alter table crm.beneficiaries
  add column if not exists date_creation      timestamptz,  -- Create date (immuable) : 1re demande
  add column if not exists date_inscription   timestamptz,  -- Became a Customer : acceptation/entrée
  add column if not exists intitule_formation text,         -- Formation demandée
  add column if not exists code_postal        text;

comment on column crm.beneficiaries.date_creation is
  'Date de 1re demande côté source (immuable) — équiv. "Create date" HubSpot.';
comment on column crm.beneficiaries.date_inscription is
  'Date d''inscription / acceptation dossier — équiv. "Became a Customer date" HubSpot.';
comment on column crm.beneficiaries.intitule_formation is 'Formation demandée (intitulé).';
comment on column crm.beneficiaries.code_postal is 'Code postal du bénéficiaire.';

-- Tri liste par date de création (plus récents d'abord).
create index if not exists idx_benef_date_creation
  on crm.beneficiaries (date_creation desc nulls last);
