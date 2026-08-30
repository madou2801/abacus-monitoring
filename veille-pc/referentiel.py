# -*- coding: utf-8 -*-
"""Référentiel partagé : codes NAF des 5 secteurs ciblés et grille de
transférabilité vers le Mali.

Utilisé par collecte_bodacc.py (filtrage) et genere_excel.py (restitution).
"""

# ---------------------------------------------------------------------------
# Codes NAF / APE (nomenclature NAF rév. 2, en vigueur jusqu'au 31/12/2025).
# ATTENTION : la NAF rév. 3 s'applique aux nouvelles immatriculations depuis
# 2026. Les libellés et codes ci-dessous doivent être remappés avant toute
# exploitation sur des jugements postérieurs — cf. README, section "Limites".
# ---------------------------------------------------------------------------
SECTEURS = {
    "Transport & logistique": {
        "codes": {
            "49.20Z": "Transports ferroviaires de fret",
            "49.41A": "Transports routiers de fret interurbains",
            "49.41B": "Transports routiers de fret de proximité",
            "49.41C": "Location de camions avec chauffeur",
            "49.42Z": "Services de déménagement",
            "50.40Z": "Transports fluviaux de fret",
            "52.10A": "Entreposage et stockage frigorifique",
            "52.10B": "Entreposage et stockage non frigorifique",
            "52.24A": "Manutention portuaire",
            "52.24B": "Manutention non portuaire",
            "52.29A": "Messagerie, fret express",
            "52.29B": "Affrètement et organisation des transports",
        },
        # Notes de référence 1-5 (5 = le plus favorable au transfert)
        "notes": [4, 5, 4, 5, 5, 4, 3],
    },
    "Fabrication de matériel électrique": {
        "codes": {
            "27.11Z": "Fabrication de moteurs, génératrices et transformateurs électriques",
            "27.12Z": "Fabrication de matériel de distribution et de commande électrique",
            "27.20Z": "Fabrication de piles et d'accumulateurs électriques",
            "27.31Z": "Fabrication de câbles de fibres optiques",
            "27.32Z": "Fabrication d'autres fils et câbles électroniques ou électriques",
            "27.33Z": "Fabrication de matériel d'installation électrique",
            "27.40Z": "Fabrication d'appareils d'éclairage électrique",
            "27.51Z": "Fabrication d'appareils électroménagers",
            "27.52Z": "Fabrication d'appareils ménagers non électriques",
            "27.90Z": "Fabrication d'autres matériels électriques",
        },
        "notes": [4, 3, 3, 4, 5, 3, 2],
    },
    "Fabrication de machines-outils": {
        "codes": {
            "25.62A": "Décolletage",
            "25.62B": "Mécanique industrielle",
            "28.25Z": "Fabrication d'équipements aérauliques et frigorifiques industriels",
            "28.29B": "Fabrication d'autres machines d'usage général",
            "28.41Z": "Fabrication de machines-outils pour le travail des métaux",
            "28.49Z": "Fabrication d'autres machines-outils",
            "28.99B": "Fabrication d'autres machines spécialisées",
        },
        "notes": [3, 2, 1, 3, 2, 4, 2],
    },
    "Transformation plastique": {
        "codes": {
            "22.21Z": "Fabrication de plaques, feuilles, tubes et profilés en matières plastiques",
            "22.22Z": "Fabrication d'emballages en matières plastiques",
            "22.23Z": "Fabrication d'éléments en matières plastiques pour la construction",
            "22.29A": "Fabrication de pièces techniques à base de matières plastiques",
            "22.29B": "Fabrication de produits de consommation courante en matières plastiques",
            "38.32Z": "Récupération de déchets triés (régénération de matières plastiques)",
        },
        "notes": [4, 2, 4, 4, 5, 4, 2],
    },
    "Fabrication de médicaments génériques": {
        "codes": {
            "21.10Z": "Fabrication de produits pharmaceutiques de base (principes actifs)",
            "21.20Z": "Fabrication de préparations pharmaceutiques (formes sèches, liquides)",
        },
        "notes": [3, 2, 1, 2, 5, 1, 2],
    },
}

# ---------------------------------------------------------------------------
# Grille multicritère de transférabilité vers le Mali.
# Chaque critère est noté de 1 à 5 ; 5 = configuration la plus favorable à un
# transfert d'activité. Les pondérations somment à 1.
# ---------------------------------------------------------------------------
CRITERES = [
    (
        "C1",
        "Intensité main-d'oeuvre",
        0.20,
        "Part du process reposant sur du travail manuel plutôt que sur de "
        "l'automatisation. Le Mali offre une main-d'oeuvre abondante et peu "
        "coûteuse ; un process automatisé n'y gagne rien.",
    ),
    (
        "C2",
        "Sobriété énergétique",
        0.20,
        "Le réseau d'EDM-SA subit des délestages fréquents et un coût du kWh "
        "élevé. Un process électro-intensif en continu (extrusion, four, HVAC "
        "de salle blanche) exige une centrale captive — surcoût majeur.",
    ),
    (
        "C3",
        "Simplicité technologique",
        0.15,
        "Niveau de qualification technique exigé par le process. Le vivier "
        "malien d'ingénieurs et de techniciens de maintenance industrielle "
        "reste étroit sur les métiers de précision.",
    ),
    (
        "C4",
        "Transportabilité des actifs",
        0.15,
        "Aptitude des équipements à être démontés, conteneurisés et remontés. "
        "Une presse à injecter se déplace ; une ligne intégrée coulée dans le "
        "génie civil, non.",
    ),
    (
        "C5",
        "Marché Mali / AES / UEMOA",
        0.15,
        "Demande locale et régionale adressable. Le Mali reste dans l'UEMOA "
        "(franc CFA) mais s'est retiré de la CEDEAO au profit de l'AES — le "
        "régime tarifaire applicable est à vérifier dossier par dossier.",
    ),
    (
        "C6",
        "Faiblesse des barrières réglementaires",
        0.10,
        "Certifications à retransférer : BPF/GMP et AMM en pharmacie, marquage "
        "CE et normes produit en matériel électrique. Une requalification de "
        "site pharmaceutique se compte en années.",
    ),
    (
        "C7",
        "Autonomie en intrants",
        0.05,
        "Dépendance aux matières importées. Le Mali est enclavé : tout intrant "
        "transite par les corridors Dakar, Abidjan, Lomé ou Conakry, avec le "
        "délai et le coût correspondants.",
    ),
]
