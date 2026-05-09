"""Client Supabase fin : UPSERT idempotents par table, dans le schéma gaia_autoecoles_fr."""
from __future__ import annotations

from typing import Any, Iterable

from loguru import logger
from supabase import Client, create_client


SCHEMA = "gaia_autoecoles_fr"


def make_client(url: str, service_key: str) -> Client:
    return create_client(url, service_key)


def _table(client: Client, name: str):
    return client.schema(SCHEMA).table(name)


def upsert_cessations(client: Client, rows: Iterable[dict]) -> int:
    rows = list(rows)
    if not rows:
        return 0
    res = _table(client, "cessations_ae").upsert(rows, on_conflict="siret").execute()
    n = len(res.data or [])
    logger.info("UPSERT cessations_ae: {} lignes", n)
    return n


def upsert_reprises(client: Client, rows: Iterable[dict]) -> int:
    rows = list(rows)
    if not rows:
        return 0
    res = (
        _table(client, "reprises_locaux")
        .upsert(rows, on_conflict="siret_cesse,siret_repreneur")
        .execute()
    )
    n = len(res.data or [])
    logger.info("UPSERT reprises_locaux: {} lignes", n)
    return n


def upsert_etablissements_par_adresse(client: Client, rows: Iterable[dict]) -> int:
    rows = list(rows)
    if not rows:
        return 0
    res = (
        _table(client, "etablissements_par_adresse")
        .upsert(rows, on_conflict="adresse_normalisee")
        .execute()
    )
    return len(res.data or [])


def upsert_edof_actives(client: Client, rows: Iterable[dict]) -> int:
    rows = list(rows)
    if not rows:
        return 0
    res = _table(client, "edof_autoecoles_actives").upsert(rows, on_conflict="siret").execute()
    n = len(res.data or [])
    logger.info("UPSERT edof_autoecoles_actives: {} lignes", n)
    return n


def insert_edof_snapshot(client: Client, rows: Iterable[dict]) -> int:
    rows = list(rows)
    if not rows:
        return 0
    res = _table(client, "edof_snapshots").upsert(rows, on_conflict="siret,snapshot_date").execute()
    return len(res.data or [])


def insert_qualiopi_snapshot(client: Client, rows: Iterable[dict]) -> int:
    rows = list(rows)
    if not rows:
        return 0
    res = _table(client, "qualiopi_snapshots").upsert(rows, on_conflict="siret,snapshot_date").execute()
    return len(res.data or [])


def upsert_signaux_faibles(client: Client, rows: Iterable[dict]) -> int:
    rows = list(rows)
    if not rows:
        return 0
    res = _table(client, "signaux_faibles_ae").upsert(rows, on_conflict="siret").execute()
    n = len(res.data or [])
    logger.info("UPSERT signaux_faibles_ae: {} lignes", n)
    return n


def select_cessations_region(client: Client, code_region: str) -> list[dict]:
    res = _table(client, "cessations_ae").select("*").eq("code_region", code_region).execute()
    return res.data or []


def select_edof_active_sirets(client: Client) -> set[str]:
    res = _table(client, "edof_autoecoles_actives").select("siret").execute()
    return {row["siret"] for row in (res.data or []) if row.get("siret")}


def select_edof_snapshot_count(client: Client, siret: str, snapshot_date: str) -> int | None:
    res = (
        _table(client, "edof_snapshots")
        .select("nombre_formations_actives")
        .eq("siret", siret)
        .eq("snapshot_date", snapshot_date)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    return rows[0].get("nombre_formations_actives") if rows else None


def refresh_materialized_views(client: Client) -> None:
    client.rpc("refresh_opportunites_regionales").execute()
    logger.info("Vues régionales rafraîchies")


def select_active_autoecoles_region(client: Client, code_region: str) -> list[dict]:
    """Récupère les SIRET actifs de la région (depuis cessations OR edof actifs)."""
    res = _table(client, "edof_autoecoles_actives").select("*").eq("code_region", code_region).execute()
    return res.data or []
