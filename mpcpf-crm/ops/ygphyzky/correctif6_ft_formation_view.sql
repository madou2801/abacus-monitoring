-- =====================================================================
-- CORRECTIF 6 — Fiche CRM Vercel : FT + intitulé formation (PRÉPARÉ, NON EXÉCUTÉ)
-- Projet Supabase MPCPF ygphyzky · schéma crm · 2026-10-05
-- =====================================================================
--
-- DÉCOUVERTE (vs hypothèse de l'audit) :
-- L'app Vercel (super-CRM) NE LIT PAS public.leads.data. Elle lit la vue
-- crm.vw_beneficiary_enriched -> table crm.beneficiaries, alimentée par
-- ops/ygphyzky/sync_from_public.sql.
--   • intitule_formation = nullif(leads.type_demande,'')  -> OK depuis étape 1+4a
--     (type_demande re-rempli à la source ; Romera = "R482 Engins — 1 catégorie").
--   • numero_france_travail = JAMAIS alimenté depuis les leads (absent de l'INSERT
--     bloc 2 du sync, lignes 113-137). -> 1502/1513 bénéficiaires sans FT, d'où
--     "FT absent" sur la fiche + blocage du bouton "Créer devis Kairos".
--
-- CE PATCH (couche affichage, le plus sûr & immédiat) : enrichit la VUE pour
-- surfacer le FT et l'intitulé via COALESCE en joignant public.leads sur id.
-- Avantages : réversible (CREATE OR REPLACE), aucune écriture de données,
-- aucune dépendance au re-run du sync, ne touche NI sync_from_public.sql
-- (zone interdite) NI la RLS. id de crm.beneficiaries = leads.id pour les lignes
-- issues des leads ; sinon le LEFT JOIN est NULL -> COALESCE conserve b.*.
--
-- ⚠️ Changement de vue = modif prod DB -> à lancer par Madou après GO.
-- Réversibilité : garder la définition d'origine (sauvegardée dans
--   crmfix/vw_beneficiary_enriched_AVANT_2026-10-05.sql) et la ré-appliquer.
-- =====================================================================

CREATE OR REPLACE VIEW crm.vw_beneficiary_enriched AS
 SELECT b.id,
    b.first_name,
    b.last_name,
    b.email,
    b.phone,
    b.phone_e164,
    b.wedof_folder_id,
    b.retell_contact_id,
    b.source,
    b.owner_email,
    b.pipeline_stage,
    b.stage_changed_at,
    b.wedof_state,
    b.consent_rgpd,
    b.metadata,
    b.created_at,
    b.updated_at,
    b.financeur,
    b.is_france_travail,
    b.wedof_codes_possibles,
    b.siret_formation,
    b.ville_formation,
    b.auto_ecole_id,
    b.ae_match_method,
    b.ae_match_confidence,
    b.ae_match_needs_review,
    b.ae_match_candidates,
    b.company_id,
    b.date_creation,
    b.date_inscription,
    -- CORRECTIF 6 : fallback intitulé (type_demande puis data.formation du lead)
    COALESCE(NULLIF(b.intitule_formation,''), NULLIF(l.type_demande,''), NULLIF(l.data->>'formation','')) AS intitule_formation,
    b.code_postal,
    b.motif,
    b.locked_fields,
    b.wedof_external_id,
    b.canonical_person_id,
    b.relance_opt_out,
    -- CORRECTIF 6 : FT = colonne CRM, sinon top-level lead, sinon sous qualification
    COALESCE(NULLIF(b.numero_france_travail,''), NULLIF(l.data->>'id_france_travail',''), NULLIF(l.data->'qualification'->>'id_france_travail','')) AS numero_france_travail,
    b.duplicate_of,
    b.is_test,
    crm.intake_channel(b.source, b.is_france_travail) AS canal,
    la.last_activity_at,
    COALESCE(la.nb_interactions, 0::bigint) AS nb_interactions,
    fr.next_relance_at,
    qt.montant_devis_cents,
        CASE
            WHEN b.pipeline_stage = 'perdu'::text THEN 'perdu'::text
            WHEN b.pipeline_stage = ANY (ARRAY['inscrit'::text, 'en_formation'::text, 'certifie'::text]) THEN 'client'::text
            WHEN COALESCE(la.nb_interactions, 0::bigint) > 0 OR (b.pipeline_stage = ANY (ARRAY['contact_etabli'::text, 'qualifie'::text])) THEN 'en_cours'::text
            ELSE 'nouveau'::text
        END AS lead_status
   FROM crm.beneficiaries b
     LEFT JOIN public.leads l ON l.id = b.id   -- CORRECTIF 6 : accès data brute lead
     LEFT JOIN LATERAL ( SELECT max(t.occurred_at) AS last_activity_at,
            count(*) AS nb_interactions
           FROM crm.vw_beneficiary_timeline t
          WHERE t.beneficiary_id = b.id) la ON true
     LEFT JOIN LATERAL ( SELECT min(f.due_at) AS next_relance_at
           FROM crm.follow_up_tasks f
          WHERE f.beneficiary_id = b.id AND f.status = 'pending'::text) fr ON true
     LEFT JOIN LATERAL ( SELECT q.amount_cents AS montant_devis_cents
           FROM crm.quotes q
          WHERE q.beneficiary_id = b.id
          ORDER BY q.created_at DESC
         LIMIT 1) qt ON true;

-- VÉRIF post-déploiement (à lire) :
--   SELECT count(*) FILTER (WHERE numero_france_travail IS NOT NULL) FROM crm.vw_beneficiary_enriched;
--   SELECT id, intitule_formation, numero_france_travail FROM crm.vw_beneficiary_enriched
--     WHERE id='da91b577-f094-48e4-a142-efdb9fcdd7f0';  -- Romera : FT doit apparaître
