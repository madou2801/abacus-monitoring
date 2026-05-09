"""Pipeline GAIA Auto-écoles France — orchestrateur principal.

Usage :
    python gaia_autoecoles_fr.py run-all
    python gaia_autoecoles_fr.py step --num 1
    python gaia_autoecoles_fr.py export
    python gaia_autoecoles_fr.py status

Idempotent : on peut relancer n'importe quelle étape sans corruption.
Logs : JSON via loguru, métriques par région.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any

from loguru import logger

from .src import db, exports
from .src.config import Settings
from .src.pipeline import (
    step1_cessations,
    step2_normalize,
    step3_edof_snapshot,
    step4_reprises,
    step5_scoring_opportunites,
    step6_signaux_faibles,
)


def _setup_logger(json_logs: bool) -> None:
    logger.remove()
    if json_logs:
        logger.add(sys.stderr, serialize=True, level="INFO")
    else:
        logger.add(sys.stderr, level="INFO",
                   format="<green>{time:HH:mm:ss}</green> | <level>{level:8}</level> | {message}")


async def run_all(settings: Settings) -> dict[str, Any]:
    client = db.make_client(settings.supabase_url, settings.supabase_key)
    metrics: dict[str, Any] = {}
    logger.info("=== GAIA Auto-écoles FR : pipeline complet ===")

    metrics["step1_cessations"] = await step1_cessations.run(settings.insee_sirene_token, client)
    metrics["step2_normalize"]  = await step2_normalize.run(client)
    metrics["step3_edof"]       = await step3_edof_snapshot.run(settings.edof_user_agent, client)
    metrics["step4_reprises"]   = await step4_reprises.run(settings.insee_sirene_token, client)
    metrics["step5_scoring"]    = await step5_scoring_opportunites.run(settings.pappers_api_key, client)
    metrics["step6_signaux"]    = await step6_signaux_faibles.run(
        sirene_token=settings.insee_sirene_token,
        pappers_key=settings.pappers_api_key,
        bodacc_base=settings.bodacc_api_base,
        supabase_client=client,
    )

    logger.info("Pipeline terminé. Génération exports.")
    metrics["exports"] = exports.export_all(client)
    return metrics


async def run_step(settings: Settings, num: int) -> Any:
    client = db.make_client(settings.supabase_url, settings.supabase_key)
    table = {
        1: lambda: step1_cessations.run(settings.insee_sirene_token, client),
        2: lambda: step2_normalize.run(client),
        3: lambda: step3_edof_snapshot.run(settings.edof_user_agent, client),
        4: lambda: step4_reprises.run(settings.insee_sirene_token, client),
        5: lambda: step5_scoring_opportunites.run(settings.pappers_api_key, client),
        6: lambda: step6_signaux_faibles.run(
            sirene_token=settings.insee_sirene_token,
            pappers_key=settings.pappers_api_key,
            bodacc_base=settings.bodacc_api_base,
            supabase_client=client,
        ),
    }
    if num not in table:
        raise SystemExit(f"Étape inconnue : {num} (attendu 1..6)")
    return await table[num]()


def cmd_export(settings: Settings, out_dir: Path) -> dict:
    client = db.make_client(settings.supabase_url, settings.supabase_key)
    return exports.export_all(client, out_dir)


def cmd_status(settings: Settings) -> dict:
    client = db.make_client(settings.supabase_url, settings.supabase_key)
    s = lambda t: client.schema(db.SCHEMA).table(t).select("*", count="exact").limit(1).execute().count
    return {
        "cessations":      s("cessations_ae"),
        "reprises":        s("reprises_locaux"),
        "edof_actifs":     s("edof_autoecoles_actives"),
        "signaux_faibles": s("signaux_faibles_ae"),
    }


def main() -> int:
    parser = argparse.ArgumentParser(prog="gaia_autoecoles_fr")
    parser.add_argument("--json-logs", action="store_true")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("run-all", help="Exécute les 6 étapes + exports")
    p_step = sub.add_parser("step", help="Exécute une étape unique")
    p_step.add_argument("--num", type=int, required=True, choices=range(1, 7))
    p_exp = sub.add_parser("export", help="Génère les exports CSV")
    p_exp.add_argument("--out", type=Path, default=Path("exports"))
    sub.add_parser("status", help="Affiche les compteurs en base")

    args = parser.parse_args()
    _setup_logger(args.json_logs)
    settings = Settings.from_env()

    if args.cmd == "run-all":
        result = asyncio.run(run_all(settings))
    elif args.cmd == "step":
        result = asyncio.run(run_step(settings, args.num))
    elif args.cmd == "export":
        result = cmd_export(settings, args.out)
    elif args.cmd == "status":
        result = cmd_status(settings)
    else:
        parser.print_help()
        return 1

    print(json.dumps(result, indent=2, default=str, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
