"""Étape 3 — Snapshot EDOF / Mon Compte Formation des auto-écoles actives Permis B.

UPSERT dans edof_autoecoles_actives + insert d'un snapshot daté pour calcul deltas.
Aussi : refresh du dataset Qualiopi pour comparaisons T0/T-90j.
"""
from __future__ import annotations

from datetime import date

from loguru import logger

from .. import db
from ..config import libelle_region
from ..sources.edof import EdofClient
from ..sources.qualiopi import QualiopiClient


async def run(edof_user_agent: str, supabase_client, qualiopi_sirets: set[str] | None = None) -> dict[str, int]:
    """Récupère toutes les formations Permis B actives et agrège par SIRET."""
    today = date.today().isoformat()

    formations: list[dict] = []
    async with EdofClient(edof_user_agent) as edof:
        async for f in edof.iter_all_active():
            formations.append(f)

    aggregated = EdofClient.aggregate_by_siret(formations)
    logger.info("EDOF : {} formations Permis B → {} OF distincts",
                len(formations), len(aggregated))

    if qualiopi_sirets is None:
        try:
            qualiopi_sirets = await QualiopiClient().fetch_actifs_sirets()
        except Exception as e:
            logger.warning("Qualiopi indisponible : {}", e)
            qualiopi_sirets = set()

    rows: list[dict] = []
    snapshots: list[dict] = []
    for siret, agg in aggregated.items():
        # On récupère code_region via le siret (5 premiers chiffres → not enough,
        # le code région doit venir de Sirene ou d'un join ultérieur).
        # Best effort : on stocke null si inconnu, l'étape 6 enrichira.
        rows.append({
            "siret":                     siret,
            "denomination":              agg.get("denomination"),
            "formations_permis_b":       agg["formations"],
            "prix_min_permis_b":         agg["prix_min"],
            "prix_max_permis_b":         agg["prix_max"],
            "nombre_formations_actives": agg["nombre_formations_actives"],
            "date_derniere_maj":         today,
            "statut_qualiopi":           siret in qualiopi_sirets,
        })
        snapshots.append({
            "siret":                     siret,
            "snapshot_date":             today,
            "nombre_formations_actives": agg["nombre_formations_actives"],
            "statut_qualiopi":           siret in qualiopi_sirets,
        })

    n = db.upsert_edof_actives(supabase_client, rows)
    db.insert_edof_snapshot(supabase_client, snapshots)

    # Snapshot Qualiopi global
    qualiopi_rows = [
        {"siret": s, "snapshot_date": today, "actif": True} for s in qualiopi_sirets
    ]
    db.insert_qualiopi_snapshot(supabase_client, qualiopi_rows)

    logger.info("Étape 3 terminée : {} OF EDOF + snapshot {}", n, today)
    return {"edof_of": n, "qualiopi_actifs": len(qualiopi_sirets)}
