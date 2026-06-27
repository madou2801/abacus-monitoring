# Intégration parcours bénéficiaire → `intake-api`

Client réutilisable (`intake-client.js`) + guide pour alimenter le CRM depuis les
surfaces de capture (formulaires site, appels Lucie, back-office).

> ⚠️ **Ne pas toucher `app.monpermiscpf.com`** (portail auto-écoles OTP, prod O2switch,
> = `portail-autoecole/index.html`). Ce n'est PAS la surface d'intake bénéficiaire.
> Le parcours `intake-api` (intake → éligibilité → pièces → devis) est **bénéficiaire**,
> destiné à `portail.monpermiscpf.com/dossier/{id}` (sous-domaine distinct, à créer).

## Contrat `intake-api`

`POST https://<projet>.supabase.co/functions/v1/intake-api`
Header `Authorization: Bearer <INTAKE_API_SECRET>` · corps JSON `{ action, ... }`.

| action | champs | effet |
|--------|--------|-------|
| `submit_intake` | `beneficiary{id\|email\|phone}`, `form_type`, `payload?`, `profile?` | crée/maj le dossier, avance le parcours |
| `submit_document` | `beneficiary_id`, `doc_type`, `bucket`, `path`, `bytes?` | rattache une pièce (déjà déposée dans Storage) |
| `send_quote` | `beneficiary_id`, `financeur`, `amount_cents?`, `formation_label?`, `contact?` | crée + transmet un devis, notifie |
| `decide_quote` | `beneficiary_id`, `quote_id`, `status` | décision financeur, avance le pipeline |
| `journey` | `beneficiary_id` | prochaine étape attendue |
| `create_invoice` | `beneficiary_id`, `financeur`, `amount_cents?`, ... | crée une facture (back-office) |
| `set_invoice_status` | `invoice_id`, `status`, `external_ref?` | avance la facture |

## Sécurité — où appeler depuis ?

`intake-api` exige le **secret de service**. **Ne jamais l'exposer dans un navigateur public.**
Trois intégrations possibles :

1. **Formulaires site → n8n → intake-api (RECOMMANDÉ).** Les formulaires existants
   (annuaire, contact, devis) POSTent déjà vers n8n. Ajouter un nœud *HTTP Request*
   qui appelle `intake-api` **côté serveur** (le secret reste dans n8n). Aucune page
   à exposer, aucune refonte front.
2. **Back-office** (équipe) : page interne authentifiée qui détient le secret →
   `create_invoice`, `set_invoice_status`, suivi parcours.
3. **Page bénéficiaire** `portail.monpermiscpf.com/dossier/{id}` : NE PAS embarquer le
   secret. Prévoir en **Phase 2** soit un **proxy** mince, soit un **token par-dossier**
   (signé, à scope limité) que `intake-api` validerait pour les actions bénéficiaires
   (`submit_intake`, `submit_document`, `decide_quote`, `journey`). À concevoir avec Madou.

## Exemple — nœud n8n (Function) côté serveur

```js
const { createIntakeClient } = require('./intake-client.js'); // ou inline
const crm = createIntakeClient({
  baseUrl: $env.INTAKE_API_URL,        // https://<projet>.supabase.co/functions/v1/intake-api
  token:   $env.INTAKE_API_SECRET,     // secret, reste côté n8n
});
const data = $json; // payload du formulaire
return await crm.submitIntake({
  beneficiary: { email: data.email, phone: data.telephone },
  form_type: 'intake',
  profile: { first_name: data.prenom, last_name: data.nom, financeur: data.financeur ?? null },
});
```

## Statut

- `intake-client.js` livré (ESM + CommonJS), prêt pour n8n / back-office.
- Branchement réel **en attente du déploiement `intake-api`** (Phase 2, projet Supabase
  staging) + décision Madou sur l'auth de la page bénéficiaire (proxy vs token par-dossier).
