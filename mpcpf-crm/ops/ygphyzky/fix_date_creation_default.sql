-- fix_date_creation_default.sql — projet Supabase MPCPF (ygphyzky)
-- À exécuter dans Supabase → SQL Editor.
--
-- Problème : crm.beneficiaries.date_creation a été ajoutée (migration 0017) SANS `default`.
-- Les dossiers créés par l'intake-api (source='wedof') arrivent donc avec date_creation = NULL.
-- Conséquences côté web :
--   #4 le filtre « demandes du jour » fait .gte("date_creation") → FALSE sur NULL → liste vide (page vierge).
--   #5 la liste par défaut trie date_creation DESC nulls last → les dossiers récents coulent en dernière page.
--
-- Correctif (additif, non destructif, idempotent) :
--   1) donner un défaut now() → tout NOUVEAU dossier est visible immédiatement (l'insert intake sans
--      date_creation prendra now() automatiquement — pas besoin de toucher l'edge function).
--   2) backfill des lignes existantes à NULL depuis created_at (qui a déjà default now()).

alter table crm.beneficiaries alter column date_creation set default now();

update crm.beneficiaries
   set date_creation = coalesce(date_creation, created_at)
 where date_creation is null;

-- Vérification (optionnel) : doit renvoyer 0.
-- select count(*) from crm.beneficiaries where date_creation is null;
