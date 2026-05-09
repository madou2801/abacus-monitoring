"""Client API Adresse data.gouv.fr : géocodage et normalisation."""
from __future__ import annotations

import asyncio

import httpx
from loguru import logger

from ..config import RATE_LIMIT_ADRESSE
from ..normalize import NormalizedAddress, from_api_adresse_feature, from_brute
from ._ratelimit import AsyncRateLimiter


ADRESSE_BASE = "https://api-adresse.data.gouv.fr"


class AdresseClient:
    def __init__(self):
        self._client = httpx.AsyncClient(base_url=ADRESSE_BASE, timeout=httpx.Timeout(20.0))
        self._limit = AsyncRateLimiter(RATE_LIMIT_ADRESSE, burst=20)

    async def __aenter__(self) -> "AdresseClient":
        return self

    async def __aexit__(self, *exc) -> None:
        await self._client.aclose()

    async def search(self, query: str, postcode: str = "", limit: int = 1) -> NormalizedAddress | None:
        """Géocode une adresse libre. Renvoie None si l'API ne propose rien."""
        if not query.strip():
            return None
        params = {"q": query, "limit": limit, "autocomplete": 0}
        if postcode:
            params["postcode"] = postcode
        await self._limit.acquire()
        for attempt in range(3):
            try:
                r = await self._client.get("/search/", params=params)
                if r.status_code == 429:
                    await asyncio.sleep(2 ** attempt)
                    continue
                r.raise_for_status()
                features = r.json().get("features", []) or []
                if not features:
                    return None
                top = features[0]
                if (top.get("properties", {}) or {}).get("score", 0) < 0.4:
                    return None
                return from_api_adresse_feature(top)
            except httpx.HTTPError as e:
                if attempt == 2:
                    logger.debug("api-adresse FAIL {!r}: {}", query, e)
                    return None
                await asyncio.sleep(2 ** attempt)
        return None

    async def normalize_or_fallback(
        self, *, adresse_brute: str, code_postal: str, commune: str
    ) -> NormalizedAddress:
        """Tente géocodage, fallback heuristique sur l'adresse brute si échec."""
        full = f"{adresse_brute}, {code_postal} {commune}".strip(", ")
        normalized = await self.search(full, postcode=code_postal)
        if normalized is not None:
            return normalized
        return from_brute(adresse_brute, code_postal, commune)
