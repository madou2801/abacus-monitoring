-- 0006_storage_and_rls.sql
-- Bucket de stockage des enregistrements + Row Level Security.
-- NB: les rôles anon/authenticated/service_role et le schéma storage
-- existent nativement sur Supabase. Le harness de test les crée en amont.

-- ---------------------------------------------------------------------------
-- Bucket privé pour les enregistrements d'appels Retell
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('call-recordings', 'call-recordings', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS : le schéma crm n'est accessible qu'au service_role (backend / edge
-- functions). Les clients anon/authenticated passent par des vues/API dédiées.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'beneficiaries','calls','transcripts','emails','wedof_events',
    'webhook_events','pipeline_transitions','follow_up_tasks'
  ]
  loop
    execute format('alter table crm.%I enable row level security', t);

    execute format($p$
      drop policy if exists %1$s_service_all on crm.%1$s
    $p$, t);

    execute format($p$
      create policy %1$s_service_all on crm.%1$s
        for all
        to service_role
        using (true)
        with check (true)
    $p$, t);
  end loop;
end;
$$;

-- Accès en lecture aux référentiels pour les rôles authentifiés (dashboards).
grant usage on schema crm to authenticated, service_role;
grant select on crm.pipeline_stages, crm.control_points, crm.follow_up_rules
  to authenticated, service_role;
grant select on crm.vw_beneficiary_overview, crm.vw_beneficiary_timeline,
                crm.vw_pipeline_metrics, crm.vw_funnel
  to authenticated, service_role;
