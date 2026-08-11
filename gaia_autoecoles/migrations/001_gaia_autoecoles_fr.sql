-- =========================================================================
-- GAIA — Cartographie nationale des auto-écoles (NAF 8553Z)
-- Schéma : gaia_autoecoles_fr
-- Cible  : Supabase gaia-data-formation (eu-west-2 Paris)
-- Migration: 001_initial
-- =========================================================================

CREATE SCHEMA IF NOT EXISTS gaia_autoecoles_fr;
SET search_path TO gaia_autoecoles_fr, public;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS postgis;

-- -------------------------------------------------------------------------
-- Référentiel régions INSEE (13 métropole + 5 DROM)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS regions_fr (
    code_region   TEXT PRIMARY KEY,
    libelle       TEXT NOT NULL,
    type          TEXT NOT NULL CHECK (type IN ('metropole', 'drom'))
);

INSERT INTO regions_fr (code_region, libelle, type) VALUES
    ('11', 'Île-de-France', 'metropole'),
    ('24', 'Centre-Val de Loire', 'metropole'),
    ('27', 'Bourgogne-Franche-Comté', 'metropole'),
    ('28', 'Normandie', 'metropole'),
    ('32', 'Hauts-de-France', 'metropole'),
    ('44', 'Grand Est', 'metropole'),
    ('52', 'Pays de la Loire', 'metropole'),
    ('53', 'Bretagne', 'metropole'),
    ('75', 'Nouvelle-Aquitaine', 'metropole'),
    ('76', 'Occitanie', 'metropole'),
    ('84', 'Auvergne-Rhône-Alpes', 'metropole'),
    ('93', 'Provence-Alpes-Côte d''Azur', 'metropole'),
    ('94', 'Corse', 'metropole'),
    ('01', 'Guadeloupe', 'drom'),
    ('02', 'Martinique', 'drom'),
    ('03', 'Guyane', 'drom'),
    ('04', 'La Réunion', 'drom'),
    ('06', 'Mayotte', 'drom')
ON CONFLICT (code_region) DO UPDATE SET libelle = EXCLUDED.libelle;

