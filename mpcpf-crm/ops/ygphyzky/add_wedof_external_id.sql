-- add_wedof_external_id.sql — projet Supabase MPCPF (ygphyzky)
-- À exécuter dans Supabase → SQL Editor.
--
-- Objectif : exposer le NUMÉRO DE DOSSIER CPF/EDOF dans le CRM.
-- Dans Wedof, ce numéro (celui visible sur Mon Compte Formation) = le champ `externalId`
-- du registrationFolder. On le stocke dans une nouvelle colonne dédiée.
--
-- Additif, non destructif, idempotent.

-- 1) Colonne
alter table crm.beneficiaries add column if not exists wedof_external_id text;

comment on column crm.beneficiaries.wedof_external_id is
  'N° de dossier CPF/EDOF (Wedof registrationFolder.externalId) — visible sur Mon Compte Formation.';

-- 2) Backfill depuis l'historique des webhooks Wedof déjà reçus
--    (le numéro est présent dans crm.wedof_events.raw -> data -> externalId).
update crm.beneficiaries b
   set wedof_external_id = sub.ext
  from (
    select distinct on (beneficiary_id)
           beneficiary_id,
           raw #>> '{data,externalId}' as ext
      from crm.wedof_events
     where raw #>> '{data,externalId}' is not null
       and raw #>> '{data,externalId}' <> ''
     order by beneficiary_id, occurred_at desc
  ) sub
 where sub.beneficiary_id = b.id
   and (b.wedof_external_id is null or b.wedof_external_id = '');

-- Vérification (optionnel) : combien de dossiers ont désormais un n° CPF.
-- select count(*) filter (where wedof_external_id is not null) as avec_num,
--        count(*) as total
--   from crm.beneficiaries;
