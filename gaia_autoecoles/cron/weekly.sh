#!/usr/bin/env bash
# Cron hebdomadaire GAIA Auto-écoles France
# crontab : 0 4 * * 1  /opt/abacus-monitoring/gaia_autoecoles/cron/weekly.sh
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
    set -a; . .env; set +a
fi

LOG_DIR="logs"
mkdir -p "$LOG_DIR"
TS="$(date -u +%Y%m%dT%H%M%SZ)"

python3 -m gaia_autoecoles.gaia_autoecoles_fr --json-logs run-all \
    > "$LOG_DIR/run_${TS}.jsonl" \
    2> "$LOG_DIR/run_${TS}.err"

# Webhook n8n : alertes rouges + nouvelles reprises score > 70
if [ -n "${N8N_WEBHOOK_GAIA:-}" ]; then
    curl -fsS -X POST "$N8N_WEBHOOK_GAIA" \
        -H "Content-Type: application/json" \
        --data-binary "@$LOG_DIR/run_${TS}.jsonl" || true
fi

echo "GAIA Auto-écoles : run hebdo terminé ($TS)"
