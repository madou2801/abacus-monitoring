"""Client INSEE Sirene API V3.

Doc : https://api.insee.fr/catalogue/site/themes/wso2/subthemes/insee/pages/item-info.jag?name=Sirene&version=V3.11
"""
from __future__ import annotations

from datetime import date
from typing import AsyncIterator, Iterable

import httpx
from loguru import logger

from ..config import HISTORY_START, NAF_AUTOECOLE, RATE_LIMIT_SIRENE
from ._ratelimit import AsyncRateLimiter


SIRENE_BASE = "https://api.insee.fr/entreprises/sirene/V3.11"


class SireneClient:
    def __init__(self, token: str):
        self._token = token
        self._client = httpx.AsyncClient(
            base_url=SIRENE_BASE,
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            timeout=httpx.Timeout(30.0),
        )
        self._limit = AsyncRateLimiter(RATE_LIMIT_SIRENE, burst=2)

    async def __aenter__(self) -> "SireneClient":
        return self

    async def __aexit__(self, *exc) -> None:
        await self._client.aclose()

    async def _get(self, path: str, params: dict) -> dict:
        await self._limit.acquire()
        for attempt in range(4):
            try:
                r = await self._client.get(path, params=params)
                if r.status_code == 429:
                    logger.warning("Sirene 429, backoff {}s", 2 ** attempt)
                    await asyncio.sleep(2 ** attempt)
                    continue
                r.raise_for_status()
                return r.json()
            except httpx.HTTPError as e:
                if attempt == 3:
                    raise
                logger.warning("Sirene retry {}: {}", attempt + 1, e)
        raise RuntimeError("unreachable")

    async def search_etablissements(
        self,
        *,
        query: str,
        date_debut: date = HISTORY_START,
        cursor: str = "*",
        nombre: int = 1000,
    ) -> AsyncIterator[dict]:
        """Itère sur tous les établissements correspondants via cursor pagination."""
        seen = 0
        while True:
            data = await self._get(
                "/siret",
                {
                    "q": query,
                    "date": date_debut.isoformat(),
                    "nombre": nombre,
                    "curseur": cursor,
                    "tri": "siren,nic",
                },
            )
            etabs = data.get("etablissements", []) or []
            for e in etabs:
                yield e
                seen += 1
            header = data.get("header", {}) or {}
            next_cursor = header.get("curseurSuivant")
            if not next_cursor or next_cursor == cursor or not etabs:
                logger.info("Sirene: {} étabs récupérés (q={!r})", seen, query[:60])
                return
            cursor = next_cursor

    def query_cessations_region(self, code_region: str) -> str:
        """Cessations 8553Z dans une région donnée depuis HISTORY_START."""
        return (
            f"activitePrincipaleEtablissement:{NAF_AUTOECOLE} "
            f"AND etatAdministratifEtablissement:C "
            f"AND codeRegionEtablissement:{code_region} "
            f"AND dateDernierTraitementEtablissement:[{HISTORY_START.isoformat()} TO *]"
        )

    def query_actifs_region(self, code_region: str) -> str:
        return (
            f"activitePrincipaleEtablissement:{NAF_AUTOECOLE} "
            f"AND etatAdministratifEtablissement:A "
            f"AND codeRegionEtablissement:{code_region}"
        )

    def query_creations_apres(self, code_postal: str, date_apres: date) -> str:
        """Établissements créés/actifs après une date à un code postal donné, tous APE."""
        return (
            f"codePostalEtablissement:{code_postal} "
            f"AND dateCreationEtablissement:[{date_apres.isoformat()} TO *]"
        )


# import differé pour éviter circular
import asyncio  # noqa: E402
