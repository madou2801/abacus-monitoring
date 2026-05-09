"""Client Qualiopi : dataset data.gouv.fr "Liste publique des organismes de formation".

Refresh quotidien. URL stable redirigée par data.gouv.fr.
"""
from __future__ import annotations

import csv
import io

import httpx
from loguru import logger


QUALIOPI_DATASET_URL = (
    "https://www.data.gouv.fr/fr/datasets/r/"
    # ID stable du dataset Liste publique des Organismes de Formation
    "0ee2ddec-0e23-4282-9ac8-b4e9c87ce58e"
)


class QualiopiClient:
    def __init__(self, url: str = QUALIOPI_DATASET_URL):
        self._url = url

    async def fetch_actifs_sirets(self) -> set[str]:
        """Renvoie l'ensemble des SIRET (ou SIREN) avec certification Qualiopi active."""
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
            r = await client.get(self._url, follow_redirects=True)
            r.raise_for_status()
            content = r.content.decode("utf-8", errors="ignore")

        sirets: set[str] = set()
        reader = csv.DictReader(io.StringIO(content), delimiter=";")
        for row in reader:
            siret = (row.get("siret") or row.get("SIRET") or "").strip()
            actif = (row.get("certifications_actives") or row.get("actif") or "1").strip().lower()
            if siret and actif in ("1", "true", "oui", "actif", ""):
                sirets.add(siret)
        logger.info("Qualiopi : {} SIRET actifs récupérés", len(sirets))
        return sirets
