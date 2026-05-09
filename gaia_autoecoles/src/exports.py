"""Exports CSV : régionaux, national, EDOF prioritaires, signaux faibles, alertes rouges."""
from __future__ import annotations

import csv
from datetime import date
from pathlib import Path
from typing import Iterable

from loguru import logger

from . import db
from .config import REGIONS_FR


def _today_dir(base: Path) -> Path:
    d = base / date.today().strftime("%Y%m%d")
    d.mkdir(parents=True, exist_ok=True)
    return d


def _write_csv(path: Path, rows: Iterable[dict], fieldnames: list[str]) -> int:
    rows = list(rows)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    logger.info("Export {} ({} lignes)", path.name, len(rows))
    return len(rows)


def export_reprises_par_region(client, base: Path) -> dict[str, int]:
    out_dir = _today_dir(base)
    counts: dict[str, int] = {}
    fieldnames = [
        "siret_cesse", "denomination_cessee", "adresse_normalisee", "commune",
        "departement", "code_region", "libelle_region",
        "siret_repreneur", "denomination_repreneur", "ape_repreneur",
        "date_cessation", "delai_jours",
        "meme_dirigeant", "edof_historique", "repreneur_sur_edof",
        "score_reprise", "score_opportunite_commerciale", "bucket_priorite",
    ]
    table = client.schema(db.SCHEMA).from_("vw_opportunites_commerciales_ae_fr")
    for code, meta in REGIONS_FR.items():
        rows = table.select("*").eq("code_region", code).order(
            "score_opportunite_commerciale", desc=True
        ).execute().data or []
        slug = meta["libelle"].lower().replace(" ", "_").replace("'", "")
        path = out_dir / f"reprises_{code}_{slug}.csv"
        counts[code] = _write_csv(path, rows, fieldnames)
    return counts


def export_reprises_national(client, base: Path) -> int:
    out_dir = _today_dir(base)
    fieldnames = [
        "code_region", "libelle_region", "siret_cesse", "denomination_cessee",
        "siret_repreneur", "denomination_repreneur",
        "date_cessation", "delai_jours", "meme_dirigeant",
        "edof_historique", "repreneur_sur_edof",
        "score_reprise", "score_opportunite_commerciale", "bucket_priorite",
    ]
    rows = (
        client.schema(db.SCHEMA)
        .from_("vw_opportunites_commerciales_ae_fr")
        .select("*")
        .order("score_opportunite_commerciale", desc=True)
        .execute()
        .data or []
    )
    return _write_csv(out_dir / "reprises_france_consolide.csv", rows, fieldnames)


def export_top_opportunites_edof(client, base: Path, top_per_region: int = 50) -> int:
    out_dir = _today_dir(base)
    table = client.schema(db.SCHEMA).from_("vw_opportunites_commerciales_ae_fr")
    rows: list[dict] = []
    for code in REGIONS_FR:
        chunk = (
            table.select("*")
            .eq("code_region", code)
            .eq("edof_historique", True)
            .eq("repreneur_sur_edof", False)
            .order("score_opportunite_commerciale", desc=True)
            .limit(top_per_region)
            .execute()
            .data
            or []
        )
        rows.extend(chunk)
    fieldnames = [
        "code_region", "libelle_region", "siret_cesse", "denomination_cessee",
        "siret_repreneur", "denomination_repreneur",
        "score_opportunite_commerciale", "delai_jours", "meme_dirigeant",
    ]
    return _write_csv(out_dir / "top_opportunites_edof_par_region.csv", rows, fieldnames)


def export_signaux_faibles_par_region(client, base: Path) -> dict[str, int]:
    out_dir = _today_dir(base)
    fieldnames = [
        "siret", "denomination", "code_region", "libelle_region",
        "adresse_normalisee",
        "bodacc_procedure_collective", "bodacc_type_procedure",
        "qualiopi_perdu", "edof_disparition_60j", "edof_baisse_formations_6m",
        "capitaux_propres_negatifs", "retard_depot_comptes",
        "effectifs_baisse_30pct_12m", "changements_dirigeant_24m",
        "immatriculation_recente_dirigeant_meme_adresse",
        "score_fragilite", "niveau_alerte",
    ]
    counts: dict[str, int] = {}
    table = client.schema(db.SCHEMA).table("signaux_faibles_ae")
    for code, meta in REGIONS_FR.items():
        rows = (
            table.select("*").eq("code_region", code)
            .order("score_fragilite", desc=True).execute().data or []
        )
        slug = meta["libelle"].lower().replace(" ", "_").replace("'", "")
        path = out_dir / f"signaux_faibles_{code}_{slug}.csv"
        counts[code] = _write_csv(path, rows, fieldnames)
    return counts


def export_alertes_rouges_national(client, base: Path) -> int:
    out_dir = _today_dir(base)
    fieldnames = [
        "siret", "denomination", "code_region", "libelle_region",
        "adresse_normalisee",
        "bodacc_type_procedure", "qualiopi_perdu",
        "edof_disparition_60j", "capitaux_propres_negatifs",
        "score_fragilite", "niveau_alerte", "signaux_actifs",
    ]
    rows = (
        client.schema(db.SCHEMA).table("signaux_faibles_ae")
        .select("*").eq("niveau_alerte", "rouge")
        .order("score_fragilite", desc=True).execute().data or []
    )
    return _write_csv(out_dir / "alertes_rouges_national.csv", rows, fieldnames)


def export_all(client, base: Path = Path("exports")) -> dict[str, int | dict]:
    return {
        "reprises_regionales":    export_reprises_par_region(client, base),
        "reprises_national":      export_reprises_national(client, base),
        "top_opportunites_edof":  export_top_opportunites_edof(client, base),
        "signaux_faibles_region": export_signaux_faibles_par_region(client, base),
        "alertes_rouges":         export_alertes_rouges_national(client, base),
    }
