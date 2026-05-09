"""Tests normalisation adresses — invariants de matching cessation/reprise."""
from __future__ import annotations

from gaia_autoecoles.src.normalize import (
    canonical_token,
    expand_voie,
    make_key,
    from_brute,
    from_api_adresse_feature,
)


def test_canonical_token_strips_accents_punctuation_case():
    assert canonical_token("Île-de-France") == "ile de france"
    assert canonical_token("  Cours  Lafayette  ") == "cours lafayette"
    assert canonical_token("Av. du Prado") == "av du prado"


def test_expand_voie_normalizes_abbreviations():
    assert expand_voie("av. du Prado")     == "avenue du Prado"
    assert expand_voie("BD Voltaire")      == "boulevard Voltaire"
    assert expand_voie("Imp. des Lilas")   == "impasse des Lilas"
    assert expand_voie("rte de Paris")     == "route de Paris"


def test_make_key_is_stable_across_formatting_variations():
    a = make_key("12", "rue de la République", "77100", "Meaux")
    b = make_key("12", "Rue de la république",  "77100", "MEAUX")
    c = make_key("12", "rue de la republique",  "77100", "Meaux")
    assert a == b == c


def test_make_key_distinguishes_real_differences():
    a = make_key("12", "rue de la République", "77100", "Meaux")
    b = make_key("14", "rue de la République", "77100", "Meaux")  # numéro différent
    c = make_key("12", "rue de la République", "75011", "Paris")  # commune différente
    assert a != b and a != c


def test_from_brute_extracts_housenumber():
    addr = from_brute("12 rue de la République", "77100", "Meaux")
    assert addr.housenumber == "12"
    assert "republique" in addr.key
    assert "77100" in addr.key
    assert "meaux" in addr.key


def test_from_api_adresse_feature_geocodes():
    feature = {
        "geometry": {"coordinates": [2.879, 48.961]},
        "properties": {
            "housenumber": "12",
            "street": "rue de la République",
            "postcode": "77100",
            "city": "Meaux",
        },
    }
    addr = from_api_adresse_feature(feature)
    assert addr.lat == 48.961
    assert addr.lon == 2.879
    assert addr.key == make_key("12", "rue de la République", "77100", "Meaux")
