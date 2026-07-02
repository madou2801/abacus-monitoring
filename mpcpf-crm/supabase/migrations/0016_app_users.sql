-- 0016_app_users.sql
-- Allowlist du personnel autorisé à accéder au super-CRM (les comptes bénéficiaires
-- Supabase Auth existants ne doivent PAS pouvoir entrer). Portable (crm.* only).

create table if not exists crm.app_users (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  full_name  text,
  role       text not null default 'staff',   -- staff | admin
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

insert into crm.app_users (email, full_name, role) values
  ('md@abacus-rh.com', 'Madou', 'admin')
on conflict (email) do update set role = excluded.role, active = true;

-- email autorisé (staff actif) ?
create or replace function crm.is_staff(p_email text)
returns boolean
language sql
stable
as $$
  select exists (select 1 from crm.app_users where lower(email) = lower(p_email) and active);
$$;

alter table crm.app_users enable row level security;
drop policy if exists app_users_service_all on crm.app_users;
create policy app_users_service_all on crm.app_users
  for all to service_role using (true) with check (true);

grant all on crm.app_users to service_role;
grant select on crm.app_users to authenticated;
