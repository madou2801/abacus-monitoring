"""Étape 1 — Extraction des cessations 8553Z par région.

Sirene API V3 : etatAdministratifEtablissement=C, depuis HISTORY_START.
Parallélisable : MAX_PARALLEL_REGIONS régions simultanées.
Idempotent : UPSERT sur (siret).
"""
from __future__ import annotations

import asyncio
from typing import Any

from loguru import logger

from .. import db
from ..config import REGIONS_FR, libelle_region
from ..sources.sirene import SireneClient
from ._helpers import extract_etablissement_fields


async def fetch_region_cessations(sirene: SireneClient, code_region: str) -> list[dict[str, Any]]:
    libelle = libelle_region(code_region)
    rows: list[dict] = []
    async for e in sirene.search_etablissements(query=sirene.query_cessations_region(code_region)):
        flat = extract_etablissement_fields(e)
        if not flat.get("siret") or not flat.get("date_cessation"):
            continue
        rows.append({
            "siret":              flat["siret"],
            "siren":              flat["siren"],
            "denomination":       flat["denomination"],
            "enseigne":           flat["enseigne"],
            "adresse_brute":      flat["adresse_brute"],
            "code_postal":        flat["code_postal"],
            "commune":            flat["commune"],
            "departement":        flat["departement"],
            "code_region":        code_region,
            "libelle_region":     libelle,
            "date_creation":      flat["date_creation"],
            "date_cessation":     flat["date_cessation"],
            "motif_cessation":    flat["motif_cessation"],
            "source_principale":  "sirene_v3",
        })
    logger.info("Région {} ({}) : {} cessations 8553Z", code_region, libelle, len(rows))
    return rows


async def run(sirene_token: str, supabase_client) -> dict[str, int]:
    """Lance l'étape 1 sur toutes les régions et UPSERT dans Supabase.

    Renvoie {code_region: nb_lignes_inserees}.
    """
    sem = asyncio.Semaphore(4)
    results: dict[str, int] = {}

    async with SireneClient(sirene_token) as sirene:
        async def worker(code_region: str) -> None:
            async with sem:
                rows = await fetch_region_cessations(sirene, code_region)
                results[code_region] = db.upsert_cessations(supabase_client, rows)

        await asyncio.gather(*(worker(cr) for cr in REGIONS_FR))

    total = sum(results.values())
    logger.info("Étape 1 terminée : {} cessations totales (18 régions)", total)
    return results
