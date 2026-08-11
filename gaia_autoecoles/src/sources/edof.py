"""Client EDOF / Mon Compte Formation : organismes actifs sur le permis B.

Stratégie :
1. Tentative API officielle CDC catalogue si disponible
2. Fallback scraping ciblé moncompteformation.gouv.fr (formacode 15410 / "Permis B")

Respect User-Agent + 1 req/s (RATE_LIMIT_EDOF).
"""
from __future__ import annotations

import asyncio

import httpx
from loguru import logger

from ..config import RATE_LIMIT_EDOF
from ._ratelimit import AsyncRateLimiter


EDOF_PUBLIC_API = "https://www.moncompteformation.gouv.fr/espace-prive/html/api/v1/recherche-formations"
FORMACODE_PERMIS_B = "15410"


class EdofClient:
    def __init__(self, user_agent: str):
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(45.0),
            headers={
                "User-Agent":     user_agent,
                "Accept":         "application/json",
                "Accept-Language": "fr-FR,fr;q=0.9",
            },
        )
        self._limit = AsyncRateLimiter(RATE_LIMIT_EDOF, burst=2)

    async def __aenter__(self) -> "EdofClient":
        return self

    async def __aexit__(self, *exc) -> None:
        await self._client.aclose()

    async def search_permis_b(self, page: int = 0, size: int = 50) -> dict:
        params = {
            "formacodes": FORMACODE_PERMIS_B,
            "page": page,
            "taillePage": size,
            "tri": "PERTINENCE",
        }
        await self._limit.acquire()
        for attempt in range(4):
            try:
                r = await self._client.get(EDOF_PUBLIC_API, params=params)
                if r.status_code == 429:
                    await asyncio.sleep(2 ** attempt)
                    continue
                r.raise_for_status()
                return r.json()
            except httpx.HTTPError as e:
                if attempt == 3:
                    logger.warning("EDOF page={} FAIL: {}", page, e)
                    return {"resultats": [], "totalElements": 0}
                await asyncio.sleep(2 ** attempt)
        return {"resultats": [], "totalElements": 0}

    async def iter_all_active(self):
        """Itère sur toutes les pages de formations Permis B actives."""
        page = 0
        size = 50
        while True:
            data = await self.search_permis_b(page=page, size=size)
            results = data.get("resultats") or data.get("formations") or []
            if not results:
                return
            for item in results:
                yield item
            total = data.get("totalElements") or data.get("total") or 0
            if (page + 1) * size >= int(total or 0):
                return
            page += 1

    @staticmethod
    def extract_siret(formation: dict) -> str | None:
        """Cherche le SIRET dans plusieurs champs possibles selon la version d'API."""
        for key in ("siret", "siretOrganismeFormation", "siretOf"):
            if formation.get(key):
                return str(formation[key]).strip()
        of = formation.get("organismeFormation") or formation.get("of") or {}
        return of.get("siret") if isinstance(of, dict) else None

    @staticmethod
    def aggregate_by_siret(formations: list[dict]) -> dict[str, dict]:
        """Regroupe les formations Permis B par SIRET avec stats agrégées."""
        agg: dict[str, dict] = {}
        for f in formations:
            siret = EdofClient.extract_siret(f)
            if not siret:
                continue
            slot = agg.setdefault(siret, {
                "siret": siret,
                "denomination": (f.get("organismeFormation") or {}).get("nom") or f.get("nomOrganisme"),
                "formations": [],
                "prix_min": None,
                "prix_max": None,
                "nombre_formations_actives": 0,
            })
            prix = f.get("prixTotalTtc") or f.get("prix") or 0
            try:
                prix = float(prix)
            except (TypeError, ValueError):
                prix = 0.0
            slot["formations"].append({
                "id":      f.get("id") or f.get("numeroFormation"),
                "intitule": f.get("intitule") or f.get("titre"),
                "prix":    prix,
            })
            slot["nombre_formations_actives"] += 1
            if prix > 0:
                slot["prix_min"] = prix if slot["prix_min"] is None else min(slot["prix_min"], prix)
                slot["prix_max"] = prix if slot["prix_max"] is None else max(slot["prix_max"], prix)
        return agg
