-- dedup_canonical_person_id_PROPOSAL.sql — Q4 dedup, option (ii) (arbitrage Fable COMMS 38/41)
-- ⚠️ PROPOSITION — NE PAS EXÉCUTER SANS GO MADOU EXPLICITE (règle CRM « schéma crm = GO »).
--
-- But : regrouper les lignes `crm.beneficiaries` d'un MÊME individu (email normalisé) SANS rien
-- supprimer et SANS toucher les `beneficiary_id` (les jointures live crm.calls / crm.quotes / notes
-- / tâches restent attachées). La granularité DOSSIER reste dans public.dossiers_bpc (1 personne → N
-- dossiers = group by canonical). Purement ADDITIF + RÉVERSIBLE (drop de colonne/vue).
--
-- Périmètre backfill (preview 15/07) : 40 clusters / 91 lignes / 51 doublons à rattacher.
-- md@abacus-rh.com (lignes de test) EXCLU du clustering.

-- 1) Colonne self-FK (nullable) + index.
alter table crm.beneficiaries
  add column if not exists canonical_person_id uuid references crm.beneficiaries(id) on delete set null;

comment on column crm.beneficiaries.canonical_person_id is
  'Dedup PERSONNE : les doublons d''un même individu (email normalisé) pointent vers la ligne canonique. '
  'NULL = ligne canonique. Clé personne = coalesce(canonical_person_id, id). Dossiers = public.dossiers_bpc.';

create index if not exists idx_benef_canonical_person on crm.beneficiaries (canonical_person_id);

-- 2) Backfill déterministe. Canonique par email normalisé, priorité :
--    (a) ligne liée à public.dossiers_bpc, (b) created_at le plus ancien, (c) plus petit id.
--    On ne renseigne QUE les doublons non-canoniques ; la ligne canonique reste NULL.
with cl as (
  select lower(trim(b.email)) as em,
         (array_agg(b.id order by
            (exists (select 1 from public.dossiers_bpc d where d.id = b.id)) desc,
            b.created_at asc nulls last, b.id asc))[1] as canonical_id
  from crm.beneficiaries b
  where b.email is not null and trim(b.email) <> ''
    and lower(trim(b.email)) <> 'md@abacus-rh.com'
  group by lower(trim(b.email))
  having count(*) > 1
)
update crm.beneficiaries b
   set canonical_person_id = cl.canonical_id
  from cl
 where lower(trim(b.email)) = cl.em
   and b.id <> cl.canonical_id;

-- 3) Vérif post-migration (doit renvoyer 51 lignes rattachées, 0 orphelin) :
--   select count(*) filter (where canonical_person_id is not null) rattaches from crm.beneficiaries;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (réversibilité totale) :
--   drop index if exists crm.idx_benef_canonical_person;
--   alter table crm.beneficiaries drop column if exists canonical_person_id;
-- ─────────────────────────────────────────────────────────────────────────────
-- CAUSE RACINE (à traiter séparément, coordination session CRM — fichier sync_from_public.sql) :
--   à l'ingestion, avant insert d'un nouveau bénéficiaire, chercher un canonique existant par email
--   normalisé et renseigner canonical_person_id → plus de nouveaux doublons orphelins.
-- VUE PERSONNE (optionnelle, étape fiche) : group by coalesce(canonical_person_id, id) → 1 ligne
--   par individu + count(distinct dossier) ; nécessite GRANT/RLS selon convention CRM.
