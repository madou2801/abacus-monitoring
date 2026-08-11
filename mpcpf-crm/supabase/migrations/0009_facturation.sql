-- 0009_facturation.sql
-- Couche FACTURATION du parcours bénéficiaire MPCPF — « jusqu'à facturation ».
-- Orthogonale au pipeline commercial : chaque dossier peut porter une facture
-- avec un cycle de vie propre (à émettre → émise → transmise → payée → encaissée
-- / annulée), reliée au financeur et, le cas échéant, au devis accepté.
-- 100 % additive : n'altère aucune table ni fonction existante.

-- ---------------------------------------------------------------------------
-- Factures
-- ---------------------------------------------------------------------------
create table if not exists crm.invoices (
  id              uuid primary key default gen_random_uuid(),
  beneficiary_id  uuid not null references crm.beneficiaries(id) on delete cascade,
  quote_id        uuid references crm.quotes(id) on delete set null,
  financeur       text not null references crm.financeurs(code),
  channel         text not null,        -- wedof | france_travail | opco | facture_directe | stripe | manuel
  formation_label text,
  amount_cents    integer,
  currency        text not null default 'EUR',
  status          text not null default 'a_emettre',  -- a_emettre | emise | transmise | payee | encaissee | annulee
  external_ref    text,                 -- id facturation Wedof / Chorus Pro / PaymentIntent Stripe / n° AIF
  invoice_number  text,                 -- numéro de facture interne (optionnel)
  due_date        date,
  issued_at       timestamptz,
  transmitted_at  timestamptz,
  paid_at         timestamptz,
  settled_at      timestamptz,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_invoices_benef on crm.invoices (beneficiary_id);
create index if not exists idx_invoices_open
  on crm.invoices (status) where status in ('emise','transmise');

drop trigger if exists trg_invoices_updated_at on crm.invoices;
create trigger trg_invoices_updated_at
  before update on crm.invoices
  for each row execute function crm.set_updated_at();

-- Mapping financeur -> canal de facturation par défaut.
create or replace function crm._invoice_channel(p_financeur text)
returns text language sql immutable as $$
  select case p_financeur
    when 'edof'            then 'wedof'
    when 'kairos'          then 'france_travail'
    when 'opco'            then 'opco'
    when 'entreprise'      then 'facture_directe'
    when 'autofinancement' then 'stripe'
    else 'manuel'
  end;
$$;

-- ---------------------------------------------------------------------------
-- create_invoice : crée une facture « à émettre » (idempotent par dossier +
-- financeur tant qu'une facture non annulée existe). Renvoie l'id (créée ou
-- existante). Le canal est dérivé du financeur si non fourni.
-- ---------------------------------------------------------------------------
create or replace function crm.create_invoice(
  p_benef           uuid,
  p_financeur       text,
  p_amount_cents    integer default null,
  p_formation_label text default null,
  p_quote_id        uuid default null,
  p_external_ref    text default null,
  p_channel         text default null,
  p_due_days        integer default 30
)
returns uuid
language plpgsql
as $$
declare
  v_existing uuid;
  v_id       uuid;
begin
  select id into v_existing
    from crm.invoices
   where beneficiary_id = p_benef
     and financeur = p_financeur
     and status <> 'annulee'
   limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  insert into crm.invoices
    (beneficiary_id, quote_id, financeur, channel, formation_label, amount_cents,
     status, external_ref, due_date)
  values
    (p_benef, p_quote_id, p_financeur,
     coalesce(p_channel, crm._invoice_channel(p_financeur)),
     p_formation_label, p_amount_cents, 'a_emettre', p_external_ref,
     (current_date + make_interval(days => coalesce(p_due_days, 30)))::date)
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_invoice_status : avance une facture dans son cycle de vie.
-- Ordre nominal : a_emettre < emise < transmise < payee < encaissee.
-- 'annulee' autorisée depuis tout statut sauf 'encaissee'. Une facture
-- 'annulee' est terminale. Pose l'horodatage correspondant et planifie la
-- relance « facture impayée » à l'émission/transmission. Renvoie true si changé.
-- ---------------------------------------------------------------------------
create or replace function crm.set_invoice_status(
  p_invoice      uuid,
  p_status       text,
  p_external_ref text default null
)
returns boolean
language plpgsql
as $$
declare
  v_benef   uuid;
  v_from    text;
  v_rank    int;
  v_to_rank int;
  v_order   constant text[] := array['a_emettre','emise','transmise','payee','encaissee'];
begin
  select beneficiary_id, status into v_benef, v_from
    from crm.invoices where id = p_invoice for update;
  if not found then
    raise exception 'Facture % introuvable', p_invoice;
  end if;

  if p_status not in ('a_emettre','emise','transmise','payee','encaissee','annulee') then
    raise exception 'Statut facture "%" inconnu', p_status;
  end if;

  if p_status = v_from then
    return false;
  end if;

  if v_from = 'annulee' then
    return false;  -- facture annulée = terminal
  end if;

  if p_status = 'annulee' then
    if v_from = 'encaissee' then
      return false;  -- on n'annule pas une facture encaissée
    end if;
  else
    -- Pas de retour en arrière dans le cycle nominal.
    v_rank    := array_position(v_order, v_from);
    v_to_rank := array_position(v_order, p_status);
    if v_rank is not null and v_to_rank is not null and v_to_rank < v_rank then
      return false;
    end if;
  end if;

  update crm.invoices
     set status         = p_status,
         external_ref   = coalesce(p_external_ref, external_ref),
         issued_at      = case when p_status = 'emise'     then coalesce(issued_at, now())      else issued_at end,
         transmitted_at = case when p_status = 'transmise' then coalesce(transmitted_at, now()) else transmitted_at end,
         paid_at        = case when p_status = 'payee'     then coalesce(paid_at, now())        else paid_at end,
         settled_at     = case when p_status = 'encaissee' then coalesce(settled_at, now())     else settled_at end
   where id = p_invoice;

  if p_status in ('emise','transmise') then
    perform crm.schedule_follow_up(v_benef, 'relance_facture_impayee',
      jsonb_build_object('invoice_id', p_invoice));
  end if;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- detect_overdue_invoices_and_schedule : planifie une relance pour les factures
-- émises/transmises dont l'échéance est dépassée. Renvoie le nombre planifié.
-- À appeler par le cron (process-relances).
-- ---------------------------------------------------------------------------
create or replace function crm.detect_overdue_invoices_and_schedule()
returns integer
language plpgsql
as $$
declare
  v_count integer := 0;
  r record;
begin
  for r in
    select id, beneficiary_id
      from crm.invoices
     where status in ('emise','transmise')
       and due_date is not null
       and due_date < current_date
  loop
    if crm.schedule_follow_up(r.beneficiary_id, 'relance_facture_impayee',
         jsonb_build_object('invoice_id', r.id)) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Règle de relance « facture impayée »
-- ---------------------------------------------------------------------------
insert into crm.follow_up_rules
  (code, label, trigger_event, channel, delay_minutes, max_attempts, template_code, description) values
  ('relance_facture_impayee', 'Relance facture impayée', 'invoice_overdue', 'email', 10080, 3, 'tpl_invoice_reminder',
     'Relance par email lorsqu''une facture émise/transmise reste impayée (échéance dépassée).')
on conflict (code) do update
  set label = excluded.label, trigger_event = excluded.trigger_event, channel = excluded.channel,
      delay_minutes = excluded.delay_minutes, max_attempts = excluded.max_attempts,
      template_code = excluded.template_code, description = excluded.description;

-- ---------------------------------------------------------------------------
-- Vues facturation
-- ---------------------------------------------------------------------------
create or replace view crm.vw_facturation as
select
  i.id,
  i.beneficiary_id,
  b.first_name,
  b.last_name,
  b.email,
  b.pipeline_stage,
  i.financeur,
  i.channel,
  i.formation_label,
  i.amount_cents,
  i.currency,
  i.status,
  i.external_ref,
  i.invoice_number,
  i.due_date,
  i.issued_at,
  i.transmitted_at,
  i.paid_at,
  i.settled_at,
  case
    when i.status in ('emise','transmise')
         and i.due_date is not null and i.due_date < current_date
      then (current_date - i.due_date)
    else 0
  end as days_overdue,
  i.created_at
from crm.invoices i
join crm.beneficiaries b on b.id = i.beneficiary_id;

create or replace view crm.vw_facturation_funnel as
select
  s.status,
  s.rank,
  count(i.id)::int                          as count,
  coalesce(sum(i.amount_cents), 0)::bigint  as total_cents
from (values
  ('a_emettre', 1), ('emise', 2), ('transmise', 3),
  ('payee', 4), ('encaissee', 5), ('annulee', 6)
) as s(status, rank)
left join crm.invoices i on i.status = s.status
group by s.status, s.rank
order by s.rank;

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table crm.invoices enable row level security;
drop policy if exists invoices_service_all on crm.invoices;
create policy invoices_service_all on crm.invoices
  for all to service_role using (true) with check (true);

grant select on crm.vw_facturation, crm.vw_facturation_funnel to authenticated, service_role;
