"""Client Pappers API : dirigeants, jugements, comptes, ratios financiers.

Doc : https://api.pappers.fr/documentation
"""
from __future__ import annotations

import asyncio
from datetime import date

import httpx
from loguru import logger

from ..config import RATE_LIMIT_PAPPERS
from ._ratelimit import AsyncRateLimiter


PAPPERS_BASE = "https://api.pappers.fr/v2"


class PappersClient:
    def __init__(self, api_key: str):
        self._key = api_key
        self._client = httpx.AsyncClient(
            base_url=PAPPERS_BASE,
            timeout=httpx.Timeout(30.0),
        )
        self._limit = AsyncRateLimiter(RATE_LIMIT_PAPPERS, burst=4)

    async def __aenter__(self) -> "PappersClient":
        return self

    async def __aexit__(self, *exc) -> None:
        await self._client.aclose()

    async def _get(self, path: str, params: dict) -> dict:
        params = {"api_token": self._key, **params}
        await self._limit.acquire()
        for attempt in range(4):
            try:
                r = await self._client.get(path, params=params)
                if r.status_code == 404:
                    return {}
                if r.status_code == 429:
                    await asyncio.sleep(2 ** attempt)
                    continue
                r.raise_for_status()
                return r.json()
            except httpx.HTTPError as e:
                if attempt == 3:
                    logger.error("Pappers FAIL {}: {}", path, e)
                    return {}
                await asyncio.sleep(2 ** attempt)
        return {}

    async def entreprise(self, siren: str) -> dict:
        return await self._get("/entreprise", {"siren": siren})

    async def dirigeants(self, siren: str) -> list[dict]:
        data = await self.entreprise(siren)
        return data.get("representants", []) or []

    async def comptes(self, siren: str) -> list[dict]:
        data = await self._get("/entreprise/publications-bodacc", {"siren": siren})
        return data.get("comptes", []) or []

    async def procedures_collectives(self, siren: str) -> list[dict]:
        """Procédures collectives BODACC remontées par Pappers."""
        data = await self._get("/entreprise", {
            "siren": siren,
            "extrait_kbis": "false",
            "procedures_collectives": "true",
        })
        return data.get("procedures_collectives", []) or []

    async def autres_mandats_actifs(self, dirigeant_nom: str, dirigeant_prenom: str) -> list[dict]:
        """Cherche tous les mandats d'un dirigeant — utile pour pré-phénix."""
        data = await self._get("/recherche-dirigeants", {
            "nom": dirigeant_nom,
            "prenom": dirigeant_prenom,
            "par_page": 50,
        })
        return data.get("resultats", []) or []

    @staticmethod
    def is_capitaux_propres_negatifs(comptes: list[dict]) -> bool:
        if not comptes:
            return False
        latest = max(comptes, key=lambda c: c.get("date_cloture_exercice", ""))
        return (latest.get("capitaux_propres") or 0) < 0

    @staticmethod
    def has_retard_depot_comptes(comptes: list[dict], today: date | None = None) -> bool:
        if not comptes:
            return True
        latest = max(comptes, key=lambda c: c.get("date_cloture_exercice", ""))
        clos = latest.get("date_cloture_exercice")
        if not clos:
            return True
        clos_date = date.fromisoformat(clos[:10])
        today = today or date.today()
        return (today - clos_date).days > 365 + 180  # cloture + 6m de délai légal expiré
