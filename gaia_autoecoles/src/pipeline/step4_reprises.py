"""Étape 4 — Détection des reprises de locaux après cessation.

Pour chaque adresse de cessation, on requête Sirene sur les établissements
créés/actifs au même code postal après la date de cessation, et on filtre
par APE 8553Z OU APE proche {8559A, 8559B, 8551Z} OU dénomination matching auto-école.
"""
from __future__ import annotations

import asyncio
from datetime import date

from loguru import logger

from .. import db
from ..config import NAF_AUTOECOLE, NAF_FORMATION_ADJACENT
from ..sources.sirene import SireneClient
from ._helpers import denomination_match_autoecole, extract_etablissement_fields


async def detect_reprises_for_cessation(
    sirene: SireneClient, cessation: dict
) -> list[dict]:
    code_postal = cessation.get("code_postal") or ""
    date_cessation_s = cessation.get("date_cessation")
    if not code_postal or not date_cessation_s:
        return []
    date_cessation = date.fromisoformat(str(date_cessation_s)[:10])

    candidates: list[dict] = []
    async for e in sirene.search_etablissements(
        query=sirene.query_creations_apres(code_postal, date_cessation),
        date_debut=date_cessation,
    ):
        if e.get("siret") == cessation.get("siret"):
            continue
        flat = extract_etablissement_fields(e)
        ape = (flat.get("ape") or "").upper()
        denom = flat.get("denomination")
        match = (
            ape == NAF_AUTOECOLE
            or ape in NAF_FORMATION_ADJACENT
            or denomination_match_autoecole(denom)
        )
        if not match:
            continue
        # On compare l'adresse normalisée plus tard ; ici on garde le candidat
        date_creation = flat.get("date_creation")
        if not date_creation:
            continue
        delai = (date.fromisoformat(str(date_creation)[:10]) - date_cessation).days
        if delai < 0:
            continue
        candidates.append({
            "siret_cesse":                    cessation["siret"],
            "date_cessation":                 cessation["date_cessation"],
            "code_region_cesse":              cessation.get("code_region"),
            "siret_repreneur":                flat["siret"],
            "date_immatriculation_repreneur": date_creation,
            "ape_repreneur":                  ape,
            "denomination_repreneur":         denom,
            "delai_jours":                    delai,
            "_adresse_repreneur_brute":       flat.get("adresse_brute"),
            "_adresse_repreneur_cp":          flat.get("code_postal"),
            "_adresse_repreneur_commune":     flat.get("commune"),
        })
    return candidates


async def run(sirene_token: str, supabase_client) -> int:
    """Détecte les reprises pour toutes les cessations en base."""
    table = supabase_client.schema(db.SCHEMA).table("cessations_ae")
    res = (
        table.select(
            "siret,siren,date_cessation,code_region,adresse_normalisee,code_postal,commune"
        )
        .not_.is_("date_cessation", "null")
        .execute()
    )
    cessations = res.data or []
    logger.info("Étape 4 : analyse de {} cessations", len(cessations))

    sem = asyncio.Semaphore(8)
    all_reprises: list[dict] = []

    async with SireneClient(sirene_token) as sirene:
        async def worker(c: dict) -> None:
            async with sem:
                rep = await detect_reprises_for_cessation(sirene, c)
                # Filtrage adresse : on garde uniquement les reprises au même
                # code postal (proxy ; le matching d'adresse exact requiert step2 sur le repreneur)
                same_addr = [
                    r for r in rep
                    if r.get("_adresse_repreneur_cp") == c.get("code_postal")
                ]
                # On ajoute un champ adresse_normalisee = celle de la cessation
                # (le repreneur sera renormalisé hors-pipeline si besoin)
                for r in same_addr:
                    r["adresse_normalisee"] = c.get("adresse_normalisee")
                    r["ape_meme_secteur"] = r["ape_repreneur"] in {NAF_AUTOECOLE, *NAF_FORMATION_ADJACENT}
                    # Nettoyage des champs internes
                    for k in [k for k in r if k.startswith("_")]:
                        r.pop(k)
                all_reprises.extend(same_addr)

        await asyncio.gather(*(worker(c) for c in cessations))

    n = db.upsert_reprises(supabase_client, all_reprises)
    logger.info("Étape 4 terminée : {} reprises détectées", n)
    return n