-- -------------------------------------------------------------------------
-- Table 1 : cessations_ae
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cessations_ae (
    siret                          TEXT PRIMARY KEY,
    siren                          TEXT NOT NULL,
    denomination                   TEXT,
    enseigne                       TEXT,
    adresse_brute                  TEXT,
    adresse_normalisee             TEXT,
    lat                            NUMERIC(9,6),
    lon                            NUMERIC(9,6),
    code_postal                    TEXT,
    commune                        TEXT,
    departement                    TEXT,
    code_region                    TEXT REFERENCES regions_fr(code_region),
    libelle_region                 TEXT,
    date_creation                  DATE,
    date_cessation                 DATE,
    motif_cessation                TEXT,
    dernier_dirigeant_nom          TEXT,
    dernier_dirigeant_qualite      TEXT,
    qualiopi_historique            BOOLEAN DEFAULT FALSE,
    edof_historique                BOOLEAN DEFAULT FALSE,
    edof_date_derniere_session     DATE,
    edof_volume_dossiers_estime    INTEGER,
    source_principale              TEXT,
    fetched_at                     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cessations_adresse        ON cessations_ae (adresse_normalisee);
CREATE INDEX IF NOT EXISTS idx_cessations_region         ON cessations_ae (code_region);
CREATE INDEX IF NOT EXISTS idx_cessations_date           ON cessations_ae (date_cessation DESC);
CREATE INDEX IF NOT EXISTS idx_cessations_edof           ON cessations_ae (edof_historique);
CREATE INDEX IF NOT EXISTS idx_cessations_siren          ON cessations_ae (siren);
CREATE INDEX IF NOT EXISTS idx_cessations_geo            ON cessations_ae USING gist (
    ST_SetSRID(ST_MakePoint(lon, lat), 4326)
) WHERE lat IS NOT NULL AND lon IS NOT NULL;

-- -------------------------------------------------------------------------
-- Table 2 : reprises_locaux
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reprises_locaux (
    id                                BIGSERIAL PRIMARY KEY,
    adresse_normalisee                TEXT NOT NULL,
    siret_cesse                       TEXT NOT NULL,
    date_cessation                    DATE NOT NULL,
    code_region_cesse                 TEXT,
    siret_repreneur                   TEXT NOT NULL,
    date_immatriculation_repreneur    DATE NOT NULL,
    ape_repreneur                     TEXT,
    denomination_repreneur            TEXT,
    delai_jours                       INTEGER,
    meme_dirigeant                    BOOLEAN DEFAULT FALSE,
    ape_meme_secteur                  BOOLEAN DEFAULT FALSE,
    repreneur_sur_edof                BOOLEAN DEFAULT FALSE,
    score_reprise                     NUMERIC(5,2),
    score_opportunite_commerciale     NUMERIC(5,2),
    fetched_at                        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (siret_cesse, siret_repreneur)
);

CREATE INDEX IF NOT EXISTS idx_reprises_adresse           ON reprises_locaux (adresse_normalisee);
CREATE INDEX IF NOT EXISTS idx_reprises_region            ON reprises_locaux (code_region_cesse);
CREATE INDEX IF NOT EXISTS idx_reprises_score_opp        ON reprises_locaux (score_opportunite_commerciale DESC);
CREATE INDEX IF NOT EXISTS idx_reprises_score_reprise     ON reprises_locaux (score_reprise DESC);
CREATE INDEX IF NOT EXISTS idx_reprises_siret_cesse       ON reprises_locaux (siret_cesse);

-- -------------------------------------------------------------------------
-- Table 3 : etablissements_par_adresse (timeline JSONB)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS etablissements_par_adresse (
    adresse_normalisee  TEXT PRIMARY KEY,
    lat                 NUMERIC(9,6),
    lon                 NUMERIC(9,6),
    commune             TEXT,
    departement         TEXT,
    code_region         TEXT REFERENCES regions_fr(code_region),
    historique          JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eta_par_adresse_region    ON etablissements_par_adresse (code_region);
CREATE INDEX IF NOT EXISTS idx_eta_par_adresse_hist_gin  ON etablissements_par_adresse USING gin (historique);

-- -------------------------------------------------------------------------
-- Table 4 : edof_autoecoles_actives
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS edof_autoecoles_actives (
    siret                       TEXT PRIMARY KEY,
    denomination                TEXT,
    adresse_normalisee          TEXT,
    code_region                 TEXT REFERENCES regions_fr(code_region),
    libelle_region              TEXT,
    formations_permis_b         JSONB NOT NULL DEFAULT '[]'::jsonb,
    prix_min_permis_b           NUMERIC(10,2),
    prix_max_permis_b           NUMERIC(10,2),
    nombre_formations_actives   INTEGER DEFAULT 0,
    date_derniere_maj           DATE,
    statut_qualiopi             BOOLEAN DEFAULT FALSE,
    fetched_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_edof_region    ON edof_autoecoles_actives (code_region);
CREATE INDEX IF NOT EXISTS idx_edof_adresse   ON edof_autoecoles_actives (adresse_normalisee);
CREATE INDEX IF NOT EXISTS idx_edof_qualiopi  ON edof_autoecoles_actives (statut_qualiopi);

-- Snapshots EDOF historiques pour calcul deltas (T-30, T-90, T-180)
CREATE TABLE IF NOT EXISTS edof_snapshots (
    id                          BIGSERIAL PRIMARY KEY,
    siret                       TEXT NOT NULL,
    snapshot_date               DATE NOT NULL,
    nombre_formations_actives   INTEGER,
    statut_qualiopi             BOOLEAN,
    payload                     JSONB,
    UNIQUE (siret, snapshot_date)
);
CREATE INDEX IF NOT EXISTS idx_edof_snap_siret_date ON edof_snapshots (siret, snapshot_date DESC);

-- Snapshots Qualiopi pour détection perte certification
CREATE TABLE IF NOT EXISTS qualiopi_snapshots (
    id              BIGSERIAL PRIMARY KEY,
    siret           TEXT NOT NULL,
    snapshot_date   DATE NOT NULL,
    actif           BOOLEAN NOT NULL,
    UNIQUE (siret, snapshot_date)
);
CREATE INDEX IF NOT EXISTS idx_qualiopi_snap_siret ON qualiopi_snapshots (siret, snapshot_date DESC);

-- -------------------------------------------------------------------------
-- Table 5 : signaux_faibles_ae
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS signaux_faibles_ae (
    siret                                            TEXT PRIMARY KEY,
    denomination                                     TEXT,
    code_region                                      TEXT REFERENCES regions_fr(code_region),
    libelle_region                                   TEXT,
    adresse_normalisee                               TEXT,

    -- juridiques
    bodacc_procedure_collective                      BOOLEAN DEFAULT FALSE,
    bodacc_type_procedure                            TEXT,
    bodacc_date_procedure                            DATE,
    bodacc_jugement_recent_90j                       BOOLEAN DEFAULT FALSE,

    -- dirigeance
    changement_dirigeant_12m                         BOOLEAN DEFAULT FALSE,
    changements_dirigeant_24m                        INTEGER DEFAULT 0,
    dirigeant_actuel_autres_radiations               INTEGER DEFAULT 0,

    -- qualité / référencement
    qualiopi_perdu                                   BOOLEAN DEFAULT FALSE,
    qualiopi_date_perte                              DATE,
    edof_baisse_formations_6m                        BOOLEAN DEFAULT FALSE,
    edof_disparition_60j                             BOOLEAN DEFAULT FALSE,

    -- économiques
    effectifs_baisse_30pct_12m                       BOOLEAN DEFAULT FALSE,
    effectif_actuel                                  INTEGER,
    retard_depot_comptes                             BOOLEAN DEFAULT FALSE,
    capitaux_propres_negatifs                        BOOLEAN DEFAULT FALSE,
    ratio_endettement                                NUMERIC(8,4),

    -- croisés
    immatriculation_recente_dirigeant_meme_adresse   BOOLEAN DEFAULT FALSE,

    -- score
    score_fragilite                                  NUMERIC(5,2) DEFAULT 0,
    niveau_alerte                                    TEXT CHECK (niveau_alerte IN ('vert', 'jaune', 'orange', 'rouge')),
    signaux_actifs                                   JSONB NOT NULL DEFAULT '[]'::jsonb,
    fetched_at                                       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sf_region           ON signaux_faibles_ae (code_region);
CREATE INDEX IF NOT EXISTS idx_sf_score            ON signaux_faibles_ae (score_fragilite DESC);
CREATE INDEX IF NOT EXISTS idx_sf_alerte           ON signaux_faibles_ae (niveau_alerte);
CREATE INDEX IF NOT EXISTS idx_sf_adresse          ON signaux_faibles_ae (adresse_normalisee);
CREATE INDEX IF NOT EXISTS idx_sf_signaux_gin      ON signaux_faibles_ae USING gin (signaux_actifs);

-- -------------------------------------------------------------------------
-- Vues
-- -------------------------------------------------------------------------

-- Vue nationale opportunités commerciales
CREATE OR REPLACE VIEW vw_opportunites_commerciales_ae_fr AS
SELECT
    r.id,
    r.adresse_normalisee,
    c.commune,
    c.departement,
    c.code_region,
    c.libelle_region,
    r.siret_cesse,
    c.denomination AS denomination_cessee,
    r.date_cessation,
    r.siret_repreneur,
    r.denomination_repreneur,
    r.ape_repreneur,
    r.delai_jours,
    r.meme_dirigeant,
    c.edof_historique,
    r.repreneur_sur_edof,
    c.qualiopi_historique,
    r.score_reprise,
    r.score_opportunite_commerciale,
    CASE
        WHEN r.score_opportunite_commerciale >= 80 THEN 'priorite_max'
        WHEN r.score_opportunite_commerciale >= 60 THEN 'priorite_haute'
        WHEN r.score_opportunite_commerciale >= 40 THEN 'priorite_moyenne'
        ELSE 'priorite_basse'
    END AS bucket_priorite
FROM reprises_locaux r
JOIN cessations_ae c ON c.siret = r.siret_cesse
ORDER BY r.score_opportunite_commerciale DESC NULLS LAST;

-- Agrégation par région
CREATE OR REPLACE VIEW vw_opportunites_par_region AS
SELECT
    rf.code_region,
    rf.libelle,
    COUNT(*) FILTER (WHERE r.score_opportunite_commerciale >= 60) AS opportunites_priorite_haute,
    COUNT(*) AS reprises_total,
    COUNT(*) FILTER (WHERE c.edof_historique AND NOT r.repreneur_sur_edof) AS gap_edof,
    AVG(r.score_opportunite_commerciale) AS score_moyen,
    MAX(r.fetched_at) AS derniere_maj
FROM regions_fr rf
LEFT JOIN cessations_ae c ON c.code_region = rf.code_region
LEFT JOIN reprises_locaux r ON r.siret_cesse = c.siret
GROUP BY rf.code_region, rf.libelle
ORDER BY opportunites_priorite_haute DESC NULLS LAST;

-- Reprises phénix (même dirigeant + délai court + APE 8553Z)
CREATE OR REPLACE VIEW vw_reprises_phenix AS
SELECT
    r.*,
    c.denomination       AS denomination_cessee,
    c.libelle_region,
    c.edof_historique,
    c.qualiopi_historique
FROM reprises_locaux r
JOIN cessations_ae c ON c.siret = r.siret_cesse
WHERE r.meme_dirigeant = TRUE
  AND r.delai_jours <= 180
  AND r.ape_repreneur = '8553Z';

-- Locaux disponibles (cessation EDOF sans reprise)
CREATE OR REPLACE VIEW vw_locaux_disponibles_edof AS
SELECT
    c.*
FROM cessations_ae c
LEFT JOIN reprises_locaux r ON r.siret_cesse = c.siret
WHERE r.id IS NULL
  AND c.edof_historique = TRUE
  AND c.date_cessation >= CURRENT_DATE - INTERVAL '24 months'
ORDER BY c.date_cessation DESC;

-- Signaux faibles orange + rouge (action commerciale prioritaire)
CREATE OR REPLACE VIEW vw_signaux_faibles_orange_rouge AS
SELECT
    s.*,
    e.nombre_formations_actives,
    e.statut_qualiopi
FROM signaux_faibles_ae s
LEFT JOIN edof_autoecoles_actives e ON e.siret = s.siret
WHERE s.niveau_alerte IN ('orange', 'rouge')
ORDER BY s.score_fragilite DESC;

-- Pré-phénix : dirigeants en transition (immatriculation récente même adresse/secteur)
CREATE OR REPLACE VIEW vw_pre_phenix_detection AS
SELECT
    s.siret,
    s.denomination,
    s.code_region,
    s.libelle_region,
    s.adresse_normalisee,
    s.score_fragilite,
    s.niveau_alerte,
    s.changements_dirigeant_24m,
    s.dirigeant_actuel_autres_radiations,
    s.signaux_actifs
FROM signaux_faibles_ae s
WHERE s.immatriculation_recente_dirigeant_meme_adresse = TRUE
ORDER BY s.score_fragilite DESC;

-- Dashboard régional KPIs
CREATE OR REPLACE VIEW vw_dashboard_regional AS
SELECT
    rf.code_region,
    rf.libelle,
    rf.type,
    COUNT(DISTINCT c.siret)                                                    AS cessations_total,
    COUNT(DISTINCT c.siret) FILTER (WHERE c.edof_historique)                   AS cessations_edof,
    COUNT(DISTINCT r.id)                                                       AS reprises_detectees,
    COUNT(DISTINCT r.id) FILTER (WHERE r.score_opportunite_commerciale >= 60) AS opportunites_haute,
    COUNT(DISTINCT s.siret) FILTER (WHERE s.niveau_alerte = 'rouge')           AS alertes_rouges,
    COUNT(DISTINCT s.siret) FILTER (WHERE s.niveau_alerte = 'orange')          AS alertes_oranges,
    COUNT(DISTINCT e.siret)                                                    AS edof_actifs,
    MAX(GREATEST(c.fetched_at, r.fetched_at, s.fetched_at, e.fetched_at))      AS derniere_maj
FROM regions_fr rf
LEFT JOIN cessations_ae c          ON c.code_region = rf.code_region
LEFT JOIN reprises_locaux r        ON r.code_region_cesse = rf.code_region
LEFT JOIN signaux_faibles_ae s     ON s.code_region = rf.code_region
LEFT JOIN edof_autoecoles_actives e ON e.code_region = rf.code_region
GROUP BY rf.code_region, rf.libelle, rf.type
ORDER BY rf.code_region;

-- -------------------------------------------------------------------------
-- Vues matérialisées par région (18 régions) — créées via DO block
-- -------------------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT code_region FROM regions_fr LOOP
        EXECUTE format(
            'CREATE MATERIALIZED VIEW IF NOT EXISTS vw_opportunites_%s AS
                SELECT * FROM vw_opportunites_commerciales_ae_fr
                WHERE code_region = %L
                ORDER BY score_opportunite_commerciale DESC NULLS LAST',
            r.code_region, r.code_region
        );
        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS idx_vw_opp_%s_score ON vw_opportunites_%s (score_opportunite_commerciale DESC)',
            r.code_region, r.code_region
        );
    END LOOP;
END $$;

-- Helper fonction de refresh
CREATE OR REPLACE FUNCTION refresh_opportunites_regionales()
RETURNS void AS $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT code_region FROM regions_fr LOOP
        EXECUTE format('REFRESH MATERIALIZED VIEW vw_opportunites_%s', r.code_region);
    END LOOP;
END $$ LANGUAGE plpgsql;

-- -------------------------------------------------------------------------
-- Politique RLS (tables sensibles : dirigeants → service_role uniquement)
-- -------------------------------------------------------------------------
ALTER TABLE cessations_ae       ENABLE ROW LEVEL SECURITY;
ALTER TABLE reprises_locaux     ENABLE ROW LEVEL SECURITY;
ALTER TABLE signaux_faibles_ae  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all_cessations ON cessations_ae;
CREATE POLICY service_role_all_cessations ON cessations_ae
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_reprises ON reprises_locaux;
CREATE POLICY service_role_all_reprises ON reprises_locaux
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_signaux ON signaux_faibles_ae;
CREATE POLICY service_role_all_signaux ON signaux_faibles_ae
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Lecture authentifiée pour les vues d'opportunités (sans dirigeants)
DROP POLICY IF EXISTS authenticated_read_reprises ON reprises_locaux;
CREATE POLICY authenticated_read_reprises ON reprises_locaux
    FOR SELECT TO authenticated USING (true);

-- =========================================================================
-- Fin migration 001
-- =========================================================================
