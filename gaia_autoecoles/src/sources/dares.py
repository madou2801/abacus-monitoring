"""Client DARES / France Travail — effectifs salariés trimestriels par SIRET.

L'INSEE expose la tranche d'effectifs sur l'établissement directement via Sirene
(`trancheEffectifsEtablissement`). Ce module expose une API simple pour comparer
T0 vs T-12m et flagger les baisses ≥ 30%.
"""
from __future__ import annotations

# Mapping des tranches INSEE vers une borne basse en effectifs (proxy)
TRANCHES = {
    "NN": 0, "00": 0,  "01": 1, "02": 3, "03": 6, "11": 10,
    "12": 20, "21": 50, "22": 100, "31": 200, "32": 250,
    "41": 500, "42": 1000, "51": 2000, "52": 5000, "53": 10000,
}


def tranche_to_effectif(code: str | None) -> int | None:
    if not code:
        return None
    return TRANCHES.get(code)


def baisse_30pct(tranche_t0: str | None, tranche_t12m: str | None) -> bool:
    """True si la tranche actuelle représente une baisse ≥ 30% vs il y a 12 mois."""
    a = tranche_to_effectif(tranche_t0)
    b = tranche_to_effectif(tranche_t12m)
    if a is None or b is None or b == 0:
        return False
    return a <= b * 0.7
