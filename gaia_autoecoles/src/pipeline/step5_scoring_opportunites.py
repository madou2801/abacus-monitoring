"""Étape 5 — Scoring opportunités commerciales (PilotCPF).

Pour chaque reprise, on calcule :
  - score_reprise : qualité du match
  - score_opportunite_commerciale : 0-100, EDOF gap + APE + dirigeant + Qualiopi

Croisement Pappers pour `meme_dirigeant`, JOIN edof_autoecoles_actives pour `repreneur_sur_edof`.
"""
from __future__ import annotations

import asyncio

from loguru import logger

from .. import db
from ..scoring import score_opportunite_commerciale, score_reprise
from ..sources.pappers import PappersClient


async def _meme_dirigeant(pappers: PappersClient, siren_cesse: str, siren_repreneur: str) -> bool:
    if not siren_cesse or not siren_repreneur or siren_cesse == siren_repreneur:
        return siren_cesse == siren_repreneur
    a = await pappers.dirigeants(siren_cesse)
    b = await pappers.dirigeants(siren_repreneur)
    keys_a = {(d.get("nom"), d.get("prenom")) for d in a}
    keys_b = {(d.get("nom"), d.get("prenom")) for d in b}
    return bool(keys_a & keys_b - {(None, None)})


async def run(pappers_key: str, supabase_client) -> int:
    table_rep = supabase_client.schema(db.SCHEMA).table("reprises_locaux")
    table_ces = supabase_client.schema(db.SCHEMA).table("cessations_ae")

    reprises = (
        table_rep.select("*").execute().data or []
    )
    if not reprises:
        logger.info("Étape 5 : aucune reprise à scorer")
        return 0

    edof_sirets = db.select_edof_active_sirets(supabase_client)

    # Précharge les cessations correspondantes
    sirets_cesse = list({r["siret_cesse"] for r in reprises})
    cessations_idx: dict[str, dict] = {}
    for chunk in _chunk(sirets_cesse, 500):
        res = table_ces.select(
            "siret,siren,edof_historique,qualiopi_historique"
        ).in_("siret", chunk).execute()
        for c in (res.data or []):
            cessations_idx[c["siret"]] = c

    logger.info("Étape 5 : scoring de {} reprises", len(reprises))
    sem = asyncio.Semaphore(4)

    async with PappersClient(pappers_key) as pappers:
        async def score_one(r: dict) -> dict:
            async with sem:
                c = cessations_idx.get(r["siret_cesse"], {})
                siren_cesse = c.get("siren") or r["siret_cesse"][:9]
                siren_rep = (r.get("siret_repreneur") or "")[:9]
                meme = await _meme_dirigeant(pappers, siren_cesse, siren_rep)
                repreneur_sur_edof = r["siret_repreneur"] in edof_sirets

                sc_rep = score_reprise(
                    ape_repreneur=r.get("ape_repreneur") or "",
                    delai_jours=r.get("delai_jours"),
                    meme_dirigeant=meme,
                )
                sc_opp = score_opportunite_commerciale(
                    edof_historique=bool(c.get("edof_historique")),
                    repreneur_sur_edof=repreneur_sur_edof,
                    ape_repreneur=r.get("ape_repreneur") or "",
                    delai_jours=r.get("delai_jours"),
                    meme_dirigeant=meme,
                    qualiopi_historique=bool(c.get("qualiopi_historique")),
                )
                return {
                    "siret_cesse":                   r["siret_cesse"],
                    "siret_repreneur":               r["siret_repreneur"],
                    "meme_dirigeant":                meme,
                    "repreneur_sur_edof":            repreneur_sur_edof,
                    "score_reprise":                 sc_rep,
                    "score_opportunite_commerciale": sc_opp,
                }

        scored = await asyncio.gather(*(score_one(r) for r in reprises))

    n = db.upsert_reprises(supabase_client, scored)
    db.refresh_materialized_views(supabase_client)
    logger.info("Étape 5 terminée : {} reprises scorées", n)
    return n


def _chunk(seq, size):
    for i in range(0, len(seq), size):
        yield seq[i:i + size]
