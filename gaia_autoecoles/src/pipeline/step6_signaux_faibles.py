"""Étape 6 — Détection des signaux faibles sur auto-écoles actives.

Population : SIRET 8553Z actifs (focus EDOF).
Sources cumulées : BODACC, Pappers (dirigeants/comptes), Qualiopi (delta T0/T-90),
EDOF (delta 6m / disparition 60j), Sirene (effectifs T0 vs T-12m).
"""
from __future__ import annotations

import asyncio
from datetime import date, timedelta

from loguru import logger

from .. import db
from ..config import libelle_region
from ..scoring import SignauxFaibles, niveau_alerte, score_fragilite
from ..sources.bodacc import BodaccClient
from ..sources.pappers import PappersClient
from ..sources.sirene import SireneClient


def _to_date(s: str | None) -> date | None:
    if not s:
        return None
    try:
        return date.fromisoformat(str(s)[:10])
    except ValueError:
        return None


async def collect_signals_for(
    siret: str,
    *,
    bodacc: BodaccClient,
    pappers: PappersClient,
    edof_t0: int | None,
    edof_t6m: int | None,
    edof_t60j_present: bool,
    qualiopi_t0: bool,
    qualiopi_t90j: bool,
) -> SignauxFaibles:
    siren = siret[:9]
    annonces = await bodacc.search_siren(siren)
    proc = BodaccClient.detect_procedure_collective(annonces)

    proc_date = _to_date(proc.get("date") if proc else None)
    today = date.today()

    sf = SignauxFaibles(
        bodacc_procedure_collective=proc is not None,
        bodacc_type_procedure=proc["type"] if proc else None,
        bodacc_jugement_recent_90j=bool(proc and proc_date and (today - proc_date).days <= 90),
        qualiopi_perdu=qualiopi_t90j and not qualiopi_t0,
        qualiopi_perte_recente_90j=qualiopi_t90j and not qualiopi_t0,
        edof_disparition_60j=(edof_t0 in (None, 0)) and not edof_t60j_present and edof_t6m,
        edof_baisse_formations_6m=(
            edof_t6m is not None and edof_t0 is not None
            and edof_t6m > 0 and edof_t0 < edof_t6m * 0.5
        ),
    )

    # Pappers : dirigeants / comptes
    dirigeants = await pappers.dirigeants(siren)
    if dirigeants:
        # date de prise de fonction
        dates = [
            _to_date(d.get("date_prise_de_poste") or d.get("date_de_prise_de_poste"))
            for d in dirigeants
        ]
        dates = [d for d in dates if d]
        sf.changement_dirigeant_12m = any((today - d).days <= 365 for d in dates)
        sf.changements_dirigeant_24m = sum(1 for d in dates if (today - d).days <= 730)

        # dirigeant actuel : nb de SIREN dont il a été représentant et qui sont radiés
        actuel = next(
            (d for d in dirigeants if (d.get("date_fin_de_poste") in (None, "")) ),
            dirigeants[0],
        )
        nom = actuel.get("nom")
        prenom = actuel.get("prenom")
        if nom and prenom:
            mandats = await pappers.autres_mandats_actifs(nom, prenom)
            sf.dirigeant_actuel_autres_radiations = sum(
                1 for m in mandats
                if (m.get("entreprise_cessee") is True or m.get("statut") == "radiée")
            )

    comptes = await pappers.comptes(siren)
    sf.capitaux_propres_negatifs = PappersClient.is_capitaux_propres_negatifs(comptes)
    sf.retard_depot_comptes = PappersClient.has_retard_depot_comptes(comptes, today=today)

    return sf


