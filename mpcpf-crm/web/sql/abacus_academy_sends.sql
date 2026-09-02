-- ===========================================================================
-- ABACUS Academy — table de suivi de campagne (évaluation de compétences offerte)
-- Base Gaïa (oezaby) · schéma `ref` · lue par l'onglet CRM /academy via le helper ref()
--
-- À EXÉCUTER PAR MADOU dans le SQL editor du projet oezaby (DDL impossible via REST).
-- Le futur script d'envoi alimentera cette MÊME table avec les statuts
-- (sent_at / delivered_at / opened_at / replied_at / bounce_raison).
-- ===========================================================================

CREATE TABLE IF NOT EXISTS ref.abacus_academy_sends (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure      text,
  email          text,
  type           text,           -- universite | partenaire
  pays           text,
  dirigeant      text,
  statut         text NOT NULL DEFAULT 'a_envoyer',
                 -- a_envoyer | envoye | delivre | bounce | erreur | ouvert | repondu
  sent_at        timestamptz,
  delivered_at   timestamptz,
  opened_at      timestamptz,
  replied_at     timestamptz,
  bounce_raison  text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- GRANTs explicites (Supabase ne les pose plus par défaut depuis mai 2026)
GRANT SELECT, INSERT, UPDATE, DELETE ON ref.abacus_academy_sends TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ref.abacus_academy_sends TO service_role;
-- Pas d'accès anon (donnée de campagne, non publique)

-- RLS obligatoire
ALTER TABLE ref.abacus_academy_sends ENABLE ROW LEVEL SECURITY;

-- Policy minimale (idempotente)
DROP POLICY IF EXISTS "auth_all_abacus_academy_sends" ON ref.abacus_academy_sends;
CREATE POLICY "auth_all_abacus_academy_sends" ON ref.abacus_academy_sends
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Index
CREATE INDEX IF NOT EXISTS idx_abacus_academy_sends_statut
  ON ref.abacus_academy_sends (statut);
CREATE INDEX IF NOT EXISTS idx_abacus_academy_sends_created_at
  ON ref.abacus_academy_sends (created_at DESC);
