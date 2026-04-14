#!/bin/bash
# Health Check — VPS Services & Domains
# Exécuté par les agents Claude Code distants

VPS_HOST="76.13.59.88"
SERVICES=(
  "COMEX Dashboard API|3751|/api/overview|critical"
  "LLM Router|3800|/health|critical"
  "Commercial Server|3760|/health|critical"
  "Campaign Tracker|3770|/health|normal"
  "Stripe Webhook|3780|/health|critical"
  "PilotCPF Site|3790|/|critical"
  "BDR Alexandra|3402|/health|critical"
  "PilotCPF CRM|3700|/health|normal"
)

DOMAINS=(
  "pilotcpf.monpermiscpf.com"
  "api.monpermiscpf.com"
  "abacus-rh.com"
  "platform.abacus-rh.com"
  "formations.abacus-rh.com"
  "academy.abacus-rh.com"
  "annuaire.monpermiscpf.com"
)

echo "=== ABACUS Health Check — $(date -u '+%Y-%m-%d %H:%M UTC') ==="
echo ""

# Check VPS services
echo "## Services VPS ($VPS_HOST)"
FAILURES=0
for service in "${SERVICES[@]}"; do
  IFS='|' read -r name port path priority <<< "$service"
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 "http://${VPS_HOST}:${port}${path}" 2>/dev/null)
  if [[ "$HTTP_CODE" =~ ^2 ]]; then
    echo "  OK  | $name (port $port) — HTTP $HTTP_CODE"
  else
    echo "  FAIL | $name (port $port) — HTTP $HTTP_CODE [$priority]"
    FAILURES=$((FAILURES + 1))
  fi
done

echo ""
echo "## Domaines (HTTPS + SSL)"
for domain in "${DOMAINS[@]}"; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 "https://${domain}" 2>/dev/null)
  SSL_EXPIRY=$(echo | openssl s_client -servername "$domain" -connect "${domain}:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  if [[ "$HTTP_CODE" =~ ^2 ]] || [[ "$HTTP_CODE" =~ ^3 ]]; then
    echo "  OK  | $domain — HTTP $HTTP_CODE — SSL expire: ${SSL_EXPIRY:-N/A}"
  else
    echo "  FAIL | $domain — HTTP $HTTP_CODE"
    FAILURES=$((FAILURES + 1))
  fi
done

echo ""
echo "## Résumé"
echo "Total failures: $FAILURES"
exit $FAILURES
