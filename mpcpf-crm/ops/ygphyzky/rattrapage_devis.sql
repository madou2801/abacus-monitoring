-- ops/ygphyzky/rattrapage_devis.sql — SPÉCIFIQUE au projet ygphyzky.
-- Rattrapage PONCTUEL : crée un devis CRM pour les dossiers déjà en
-- 'attente_validation' AVANT la date-butoir du sync (le sync incrémental ne
-- traite que les nouveaux — cf. sync_from_public, étape 3). Ces devis
-- deviennent ainsi visibles et VALIDABLES en un clic dans le super-CRM
-- (fiche bénéficiaire → Devis → ✓ Valider).
--
-- Idempotent : ignore les dossiers ayant déjà un devis CRM. Rejouable.
-- p_transmit = true → statut 'sent' + relance devis planifiée ; AUCUN envoi
-- réel tant que process-relances tourne en QueueNotifier (secrets non posés).
--
-- Prérequis : migrations 0001..0022 + sync_from_public.sql appliqués.

do $$
declare
  d        record;
  v_count  int := 0;
begin
  for d in
    select db.id, db.type_financement, db.montant_total_ttc,
           db.intitule_formation, db.external_id
      from public.dossiers_bpc db
     where db.statut_parcours = 'attente_validation'
       and coalesce(lower(db.beneficiaire_email), '') not like '%example.com%'
       and coalesce(lower(db.beneficiaire_email), '') not like '%edof-test%'
       and exists (select 1 from crm.beneficiaries b where b.id = db.id)
       and not exists (select 1 from crm.quotes q where q.beneficiary_id = db.id)
  loop
    perform crm.create_quote(
      d.id,
      coalesce(case lower(coalesce(d.type_financement, ''))
        when 'cpf' then 'edof' when 'opco' then 'opco' when 'france_travail' then 'kairos'
        when 'ft' then 'kairos' when 'entreprise' then 'entreprise'
        when 'autofinancement' then 'autofinancement'
        else 'edof' end, 'edof'),
      nullif(d.montant_total_ttc, '')::numeric::int,
      nullif(d.intitule_formation, ''),
      d.external_id
    );
    v_count := v_count + 1;
  end loop;

  raise notice 'Rattrapage devis : % devis créé(s).', v_count;
end $$;

-- Contrôle : devis en attente de décision, avec le lien fiche CRM.
select q.beneficiary_id,
       b.first_name, b.last_name, b.email,
       q.financeur, q.amount_cents / 100.0 as montant_eur, q.status,
       'https://crm.monpermiscpf.com/beneficiaires/' || q.beneficiary_id as fiche_crm
  from crm.quotes q
  join crm.beneficiaries b on b.id = q.beneficiary_id
 where q.status in ('draft', 'sent')
 order by q.created_at desc;
