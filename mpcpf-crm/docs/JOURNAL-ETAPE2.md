# Journal ÉTAPE 2 — mpcpf-crm

> Une ligne par ticket délégué. **Colonne qui compte** : « interventions pendant »
> (tant qu'elle n'est pas à zéro sur 3 tickets consécutifs, le passage n'est pas acquis).

| Date | Ticket | Agents en // | Interventions pendant | Rapport de revue | Verdict |
|---|---|---|---|---|---|
| 2026-08-17 | V4 — lien CPF recréé + test de non-régression (`edof.test.ts`) | 1 | — | auto-revue | ✅ mergé `85c1599` |
| 2026-08-17 | C2 — commande `verify` (typecheck + test + scan) | 1 | — | auto-revue | ✅ mergé `a6efa0b` |
| 2026-08-17 | C2 — eslint (`--max-warnings=0`) + gitleaks dans `verify` | 1 | — | auto-revue | ✅ mergé `170c3d4` |
| 2026-08-18 | C1/C3/C4 — contrat + settings + relecteur + docs ÉTAPE2 | 1 | — | auto-revue | ✅ |

## Critères de sortie §7.1 — état mpcpf-crm

- [x] `CLAUDE.md` existe et contient les zones interdites
- [x] `verify` existe, échoue franchement, lancé avant présentation
- [~] Couverture ≥ 60 % sur les chemins critiques (97 tests ; couverture chiffrée non mesurée — pas de `--coverage` câblé)
- [x] Worktrees documentés + `.claude/settings.json` allow/ask/deny
- [~] Scan de secrets bloquant (gitleaks en local ; **manque** : CI + pré-commit)
- [ ] Prompt relecteur appliqué en session neuve sur les 3 dernières PR (fait en auto-revue, pas en session neuve dédiée)
- [ ] Deux tickets menés en parallèle sans intervention (worktrees en place, non encore exercé)
