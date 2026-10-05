-- =====================================================================
-- CORRECTIF 6 (durable) — Alimenter numero_france_travail + intitulé depuis
-- les leads dans sync_from_public.sql (PRÉPARÉ, NON EXÉCUTÉ) — 2026-10-05
-- ⚠️ sync_from_public.sql = ZONE INTERDITE étape 1 (approbation manuelle).
--    Ne PAS modifier sans GO Madou. Ce fichier décrit le diff à appliquer.
-- =====================================================================
--
-- Le patch de VUE (CORRECTIF6_view_patch_PREPARE.sql) surface déjà le FT à
-- l'affichage. Ce patch-ci est le fix DE FOND : il matérialise le FT dans
-- crm.beneficiaries.numero_france_travail (utile pour le bouton "Créer devis
-- Kairos" qui lit la colonne via l'action serveur, pas la vue).
--
-- BLOC 2 du sync (INSERT depuis public.leads, ~lignes 113-158) — 2 ajouts :
--
-- (1) Liste de colonnes de l'INSERT : ajouter `numero_france_travail`
--     AVANT: (... intitule_formation, code_postal, motif)
--     APRÈS: (... intitule_formation, code_postal, motif, numero_france_travail)
--
-- (2) SELECT : ajouter l'expression FT en dernière position (après motif)
--     + enrichir l'intitulé avec data.formation :
--
--     -- intitulé : type_demande puis data.formation
--     coalesce(nullif(l.type_demande,''), nullif(l.data->>'formation','')),   -- remplace `nullif(l.type_demande,'')`
--     ...
--     -- FT (nouvelle colonne) :
--     coalesce(nullif(l.data->>'id_france_travail',''),
--              nullif(l.data->'qualification'->>'id_france_travail',''))
--
-- (3) Clause ON CONFLICT ... DO UPDATE : ajouter (non-null-wins, respect locked_fields
--     si la colonne y est ajoutée ; sinon simple coalesce pour ne jamais écraser
--     une valeur déjà présente) :
--
--     numero_france_travail = coalesce(crm.beneficiaries.numero_france_travail, excluded.numero_france_travail),
--     intitule_formation = crm.sync_keep(crm.beneficiaries.locked_fields, 'intitule_formation',
--                            crm.beneficiaries.intitule_formation, excluded.intitule_formation)  -- déjà présent, inchangé
--
-- (4) BACKFILL ponctuel des lignes déjà mirrorées (idempotent, non destructif) —
--     peut être lancé seul même sans toucher à la fonction de sync :

UPDATE crm.beneficiaries b
SET numero_france_travail = coalesce(
      nullif(l.data->>'id_france_travail',''),
      nullif(l.data->'qualification'->>'id_france_travail',''))
FROM public.leads l
WHERE l.id = b.id
  AND (b.numero_france_travail IS NULL OR b.numero_france_travail='')
  AND coalesce(
        nullif(l.data->>'id_france_travail',''),
        nullif(l.data->'qualification'->>'id_france_travail','')) IS NOT NULL;

UPDATE crm.beneficiaries b
SET intitule_formation = coalesce(nullif(l.type_demande,''), nullif(l.data->>'formation',''))
FROM public.leads l
WHERE l.id = b.id
  AND (b.intitule_formation IS NULL OR b.intitule_formation='' OR b.intitule_formation='formation')
  AND NOT (b.locked_fields @> ARRAY['intitule_formation'])   -- respecte un verrou manuel
  AND coalesce(nullif(l.type_demande,''), nullif(l.data->>'formation','')) IS NOT NULL;

-- NB : le backfill FT ci-dessus remplirait ~277 bénéficiaires lead-based
-- (288 leads avec FT top-level après Correctif A moins ceux déjà renseignés).
-- À exécuter APRÈS validation Madou (écrit dans crm.beneficiaries).
-- =====================================================================
