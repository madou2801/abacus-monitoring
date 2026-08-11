-- 0010_grants.sql
-- GRANTs explicites pour le schéma `crm`. Sur Supabase, un schéma custom (≠ public)
-- ne bénéficie pas des privilèges par défaut accordés à service_role/authenticated.
-- Les edge functions utilisent service_role (bypass RLS) mais ont besoin des GRANTs
-- table/séquence/fonction. La RLS (0006/0008) reste la barrière d'autorisation.
-- 100 % additive.

-- Accès au schéma
grant usage on schema crm to service_role, authenticated;

-- service_role : accès complet (les edge functions) — RLS bypassée par le rôle.
grant all on all tables in schema crm to service_role;
grant all on all sequences in schema crm to service_role;
grant execute on all functions in schema crm to service_role;

-- authenticated : lecture seule (dashboards) — la RLS filtre les lignes
-- (aucune policy 'authenticated' sur les tables => lignes invisibles, sûr).
grant select on all tables in schema crm to authenticated;

-- Objets créés ultérieurement : mêmes privilèges par défaut.
alter default privileges in schema crm grant all on tables to service_role;
alter default privileges in schema crm grant all on sequences to service_role;
alter default privileges in schema crm grant execute on functions to service_role;
alter default privileges in schema crm grant select on tables to authenticated;
