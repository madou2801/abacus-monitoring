-- 0012_auto_ecoles_reliability.sql
-- Matching auto-école le plus fiable : priorité au déterministe (codes/SIRET),
-- géographique en MEDIUM (à confirmer), repli sur le SIÈGE (Chessy) pour les
-- autres villes, et traçabilité confiance + revue humaine + nb de candidats.
-- (sites_formation non utilisé : vide sur les 11 AE → repli siège à la place.)
-- 100 % additive.

alter table crm.auto_ecoles  add column if not exists is_siege boolean not null default false;
alter table crm.beneficiaries add column if not exists ae_match_confidence text;            -- high|medium|low|none
alter table crm.beneficiaries add column if not exists ae_match_needs_review boolean not null default false;
alter table crm.beneficiaries add column if not exists ae_match_candidates int not null default 0;

create index if not exists idx_ae_siege on crm.auto_ecoles (is_siege) where is_siege;

-- ---------------------------------------------------------------------------
-- match_auto_ecole (v2 fiable) : codes → SIRET → ville → repli siège.
-- Renvoie l'id de l'AE ; pose méthode / confiance / needs_review / candidats.
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
  v_conf    text := 'none';
  v_review  boolean := false;
  v_n       int := 0;
begin
  select wedof_codes_possibles, siret_formation, crm._norm_ville(ville_formation)
    into v_codes, v_siret, v_villen
    from crm.beneficiaries where id = p_benef;

  -- 1. codes_actions (déterministe → HIGH ; ambigu si plusieurs)
  if v_codes is not null and array_length(v_codes, 1) is not null then
    select count(*) into v_n from crm.auto_ecoles where active and codes_actions && v_codes;
    if v_n >= 1 then
      select id into v_ae from crm.auto_ecoles
        where active and codes_actions && v_codes order by created_at limit 1;
      v_method := 'code_session'; v_conf := 'high'; v_review := (v_n > 1);
    end if;
  end if;

  -- 2. SIRET (déterministe → HIGH ; ambigu si plusieurs)
  if v_ae is null and v_siret is not null and v_siret <> '' then
    select count(*) into v_n from crm.auto_ecoles where active and siret = v_siret;
    if v_n >= 1 then
      select id into v_ae from crm.auto_ecoles
        where active and siret = v_siret order by created_at limit 1;
      v_method := 'siret'; v_conf := 'high'; v_review := (v_n > 1);
    end if;
  end if;

  -- 3. ville (géographique → MEDIUM, toujours à confirmer ; on exclut le siège)
  if v_ae is null and v_villen <> '' then
    select count(*) into v_n from crm.auto_ecoles
      where active and not is_siege
        and crm._norm_ville(ville) <> '' and crm._norm_ville(ville) like '%' || v_villen || '%';
    if v_n >= 1 then
      select id into v_ae from crm.auto_ecoles
        where active and not is_siege
          and crm._norm_ville(ville) <> '' and crm._norm_ville(ville) like '%' || v_villen || '%'
        order by created_at limit 1;
      v_method := 'ville'; v_conf := 'medium'; v_review := true;
    end if;
  end if;

  -- 4. repli SIÈGE (Chessy prend les autres villes → LOW, à confirmer)
  if v_ae is null then
    select id into v_ae from crm.auto_ecoles
      where active and is_siege order by created_at limit 1;
    if v_ae is not null then
      v_method := 'siege'; v_conf := 'low'; v_review := true; v_n := 1;
    end if;
  end if;

  if v_ae is null then v_n := 0; end if;

  update crm.beneficiaries
     set auto_ecole_id = v_ae,
         ae_match_method = v_method,
         ae_match_confidence = v_conf,
         ae_match_needs_review = v_review,
         ae_match_candidates = coalesce(v_n, 0)
   where id = p_benef;

  return v_ae;
end;
$$;

-- ---------------------------------------------------------------------------
-- Vue dispatch enrichie (confiance + revue). DROP requis : nouvelles colonnes
-- insérées au milieu -> CREATE OR REPLACE refuserait le réordonnancement.
-- ---------------------------------------------------------------------------
drop view if exists crm.vw_auto_ecole_dispatch;
create view crm.vw_auto_ecole_dispatch as
select
  b.id              as beneficiary_id,
  b.first_name, b.last_name, b.pipeline_stage,
  b.ville_formation, b.siret_formation,
  b.ae_match_method, b.ae_match_confidence, b.ae_match_needs_review, b.ae_match_candidates,
  ae.id             as auto_ecole_id,
  coalesce(ae.raison_sociale, ae.nom) as auto_ecole,
  ae.is_siege       as auto_ecole_est_siege,
  coalesce(ae.email, ae.contact_email) as auto_ecole_email,
  (ae.user_id is not null)            as auto_ecole_inscrite
from crm.beneficiaries b
left join crm.auto_ecoles ae on ae.id = b.auto_ecole_id;

grant select on crm.vw_auto_ecole_dispatch to authenticated, service_role;
