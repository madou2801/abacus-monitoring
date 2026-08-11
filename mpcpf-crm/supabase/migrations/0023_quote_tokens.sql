-- 0023_quote_tokens.sql
-- Tokens de validation one-click des devis (lien dans l'email benef).
-- Le token EN CLAIR ne vit que dans l'URL envoyee ; le CRM ne stocke que son sha256.
-- Usage unique (used_at) + expiration 30 j. 100% additive.

create table if not exists crm.quote_tokens (
  id           uuid primary key default gen_random_uuid(),
  quote_id     uuid not null references crm.quotes(id) on delete cascade,
  token_sha256 text not null unique,
  expires_at   timestamptz not null,
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists idx_quote_tokens_sha256   on crm.quote_tokens (token_sha256);
create index if not exists idx_quote_tokens_quote_id on crm.quote_tokens (quote_id);

comment on table crm.quote_tokens is
  'Tokens de validation devis (one-click email). Seul le sha256 est stocke ; le token en clair vit uniquement dans l''URL envoyee au beneficiaire.';

alter table crm.quote_tokens enable row level security;
drop policy if exists quote_tokens_service_all on crm.quote_tokens;
create policy quote_tokens_service_all on crm.quote_tokens
  for all to service_role using (true) with check (true);

grant all on crm.quote_tokens to service_role;
grant select on crm.quote_tokens to authenticated;

-- Consommation ATOMIQUE (usage unique + non expire) -> renvoie quote_id + beneficiary_id.
-- Un double-clic ne declenche la validation qu'une seule fois (UPDATE conditionnel).
create or replace function crm.consume_quote_token(p_sha256 text)
returns table(quote_id uuid, beneficiary_id uuid)
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_qid uuid;
begin
  update crm.quote_tokens t
     set used_at = now()
   where t.token_sha256 = p_sha256
     and t.used_at is null
     and t.expires_at > now()
  returning t.quote_id into v_qid;

  if v_qid is null then
    return;
  end if;

  return query
    select q.id, q.beneficiary_id from crm.quotes q where q.id = v_qid;
end;
$$;

grant execute on function crm.consume_quote_token(text) to service_role;
