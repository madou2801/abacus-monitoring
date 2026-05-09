"""Tests scoring : valide les 5 cas du prompt + invariants de bornage."""
from __future__ import annotations

import pytest

from gaia_autoecoles.src.scoring import (
    score_reprise,
    score_opportunite_commerciale,
    score_fragilite,
    niveau_alerte,
    SignauxFaibles,
)


# -------------------------------------------------------------------------
# Reprise
# -------------------------------------------------------------------------
def test_score_reprise_ape_meme_secteur_court_delai_max():
    assert score_reprise(
        ape_repreneur="8553Z", delai_jours=38, meme_dirigeant=True
    ) == 100.0


def test_score_reprise_pondere_si_delai_long():
    s = score_reprise(ape_repreneur="8553Z", delai_jours=500, meme_dirigeant=False)
    assert 0 < s < 100


def test_score_reprise_zero_si_delai_invalide():
    assert score_reprise(ape_repreneur="8553Z", delai_jours=None, meme_dirigeant=True) == 0
    assert score_reprise(ape_repreneur="8553Z", delai_jours=-3, meme_dirigeant=True) == 0


def test_score_reprise_borne_a_100():
    s = score_reprise(ape_repreneur="8553Z", delai_jours=10, meme_dirigeant=True)
    assert s == 100.0


# -------------------------------------------------------------------------
# Opportunité commerciale (cas 1, 2 du prompt)
# -------------------------------------------------------------------------
def test_cas1_reprise_phenix_edof_gap():
    """Cas 1 : EDOF historique + repreneur HORS EDOF + APE 8553Z + même dirigeant + Qualiopi."""
    s = score_opportunite_commerciale(
        edof_historique=True,
        repreneur_sur_edof=False,
        ape_repreneur="8553Z",
        delai_jours=38,
        meme_dirigeant=True,
        qualiopi_historique=True,
    )
    # 40 (EDOF gap) + 30 (APE) + 20 (dirigeant) + 10 (Qualiopi) = 100
    assert s == 100.0


def test_cas2_local_vacant_pure_edof_gap():
    """Cas 2 : cessation EDOF, aucune reprise (=> ape repreneur fictif vide / délai None)."""
    s = score_opportunite_commerciale(
        edof_historique=True,
        repreneur_sur_edof=False,
        ape_repreneur="",
        delai_jours=None,
        meme_dirigeant=False,
        qualiopi_historique=False,
    )
    assert s == 40.0  # EDOF gap pur


def test_score_opportunite_repreneur_sur_edof_neutralise_le_gap():
    s = score_opportunite_commerciale(
        edof_historique=True,
        repreneur_sur_edof=True,   # ← le repreneur est déjà sur EDOF
        ape_repreneur="8553Z",
        delai_jours=60,
        meme_dirigeant=True,
        qualiopi_historique=True,
    )
    # plus de gap EDOF (-40), donc 30 + 20 + 10
    assert s == 60.0


# -------------------------------------------------------------------------
# Fragilité (cas 3, 4, 5 du prompt)
# -------------------------------------------------------------------------
def test_cas3_alerte_rouge_redressement_qualiopi_capitaux_negatifs():
    """Cas 3 : redressement + qualiopi perdu récent + cap. propres neg + effectifs -40% + EDOF -60% + retard."""
    s = SignauxFaibles(
        bodacc_procedure_collective=True,
        bodacc_type_procedure="redressement",
        qualiopi_perdu=True,
        qualiopi_perte_recente_90j=True,
        capitaux_propres_negatifs=True,
        effectifs_baisse_30pct_12m=True,
        edof_baisse_formations_6m=True,
        retard_depot_comptes=True,
    )
    score, contribs = score_fragilite(s)
    # 45 + 30 + 20 + 15 + 15 + 10 = 135 → plafonné 100
    assert score == 100.0
    assert niveau_alerte(score) == "rouge"
    codes = {c["code"] for c in contribs}
    assert "bodacc_redressement_sauvegarde" in codes
    assert "qualiopi_perdu_recent" in codes


def test_cas4_pre_phenix_orange():
    """Cas 4 : 3 changements dirigeants 24m + pré-phénix + EDOF baisse + dirigeant lié à 2 radiations."""
    s = SignauxFaibles(
        changement_dirigeant_12m=True,
        changements_dirigeant_24m=3,
        dirigeant_actuel_autres_radiations=2,
        immatriculation_recente_dirigeant_meme_adresse=True,
        edof_baisse_formations_6m=True,
    )
    score, contribs = score_fragilite(s)
    # 10 (chgt 24m) + 25 (pre-phenix) + 15 (dir lié rad) + 15 (EDOF baisse) = 65
    assert score == 65.0
    assert niveau_alerte(score) == "orange"
    assert any(c["code"] == "pre_phenix" for c in contribs)


def test_cas5_sain_vert():
    """Cas 5 : aucun signal."""
    score, contribs = score_fragilite(SignauxFaibles())
    assert score == 0.0
    assert contribs == []
    assert niveau_alerte(score) == "vert"


def test_score_fragilite_borne_haute():
    s = SignauxFaibles(
        bodacc_procedure_collective=True,
        bodacc_type_procedure="liquidation",  # +60
        qualiopi_perdu=True, qualiopi_perte_recente_90j=True,  # +30
        edof_disparition_60j=True,            # +25
        immatriculation_recente_dirigeant_meme_adresse=True,  # +25
        capitaux_propres_negatifs=True,       # +20
    )
    score, _ = score_fragilite(s)
    assert score == 100.0


def test_niveau_alerte_seuils():
    assert niveau_alerte(0)   == "vert"
    assert niveau_alerte(24)  == "vert"
    assert niveau_alerte(25)  == "jaune"
    assert niveau_alerte(49)  == "jaune"
    assert niveau_alerte(50)  == "orange"
    assert niveau_alerte(74)  == "orange"
    assert niveau_alerte(75)  == "rouge"
    assert niveau_alerte(100) == "rouge"


# Garantie : on ne double-compte pas qualiopi
def test_qualiopi_perdu_recent_exclut_perdu_legacy():
    s = SignauxFaibles(qualiopi_perdu=True, qualiopi_perte_recente_90j=True)
    score, contribs = score_fragilite(s)
    codes = [c["code"] for c in contribs]
    assert "qualiopi_perdu_recent" in codes
    assert "qualiopi_perdu" not in codes
    assert score == 30.0


# Garantie : edof_disparition_60j prime sur edof_baisse (pas de double compte)
def test_edof_disparition_exclut_baisse():
    s = SignauxFaibles(edof_disparition_60j=True, edof_baisse_formations_6m=True)
    score, contribs = score_fragilite(s)
    codes = [c["code"] for c in contribs]
    assert "edof_disparition_60j" in codes
    assert "edof_baisse_formations_6m" not in codes
    assert score == 25.0
