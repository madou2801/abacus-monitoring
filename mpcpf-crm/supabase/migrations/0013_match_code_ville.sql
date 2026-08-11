-- 0013_match_code_ville.sql
-- Fiabilité matching : les codes encodent la VILLE de l'auto-école
-- (ex: dossier 'PCB_ST-POL-SUR-TERNOISE' vs AE 'PCB2_ST-POL-SUR-TERNOISE' — préfixe
-- différent donc l'overlap exact échoue, mais la ville 'ST-POL-SUR-TERNOISE' = l'AE).
-- On ajoute un niveau DÉTERMINISTE « ville de l'AE présente dans un code du dossier »,
-- placé juste après l'overlap exact et avant SIRET. Réconcilie les divergences vues
-- en parité (codes PCB vs PCB2). 100 % additive.

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

  -- 1. codes_actions exact (déterministe → HIGH)
  if v_codes is not null and array_length(v_codes, 1) is not null then
    select count(*) into v_n from crm.auto_ecoles where active and codes_actions && v_codes;
    if v_n >= 1 then
      select id into v_ae from crm.auto_ecoles
        where active and codes_actions && v_codes order by created_at limit 1;
      v_method := 'code_session'; v_conf := 'high'; v_review := (v_n > 1);
    end if;
  end if;

  -- 2. ville de l'AE présente dans un code du dossier (lien géo déterministe → HIGH)
  if v_ae is null and v_codes is not null and array_length(v_codes, 1) is not null then
    select count(*) into v_n
      from crm.auto_ecoles ae
     where ae.active and not ae.is_siege and length(crm._norm_ville(ae.ville)) >= 4
       and exists (select 1 from unnest(v_codes) c
                   where position(crm._norm_ville(ae.ville) in crm._norm_ville(c)) > 0);
    if v_n >= 1 then
      select ae.id into v_ae
        from crm.auto_ecoles ae
       where ae.active and not ae.is_siege and length(crm._norm_ville(ae.ville)) >= 4
         and exists (select 1 from unnest(v_codes) c
                     where position(crm._norm_ville(ae.ville) in crm._norm_ville(c)) > 0)
       order by length(crm._norm_ville(ae.ville)) desc, ae.created_at  -- ville la + spécifique d'abord
       limit 1;
      v_method := 'code_ville'; v_conf := 'high'; v_review := (v_n > 1);
    end if;
  end if;

  -- 3. SIRET (déterministe → HIGH)
  if v_ae is null and v_siret is not null and v_siret <> '' then
    select count(*) into v_n from crm.auto_ecoles where active and siret = v_siret;
    if v_n >= 1 then
      select id into v_ae from crm.auto_ecoles
        where active and siret = v_siret order by created_at limit 1;
      v_method := 'siret'; v_conf := 'high'; v_review := (v_n > 1);
    end if;
  end if;

  -- 4. ville du dossier (géographique → MEDIUM, à confirmer ; siège exclu)
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

  -- 5. repli SIÈGE (Chessy prend les autres villes → LOW, à confirmer)
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
