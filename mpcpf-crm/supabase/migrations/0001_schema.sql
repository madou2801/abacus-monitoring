-- 0001_schema.sql
-- MPCPF CRM — schéma de base + utilitaires partagés.
-- Idempotent : peut être rejoué sans casser une base existante.

create schema if not exists crm;

comment on schema crm is
  'CRM MonPermisCPF : dossiers bénéficiaires, appels Retell, emails, statuts Wedof, '
  'pipeline DMAIC et automatisations de relance.';

-- Trigger générique : maintient automatiquement la colonne updated_at.
create or replace function crm.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Normalise un numéro de téléphone FR vers un format E.164 best-effort.
-- Sert de clé de rapprochement entre un appel Retell et un dossier.
create or replace function crm.normalize_phone(raw text)
returns text
language plpgsql
immutable
as $$
declare
  digits text;
  has_plus boolean;
begin
  if raw is null then
    return null;
  end if;

  -- On garde uniquement les chiffres et un éventuel '+' de tête.
  -- (Le moteur regex Postgres ne supporte pas le lookahead : on procède en 2 temps.)
  digits := regexp_replace(raw, '[^0-9+]', '', 'g');
  has_plus := left(digits, 1) = '+';
  digits := replace(digits, '+', '');
  if has_plus then
    digits := '+' || digits;
  end if;

  if digits = '' or digits = '+' then
    return null;
  end if;

  if left(digits, 1) = '+' then
    return digits;                              -- déjà E.164
  elsif left(digits, 2) = '00' then
    return '+' || substring(digits from 3);     -- 0033... -> +33...
  elsif left(digits, 2) = '33' then
    return '+' || digits;                       -- 33... -> +33...
  elsif left(digits, 1) = '0' and length(digits) = 10 then
    return '+33' || substring(digits from 2);   -- 0X........ -> +33X........
  else
    return digits;
  end if;
end;
$$;
