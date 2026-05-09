"""Configuration centrale : env vars, régions INSEE, rate limits, constantes."""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date


NAF_AUTOECOLE = "8553Z"
NAF_FORMATION_ADJACENT = {"8559A", "8559B", "8551Z"}
DENOMINATION_KEYWORDS = (
    "auto-école", "auto ecole", "auto-ecole", "autoecole",
    "ecole de conduite", "école de conduite",
    "conduite", "permis", "code de la route",
)

HISTORY_START = date(2020, 1, 1)


REGIONS_FR: dict[str, dict[str, str]] = {
    "11": {"libelle": "Île-de-France",             "type": "metropole"},
    "24": {"libelle": "Centre-Val de Loire",       "type": "metropole"},
    "27": {"libelle": "Bourgogne-Franche-Comté",   "type": "metropole"},
    "28": {"libelle": "Normandie",                  "type": "metropole"},
    "32": {"libelle": "Hauts-de-France",            "type": "metropole"},
    "44": {"libelle": "Grand Est",                  "type": "metropole"},
    "52": {"libelle": "Pays de la Loire",           "type": "metropole"},
    "53": {"libelle": "Bretagne",                   "type": "metropole"},
    "75": {"libelle": "Nouvelle-Aquitaine",         "type": "metropole"},
    "76": {"libelle": "Occitanie",                  "type": "metropole"},
    "84": {"libelle": "Auvergne-Rhône-Alpes",       "type": "metropole"},
    "93": {"libelle": "Provence-Alpes-Côte d'Azur", "type": "metropole"},
    "94": {"libelle": "Corse",                      "type": "metropole"},
    "01": {"libelle": "Guadeloupe",                 "type": "drom"},
    "02": {"libelle": "Martinique",                 "type": "drom"},
    "03": {"libelle": "Guyane",                     "type": "drom"},
    "04": {"libelle": "La Réunion",                 "type": "drom"},
    "06": {"libelle": "Mayotte",                    "type": "drom"},
}

# Rate limits (req/sec) — alignés sur le cahier des charges
RATE_LIMIT_SIRENE   = 0.5    # 30 req/min
RATE_LIMIT_PAPPERS  = 2.0    # plan standard
RATE_LIMIT_ADRESSE  = 50.0
RATE_LIMIT_EDOF     = 1.0
RATE_LIMIT_BODACC   = 5.0

MAX_PARALLEL_REGIONS = 4


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_key: str
    pappers_api_key: str
    insee_sirene_token: str
    edof_user_agent: str
    bodacc_api_base: str

    @classmethod
    def from_env(cls) -> "Settings":
        missing = [
            k for k in (
                "SUPABASE_URL_GAIA",
                "SUPABASE_SERVICE_KEY_GAIA",
                "INSEE_SIRENE_TOKEN",
            ) if not os.getenv(k)
        ]
        if missing:
            raise RuntimeError(f"Variables manquantes : {', '.join(missing)}")
        return cls(
            supabase_url       = os.environ["SUPABASE_URL_GAIA"],
            supabase_key       = os.environ["SUPABASE_SERVICE_KEY_GAIA"],
            pappers_api_key    = os.getenv("PAPPERS_API_KEY", ""),
            insee_sirene_token = os.environ["INSEE_SIRENE_TOKEN"],
            edof_user_agent    = os.getenv("EDOF_SCRAPER_USER_AGENT", "gaia-bot/0.1"),
            bodacc_api_base    = os.getenv(
                "BODACC_API_BASE",
                "https://bodacc-datadila.opendatasoft.com/api/records/1.0/search/",
            ),
        )


def libelle_region(code: str) -> str:
    return REGIONS_FR.get(code, {}).get("libelle", "")
