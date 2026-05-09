# GAIA Auto-écoles France — Brique Projet Gaïa

Pipeline d'enrichissement national : cessations d'auto-écoles (NAF 8553Z), reprises de locaux, croisement EDOF / Mon Compte Formation, et détection de signaux faibles sur les auto-écoles actives.

## Couverture

- **Périmètre** : France entière — 18 régions (13 métropole + 5 DROM)
- **Code NAF** : `8553Z` (Enseignement de la conduite)
- **Profondeur historique** : depuis 2020-01-01
- **Stockage** : Supabase `gaia-data-formation` (eu-west-2 Paris), schéma `gaia_autoecoles_fr`

## Pipeline (6 étapes idempotentes)

| # | Étape | Objet | Sortie |
|---|-------|------|--------|
| 1 | `step1_cessations` | Sirene V3, cessations 8553Z par région | `cessations_ae` |
| 2 | `step2_normalize`  | API Adresse data.gouv.fr — géocodage | `cessations_ae.adresse_normalisee`, `etablissements_par_adresse` |
| 3 | `step3_edof_snapshot` | Mon Compte Formation + Qualiopi | `edof_autoecoles_actives`, `edof_snapshots`, `qualiopi_snapshots` |
| 4 | `step4_reprises`   | Sirene : nouveaux SIRET au même code postal | `reprises_locaux` |
| 5 | `step5_scoring_opportunites` | Pappers + JOIN EDOF | `score_reprise`, `score_opportunite_commerciale` |
| 6 | `step6_signaux_faibles` | BODACC + Pappers + deltas EDOF/Qualiopi | `signaux_faibles_ae` |

Toutes les étapes sont idempotentes (UPSERT sur SIRET) et reprenables après panne.

## Scoring

### Score reprise (qualité du match)
- 100 si APE 8553Z + délai ≤ 180j
- Sinon pondéré : APE proche, délai, même dirigeant

### Score opportunité commerciale (PilotCPF / MonPermisCPF)
- +40 si EDOF historique ET repreneur HORS EDOF
- +30 si reprise APE 8553Z confirmée
- +20 si même dirigeant (continuité)
- +10 si Qualiopi historique

### Score fragilité (signaux faibles, 0-100 plafonné)

| Signal | Poids |
|--------|------:|
| BODACC liquidation judiciaire | +60 |
| BODACC redressement / sauvegarde | +45 |
| Qualiopi perdu < 90j | +30 |
| Disparition EDOF > 60j | +25 |
| Pré-phénix détecté | +25 |
| Capitaux propres négatifs | +20 |
| Effectifs -30% sur 12m | +15 |
| Baisse formations EDOF > 50% (6m) | +15 |
| Retard dépôt comptes | +10 |
| Changement dirigeant + radiations passées | +15 |
| 2+ changements dirigeants sur 24m | +10 |

Niveaux : `vert` (0-24) · `jaune` (25-49) · `orange` (50-74) · `rouge` (75-100).

## Installation

```bash
cd gaia_autoecoles
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # remplir les clés
```

## Migration SQL

```bash
psql "$DATABASE_URL" -f migrations/001_gaia_autoecoles_fr.sql
```

Crée le schéma `gaia_autoecoles_fr`, les 5 tables (+ 2 snapshots), 18 vues régionales matérialisées, et 6 vues métier.

## Utilisation

```bash
# Pipeline complet (6 étapes + exports)
python3 -m gaia_autoecoles.gaia_autoecoles_fr run-all

# Étape isolée
python3 -m gaia_autoecoles.gaia_autoecoles_fr step --num 6

# Exports CSV uniquement
python3 -m gaia_autoecoles.gaia_autoecoles_fr export --out exports/

# Compteurs base
python3 -m gaia_autoecoles.gaia_autoecoles_fr status
```

## Exports générés (`exports/{YYYYMMDD}/`)