async def run(
    *, sirene_token: str, pappers_key: str, bodacc_base: str, supabase_client
) -> int:
    """Calcule les signaux faibles pour tous les SIRET EDOF actifs (focus opérationnel)."""
    today = date.today()
    t90 = (today - timedelta(days=90)).isoformat()
    t180 = (today - timedelta(days=180)).isoformat()
    t60 = (today - timedelta(days=60)).isoformat()

    # On scanne tous les EDOF actifs
    edof_table = supabase_client.schema(db.SCHEMA).table("edof_autoecoles_actives")
    edof_rows = edof_table.select(
        "siret,denomination,code_region,libelle_region,adresse_normalisee,nombre_formations_actives"
    ).execute().data or []

    if not edof_rows:
        logger.info("Étape 6 : aucun OF EDOF actif en base")
        return 0

    logger.info("Étape 6 : analyse signaux faibles pour {} OF EDOF", len(edof_rows))

    # Précharge snapshots Qualiopi T0/T-90j
    qualiopi_table = supabase_client.schema(db.SCHEMA).table("qualiopi_snapshots")
    snap_t0 = qualiopi_table.select("siret").gte("snapshot_date", today.isoformat()).execute()
    qualiopi_t0_set = {r["siret"] for r in (snap_t0.data or [])}
    snap_t90 = (
        qualiopi_table.select("siret")
        .gte("snapshot_date", t90)
        .lt("snapshot_date", today.isoformat())
        .execute()
    )
    qualiopi_t90_set = {r["siret"] for r in (snap_t90.data or [])}

    # EDOF t-180j (proxy 6m) et t-60j
    edof_snap_table = supabase_client.schema(db.SCHEMA).table("edof_snapshots")

    sem = asyncio.Semaphore(4)
    out: list[dict] = []

    async with (
        BodaccClient(bodacc_base) as bodacc,
        PappersClient(pappers_key) as pappers,
    ):
        async def worker(row: dict) -> None:
            async with sem:
                siret = row["siret"]
                # Snapshots EDOF passés
                snap6 = edof_snap_table.select("nombre_formations_actives").eq(
                    "siret", siret
                ).lte("snapshot_date", t180).order("snapshot_date", desc=True).limit(1).execute()
                edof_t6m = (snap6.data or [{}])[0].get("nombre_formations_actives")
                snap60 = edof_snap_table.select("nombre_formations_actives").eq(
                    "siret", siret
                ).gte("snapshot_date", t60).limit(1).execute()
                edof_t60j_present = bool(snap60.data)

                sf = await collect_signals_for(
                    siret,
                    bodacc=bodacc,
                    pappers=pappers,
                    edof_t0=row.get("nombre_formations_actives"),
                    edof_t6m=edof_t6m,
                    edof_t60j_present=edof_t60j_present,
                    qualiopi_t0=siret in qualiopi_t0_set,
                    qualiopi_t90j=siret in qualiopi_t90_set,
                )

                score, contribs = score_fragilite(sf)
                niveau = niveau_alerte(score)

                out.append({
                    "siret":                                      siret,
                    "denomination":                               row.get("denomination"),
                    "code_region":                                row.get("code_region"),
                    "libelle_region":                             row.get("libelle_region") or libelle_region(row.get("code_region") or ""),
                    "adresse_normalisee":                         row.get("adresse_normalisee"),
                    "bodacc_procedure_collective":                sf.bodacc_procedure_collective,
                    "bodacc_type_procedure":                      sf.bodacc_type_procedure,
                    "bodacc_jugement_recent_90j":                 sf.bodacc_jugement_recent_90j,
                    "changement_dirigeant_12m":                   sf.changement_dirigeant_12m,
                    "changements_dirigeant_24m":                  sf.changements_dirigeant_24m,
                    "dirigeant_actuel_autres_radiations":         sf.dirigeant_actuel_autres_radiations,
                    "qualiopi_perdu":                             sf.qualiopi_perdu,
                    "edof_baisse_formations_6m":                  sf.edof_baisse_formations_6m,
                    "edof_disparition_60j":                       sf.edof_disparition_60j,
                    "effectifs_baisse_30pct_12m":                 sf.effectifs_baisse_30pct_12m,
                    "retard_depot_comptes":                       sf.retard_depot_comptes,
                    "capitaux_propres_negatifs":                  sf.capitaux_propres_negatifs,
                    "immatriculation_recente_dirigeant_meme_adresse":
                        sf.immatriculation_recente_dirigeant_meme_adresse,
                    "score_fragilite":                            score,
                    "niveau_alerte":                              niveau,
                    "signaux_actifs":                             contribs,
                })

        await asyncio.gather(*(worker(r) for r in edof_rows))

    n = db.upsert_signaux_faibles(supabase_client, out)
    logger.info(
        "Étape 6 terminée : {} signaux faibles analysés ({} rouges, {} oranges)",
        n,
        sum(1 for r in out if r["niveau_alerte"] == "rouge"),
        sum(1 for r in out if r["niveau_alerte"] == "orange"),
    )
    return n
