-- 0014_create_quote.sql
-- Primitive SQL de création de devis (manuelle back-office OU automatisée).
-- Un seul appel : insère le devis dans crm.quotes puis (par défaut) le transmet
-- (statut 'sent' + planification de la relance devis via crm.transmit_quote).
-- Ne touche que crm.* → portable. 100 % additive.

create or replace function crm.create_quote(
  p_benef           uuid,
  p_financeur       text,
  p_amount_cents    integer default null,
  p_formation_label text default null,
  p_external_ref    text default null,
  p_valid_until     date default null,
  p_transmit        boolean default true,
  p_metadata        jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from crm.beneficiaries where id = p_benef) then
    raise exception 'Bénéficiaire % introuvable', p_benef;
  end if;
  if not exists (select 1 from crm.financeurs where code = p_financeur) then
    raise exception 'Financeur "%" inconnu', p_financeur;
  end if;

  insert into crm.quotes
    (beneficiary_id, financeur, formation_label, amount_cents, external_ref, valid_until, metadata)
  values
    (p_benef, p_financeur, p_formation_label, p_amount_cents, p_external_ref, p_valid_until,
     coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;

  -- Transmission : passe le devis à 'sent' + planifie la relance devis.
  if p_transmit then
    perform crm.transmit_quote(v_id);
  end if;

  return v_id;
end;
$$;

comment on function crm.create_quote is
  'Crée un devis (crm.quotes) et le transmet par défaut (statut sent + relance planifiée). Manuel ou automatisé.';