- `reprises_{code_region}_{libelle}.csv` — 18 fichiers régionaux
- `reprises_france_consolide.csv` — vue nationale
- `top_opportunites_edof_par_region.csv` — top 50 / région, EDOF gap
- `signaux_faibles_{code_region}_{libelle}.csv` — par région, score décroissant
- `alertes_rouges_national.csv` — niveau_alerte = rouge, tous SIRET

## Vues Supabase utiles

| Vue | Usage |
|-----|-------|
| `vw_opportunites_commerciales_ae_fr` | Vue plate nationale |
| `vw_opportunites_par_region` | KPIs agrégés / région |
| `vw_opportunites_{code_region}` (×18, matérialisée) | Vue rapide / région |
| `vw_reprises_phenix` | Reprises avec même dirigeant + délai court |
| `vw_locaux_disponibles_edof` | Cessations EDOF sans reprise (opportunité immobilière) |
| `vw_signaux_faibles_orange_rouge` | Action commerciale prioritaire |
| `vw_pre_phenix_detection` | Dirigeants en transition (immatriculation récente) |
| `vw_dashboard_regional` | Tableau de bord 18 régions |

Refresh manuel des vues matérialisées : `select gaia_autoecoles_fr.refresh_opportunites_regionales();`

## Edge Function

```
GET /api/gaia/ae-fr/opportunites?region=11&min_score=60
GET /api/gaia/ae-fr/signaux?niveau=rouge&region=93
```

Voir `edge_function/index.ts` (Deno + Supabase JS).

## Cron hebdomadaire

```cron
0 4 * * 1  /opt/abacus-monitoring/gaia_autoecoles/cron/weekly.sh
```

Le script charge `.env`, lance le pipeline complet, et envoie les logs JSON au webhook n8n (`N8N_WEBHOOK_GAIA`) pour notifier des alertes rouges et reprises score > 70.

## Tests

```bash
pytest gaia_autoecoles/tests/ -v
```

Couvre :
- Normalisation adresse (stabilité de la clé sous variations de casse/accents/abréviations)
- Calcul des scores reprise/opportunité/fragilité (5 cas du prompt)
- Bornage des scores [0, 100] et seuils des niveaux d'alerte

## Contraintes opérationnelles

- **Rate limiting** : Sirene 30/min · Pappers 2/s · API Adresse 50/s · EDOF 1/s · BODACC 5/s
- **Parallélisation** : 4 régions simultanées max (étape 1 et 4)
- **Idempotence** : UPSERT sur SIRET, snapshots datés
- **RGPD** : noms de dirigeants stockés uniquement pour détection phénix/signaux ; RLS service_role only sur `cessations_ae`, `reprises_locaux`, `signaux_faibles_ae`
- **Logs** : JSON via loguru, métriques par région

## Architecture

```
gaia_autoecoles/
├── gaia_autoecoles_fr.py         # CLI orchestrateur
├── migrations/
│   └── 001_gaia_autoecoles_fr.sql
├── src/
│   ├── config.py                 # env, régions, rate limits
│   ├── normalize.py              # adresse → clé canonique
│   ├── scoring.py                # 3 fonctions de score (pures)
│   ├── db.py                     # client Supabase + UPSERT
│   ├── exports.py                # générateurs CSV
│   ├── sources/
│   │   ├── sirene.py             # INSEE V3
│   │   ├── pappers.py            # dirigeants/comptes
│   │   ├── bodacc.py             # procédures collectives
│   │   ├── adresse.py            # api-adresse data.gouv.fr
│   │   ├── qualiopi.py           # dataset CSV daily
│   │   ├── edof.py               # Mon Compte Formation
│   │   └── dares.py              # tranches d'effectifs
│   └── pipeline/
│       ├── step1_cessations.py
│       ├── step2_normalize.py
│       ├── step3_edof_snapshot.py
│       ├── step4_reprises.py
│       ├── step5_scoring_opportunites.py
│       └── step6_signaux_faibles.py
├── tests/
│   ├── test_normalize.py
│   └── test_scoring.py
├── edge_function/index.ts        # Supabase Edge Function
├── cron/weekly.sh
└── requirements.txt
```
