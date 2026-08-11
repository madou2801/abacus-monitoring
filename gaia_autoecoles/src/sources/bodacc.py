"""Client BODACC via opendatasoft : annonces de procédures collectives.

Endpoint open data : https://bodacc-datadila.opendatasoft.com/api/records/1.0/search/
Dataset : annonces-commerciales (depuis 2008)
"""
from __future__ import annotations

import asyncio
from datetime import date, timedelta

import httpx
from loguru import logger

from ..config import RATE_LIMIT_BODACC
from ._ratelimit import AsyncRateLimiter


PROCEDURES_KEYWORDS = (
    "liquidation judiciaire",
    "redressement judiciaire",
    "sauvegarde",
    "plan de continuation",
    "cessation",
    "dissolution",
    "radiation",
)


class BodaccClient:
    def __init__(self, base_url: str):
        self._base = base_url
        self._client = httpx.AsyncClient(timeout=httpx.Timeout(30.0))
        self._limit = AsyncRateLimiter(RATE_LIMIT_BODACC, burst=10)

    async def __aenter__(self) -> "BodaccClient":
        return self

    async def __aexit__(self, *exc) -> None:
        await self._client.aclose()

    async def search_siren(self, siren: str, since: date | None = None) -> list[dict]:
        """Annonces récentes pour un SIREN."""
        since = since or (date.today() - timedelta(days=730))  # 24 mois
        params = {
            "dataset": "annonces-commerciales",
            "q": f"registre:{siren}",
            "rows": 100,
            "sort": "-dateparution",
            "refine.dateparution": f">={since.isoformat()}",
        }
        await self._limit.acquire()
        for attempt in range(4):
            try:
                r = await self._client.get(self._base, params=params)
                if r.status_code == 429:
                    await asyncio.sleep(2 ** attempt)
                    continue
                r.raise_for_status()
                records = r.json().get("records", []) or []
                return [r.get("fields", {}) for r in records]
            except httpx.HTTPError as e:
                if attempt == 3:
                    logger.warning("BODACC FAIL siren={}: {}", siren, e)
                    return []
                await asyncio.sleep(2 ** attempt)
        return []

    @staticmethod
    def detect_procedure_collective(annonces: list[dict]) -> dict | None:
        """Retourne la procédure la plus grave et la plus récente, ou None."""
        gravite = {
            "liquidation judiciaire":   100,
            "redressement judiciaire":  80,
            "sauvegarde":               60,
            "plan de continuation":     30,
        }

        best: dict | None = None
        best_score = -1

        for a in annonces:
            blob = " ".join(
                str(a.get(k, "")).lower()
                for k in ("typeavis_lib", "famille", "publicationavis_facette",
                          "jugement", "modification", "depot")
            )
            for kw, weight in gravite.items():
                if kw in blob and weight > best_score:
                    best_score = weight
                    best = {
                        "type":  kw,
                        "date":  a.get("dateparution"),
                        "raw":   {k: a.get(k) for k in ("typeavis_lib", "jugement", "tribunal")},
                    }
                    break

        return best
