"""Scoring : reprise, opportunité commerciale, fragilité (signaux faibles).

Toutes les fonctions sont pures, déterministes et plafonnées dans [0, 100].
Calibration alignée sur le cahier des charges Projet Gaïa.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


# -------------------------------------------------------------------------
# 1. Score de reprise (qualité du match cessation ↔ nouvelle immatriculation)
# -------------------------------------------------------------------------
def score_reprise(
    *,
    ape_repreneur: str,
    delai_jours: int | None,
    meme_dirigeant: bool,
    denomination_match: bool = False,
) -> float:
    """100 si APE 8553Z + délai < 180j ; pondéré sinon."""
    if delai_jours is None or delai_jours < 0:
        return 0.0

    if ape_repreneur == "8553Z" and delai_jours <= 180:
        return 100.0

    score = 0.0
    if ape_repreneur == "8553Z":
        score += 60
    elif ape_repreneur in {"8559A", "8559B", "8551Z"}:
        score += 35
    elif denomination_match:
        score += 25

    if delai_jours <= 90:
        score += 25
    elif delai_jours <= 180:
        score += 15
    elif delai_jours <= 365:
        score += 5

    if meme_dirigeant:
        score += 15

    return min(score, 100.0)


# -------------------------------------------------------------------------
# 2. Score opportunité commerciale (PilotCPF / MonPermisCPF)
# -------------------------------------------------------------------------
def score_opportunite_commerciale(
    *,
    edof_historique: bool,
    repreneur_sur_edof: bool,
    ape_repreneur: str,
    delai_jours: int | None,
    meme_dirigeant: bool,
    qualiopi_historique: bool,
) -> float:
    """+40 EDOF gap / +30 APE repris / +20 même dirigeant / +10 Qualiopi."""
    score = 0.0

    if edof_historique and not repreneur_sur_edof:
        score += 40

    if ape_repreneur == "8553Z" and (delai_jours or 9_999) <= 365:
        score += 30
    elif ape_repreneur in {"8559A", "8559B", "8551Z"}:
        score += 15

    if meme_dirigeant:
        score += 20

    if qualiopi_historique:
        score += 10

    return min(score, 100.0)


# -------------------------------------------------------------------------
# 3. Score de fragilité (signaux faibles)
# -------------------------------------------------------------------------
@dataclass
class SignauxFaibles:
    bodacc_procedure_collective: bool = False
    bodacc_type_procedure: str | None = None  # liquidation|redressement|sauvegarde|plan_continuation
    bodacc_jugement_recent_90j: bool = False
    qualiopi_perdu: bool = False
    qualiopi_perte_recente_90j: bool = False
    edof_baisse_formations_6m: bool = False
    edof_disparition_60j: bool = False
    effectifs_baisse_30pct_12m: bool = False
    retard_depot_comptes: bool = False
    capitaux_propres_negatifs: bool = False
    changement_dirigeant_12m: bool = False
    changements_dirigeant_24m: int = 0
    dirigeant_actuel_autres_radiations: int = 0
    immatriculation_recente_dirigeant_meme_adresse: bool = False  # pré-phénix


def score_fragilite(s: SignauxFaibles) -> tuple[float, list[dict[str, Any]]]:
    """Retourne (score 0-100 plafonné, liste des contributions actives)."""
    contribs: list[dict[str, Any]] = []

    def add(weight: int, code: str, label: str, condition: bool, **extra: Any) -> None:
        if condition:
            contribs.append({"code": code, "label": label, "poids": weight, **extra})

    # juridique
    if s.bodacc_procedure_collective:
        proc = (s.bodacc_type_procedure or "").lower()
        if "liquidation" in proc:
            add(60, "bodacc_liquidation", "BODACC liquidation judiciaire", True)
        elif "redressement" in proc or "sauvegarde" in proc:
            add(45, "bodacc_redressement_sauvegarde",
                f"BODACC {proc or 'redressement/sauvegarde'}", True)
        elif "plan" in proc:
            add(20, "bodacc_plan_continuation", "BODACC plan de continuation", True)
        else:
            add(30, "bodacc_procedure_autre", "BODACC procédure collective", True)

    # qualité
    add(30, "qualiopi_perdu_recent",
        "Qualiopi perdu < 90j", s.qualiopi_perdu and s.qualiopi_perte_recente_90j)
    if s.qualiopi_perdu and not s.qualiopi_perte_recente_90j:
        add(15, "qualiopi_perdu", "Qualiopi perdu", True)

    add(25, "edof_disparition_60j", "Disparition EDOF > 60j", s.edof_disparition_60j)
    add(15, "edof_baisse_formations_6m",
        "Baisse formations EDOF > 50% sur 6m", s.edof_baisse_formations_6m and not s.edof_disparition_60j)

    # économique
    add(20, "capitaux_propres_negatifs", "Capitaux propres négatifs", s.capitaux_propres_negatifs)
    add(15, "effectifs_baisse_30pct", "Effectifs -30% sur 12m", s.effectifs_baisse_30pct_12m)
    add(10, "retard_depot_comptes", "Retard dépôt comptes > 12m", s.retard_depot_comptes)

    # dirigeance
    if s.changement_dirigeant_12m and s.dirigeant_actuel_autres_radiations >= 1:
        add(15, "dirigeant_lie_radiations",
            "Changement dirigeant + dirigeant lié à radiations passées", True,
            radiations=s.dirigeant_actuel_autres_radiations)
    add(10, "changements_dirigeants_24m",
        "2+ changements dirigeants sur 24m", s.changements_dirigeant_24m >= 2,
        nb=s.changements_dirigeant_24m)

    # croisé : pré-phénix
    add(25, "pre_phenix",
        "Pré-phénix : nouvelle immatriculation dirigeant proche",
        s.immatriculation_recente_dirigeant_meme_adresse)

    score = sum(c["poids"] for c in contribs)
    return min(float(score), 100.0), contribs


def niveau_alerte(score: float) -> str:
    if score >= 75:
        return "rouge"
    if score >= 50:
        return "orange"
    if score >= 25:
        return "jaune"
    return "vert"
