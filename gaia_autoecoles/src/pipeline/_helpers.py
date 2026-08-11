"""Helpers partagés entre étapes du pipeline."""
from __future__ import annotations

from typing import Any


def extract_etablissement_fields(e: dict) -> dict[str, Any]:
    """Aplatit un établissement Sirene V3 vers les champs cessations_ae."""
    unite = e.get("uniteLegale", {}) or {}
    adr = e.get("adresseEtablissement", {}) or {}
    periodes = e.get("periodesEtablissement") or []
    last = periodes[0] if periodes else {}

    siret = e.get("siret")
    siren = e.get("siren") or (siret[:9] if siret else None)
    denomination = (
        unite.get("denominationUniteLegale")
        or unite.get("nomUniteLegale")
        or unite.get("denominationUsuelle1UniteLegale")
    )
    enseigne = e.get("periodesEtablissement", [{}])[0].get("enseigne1Etablissement") if periodes else None

    adresse_brute = " ".join(filter(None, (
        str(adr.get("numeroVoieEtablissement") or ""),
        str(adr.get("indiceRepetitionEtablissement") or ""),
        str(adr.get("typeVoieEtablissement") or ""),
        str(adr.get("libelleVoieEtablissement") or ""),
    ))).strip()

    motif = last.get("changementEtatAdministratifEtablissement") or last.get("etatAdministratifEtablissement")

    return {
        "siret":          siret,
        "siren":          siren,
        "denomination":   denomination,
        "enseigne":       enseigne,
        "adresse_brute":  adresse_brute,
        "code_postal":    str(adr.get("codePostalEtablissement") or ""),
        "commune":        adr.get("libelleCommuneEtablissement"),
        "departement":    (str(adr.get("codeCommuneEtablissement") or "")[:2] or None),
        "code_region":    str(adr.get("codeRegionEtablissement") or "") or None,
        "date_creation":  e.get("dateCreationEtablissement"),
        "date_cessation": last.get("dateFin") if last.get("etatAdministratifEtablissement") == "C" else None,
        "motif_cessation": motif,
        "ape":            adr.get("activitePrincipaleEtablissement") or e.get("activitePrincipaleEtablissement"),
        "tranche_effectifs": e.get("trancheEffectifsEtablissement"),
    }


def denomination_match_autoecole(denomination: str | None) -> bool:
    if not denomination:
        return False
    d = denomination.lower()
    return any(kw in d for kw in (
        "auto-école", "auto ecole", "auto-ecole", "autoecole",
        "ecole de conduite", "école de conduite",
        "permis", "code de la route",
    ))
