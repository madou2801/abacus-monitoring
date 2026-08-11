"""Étape 2 — Normalisation et géocodage des adresses.

Pour chaque cessation sans adresse_normalisee, on appelle api-adresse data.gouv.fr.
On met à jour cessations_ae + on alimente etablissements_par_adresse.
"""
from __future__ import annotations

import asyncio
from typing import Any

from loguru import logger

from .. import db
from ..sources.adresse import AdresseClient


async def run(supabase_client) -> int:
    """Géocode toutes les cessations sans adresse_normalisee. Renvoie nb traités."""
    table = supabase_client.schema(db.SCHEMA).table("cessations_ae")
    res = (
        table.select("siret,adresse_brute,code_postal,commune,code_region")
        .is_("adresse_normalisee", "null")
        .execute()
    )
    rows = res.data or []
    if not rows:
        logger.info("Étape 2 : aucune adresse à normaliser")
        return 0

    logger.info("Étape 2 : géocodage de {} adresses", len(rows))
    sem = asyncio.Semaphore(20)
    timeline_payload: dict[str, dict[str, Any]] = {}
    updates: list[dict] = []

    async with AdresseClient() as adresse:
        async def normalize_one(row: dict) -> None:
            async with sem:
                addr = await adresse.normalize_or_fallback(
                    adresse_brute=row.get("adresse_brute") or "",
                    code_postal=row.get("code_postal") or "",
                    commune=row.get("commune") or "",
                )
                updates.append({
                    "siret":              row["siret"],
                    "adresse_normalisee": addr.key,
                    "lat":                addr.lat,
                    "lon":                addr.lon,
                })
                slot = timeline_payload.setdefault(addr.key, {
                    "adresse_normalisee": addr.key,
                    "lat":         addr.lat,
                    "lon":         addr.lon,
                    "commune":     row.get("commune"),
                    "departement": (row.get("code_region") or "")[:2] if False else None,
                    "code_region": row.get("code_region"),
                    "historique":  [],
                })
                slot["historique"].append({
                    "siret":         row["siret"],
                    "evenement":     "cessation",
                })

        await asyncio.gather(*(normalize_one(r) for r in rows))

    # UPDATEs ciblés (un seul UPSERT batché car on conserve le PK siret)
    for chunk in _chunk(updates, 500):
        table.upsert(chunk, on_conflict="siret").execute()

    db.upsert_etablissements_par_adresse(supabase_client, list(timeline_payload.values()))
    logger.info("Étape 2 : {} adresses normalisées, {} adresses uniques", len(updates), len(timeline_payload))
    return len(updates)


def _chunk(seq, size):
    for i in range(0, len(seq), size):
        yield seq[i:i + size]
