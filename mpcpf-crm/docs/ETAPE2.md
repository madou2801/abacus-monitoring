# ÉTAPE 2 — mpcpf-crm (instance repo)

> Document directeur maître : `Downloads/passage-etape-2-document-de-travail.md`
> (à conserver hors dépôt). Ce fichier = l'instance **locale** pour ce repo :
> l'état des quatre chantiers et les spécificités mpcpf-crm.

## Les quatre chantiers — état

| Chantier | Objet | État mpcpf-crm |
|---|---|---|
| **C1** — Le contrat | `CLAUDE.md` : stack, conventions, zones interdites, définition de terminé | ✅ (section « Contrat de session — ÉTAPE 2 » dans `CLAUDE.md`) |
| **C2** — La commande unique | `npm run verify` tranche seul, exit 0/1 | ✅ `lint + lint:web + typecheck + typecheck:web + test + scan:secrets` |
| **C3** — Les bacs à sable | worktrees + `.claude/settings.json` allow/ask/deny | ✅ `.claude/settings.json` · worktrees : convention ci-dessous |
| **C4** — Le relecteur adversarial | session neuve, mandat « casser », sur le diff | ✅ prompt figé dans `docs/REVUE-ADVERSARIALE.md` |

## C2 — la commande

```bash
npm run verify
# = eslint (racine, --max-warnings=0)
#   next lint (web, --max-warnings=0)
#   tsc --noEmit (racine + web)
#   node --test (97 tests : unit + db + integration, PGlite)
#   scan:secrets (gitleaks si présent, repli node sinon)
```

Contrat : **exit 0 = sain**, exit ≠ 0 = échec franc. Aucun avertissement toléré.
À lancer par l'agent **avant toute présentation**.

## C3 — worktrees (convention)

```bash
# Un worktree par ticket : ../mpcpf-crm-wt/<ticket>
git worktree add ../mpcpf-crm-wt/T-XXX-titre -b feat/T-XXX
git worktree remove ../mpcpf-crm-wt/T-XXX-titre   # en fin de ticket
```

## Zones interdites (étape 1 — approbation manuelle)

- Écritures vers **EDOF / Wedof / Kairos** (effet réglementaire).
- **Facturation, paiement, montants** (`crm.invoices`, `crm.quotes`, Stripe).
- **RLS et rôles Supabase** (modification), migrations destructives (`DROP`/`TRUNCATE`/`ALTER … DROP COLUMN`).
- Secrets, `.env`, accès VPS.
- `ops/ygphyzky/sync_from_public.sql` (alimentation prod, non testée).

## Reste sur ce repo (post-C2, tickets spec-crm-tiers-payeur)

- Ticket 6 — supprimer le code mort (`portail/session-tarifs-devis`, dedup proposal, refs Brevo/Resend).
- Ticket 5 — sortir les briques hors-domaine (GSC, factory, prospection, audit-répondeur).
- V2 — brancher `intake-api` en prod (repli `sync_from_public`).
- V1 — `organization_id` + RLS + tests adversariaux (multi-locataire) — **bloquant produit**.
- V3 — dépôt propre sous ZYVARA + CI (gitleaks mode `git`/history en Action GitHub).
- Extraction `noyau/` + test de frontière mécanisé (0 terme métier dans `noyau/`).
