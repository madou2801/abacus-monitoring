"""Normalisation d'adresses : clé canonique stable pour matching cessation ↔ reprise.

Stratégie :
1. décomposer en (housenumber, street, postcode, city) via API Adresse data.gouv.fr
2. lowercase + strip accents + retirer ponctuation
3. clé = "{housenumber} {street}|{postcode}|{city}"
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass


_PUNCT_RE = re.compile(r"[^\w\s]", flags=re.UNICODE)
_WS_RE = re.compile(r"\s+")
_TYPE_VOIE = {
    "av": "avenue", "ave": "avenue", "av.": "avenue",
    "bd": "boulevard", "bld": "boulevard", "blvd": "boulevard",
    "r": "rue", "r.": "rue",
    "pl": "place", "pl.": "place",
    "imp": "impasse", "imp.": "impasse",
    "ch": "chemin", "all": "allee", "all.": "allee",
    "rte": "route", "rte.": "route",
    "fbg": "faubourg",
}


@dataclass(frozen=True)
class NormalizedAddress:
    housenumber: str
    street: str
    postcode: str
    city: str
    lat: float | None
    lon: float | None
    key: str


def _strip_accents(text: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", text)
        if unicodedata.category(c) != "Mn"
    )


def canonical_token(text: str) -> str:
    if not text:
        return ""
    text = _strip_accents(text).lower()
    text = _PUNCT_RE.sub(" ", text)
    text = _WS_RE.sub(" ", text).strip()
    return text


def expand_voie(street: str) -> str:
    if not street:
        return ""
    parts = street.split()
    if not parts:
        return ""
    head = parts[0].lower().rstrip(".")
    if head in _TYPE_VOIE:
        parts[0] = _TYPE_VOIE[head]
    return " ".join(parts)


def make_key(housenumber: str, street: str, postcode: str, city: str) -> str:
    """Clé canonique. Insensible casse/accents/ponctuation, type de voie expansé."""
    street = expand_voie(street or "")
    h = canonical_token(housenumber or "")
    s = canonical_token(street)
    p = canonical_token(postcode or "")
    c = canonical_token(city or "")
    voie = f"{h} {s}".strip()
    return f"{voie}|{p}|{c}"


def from_api_adresse_feature(feature: dict) -> NormalizedAddress:
    """Construit une adresse normalisée à partir d'une feature GeoJSON api-adresse."""
    props = feature.get("properties", {}) or {}
    geom = feature.get("geometry", {}) or {}
    coords = geom.get("coordinates") or [None, None]
    return NormalizedAddress(
        housenumber = str(props.get("housenumber", "") or ""),
        street      = str(props.get("street",     "") or props.get("name", "") or ""),
        postcode    = str(props.get("postcode",   "") or ""),
        city        = str(props.get("city",       "") or ""),
        lat         = coords[1] if len(coords) > 1 else None,
        lon         = coords[0] if len(coords) > 0 else None,
        key         = make_key(
            props.get("housenumber", ""),
            props.get("street", "") or props.get("name", ""),
            props.get("postcode", ""),
            props.get("city", ""),
        ),
    )


def from_brute(adresse_brute: str, code_postal: str = "", commune: str = "") -> NormalizedAddress:
    """Fallback quand l'API Adresse n'a pas répondu : on extrait au mieux."""
    parts = (adresse_brute or "").split()
    housenumber = ""
    if parts and parts[0].rstrip("bisterquaqua").isdigit():
        housenumber = parts.pop(0)
    street = " ".join(parts)
    return NormalizedAddress(
        housenumber=housenumber,
        street=street,
        postcode=code_postal,
        city=commune,
        lat=None,
        lon=None,
        key=make_key(housenumber, street, code_postal, commune),
    )
