# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Monitoring and health-check tooling for the ABACUS VPS infrastructure (host `76.13.59.88`). It watches a fixed set of internal HTTP services (by port) and public HTTPS domains (with SSL expiry). There is no application being built here — this repo *observes* other services. Docs and comments are written in French.

## Commands

There is no build, lint, test, or package manager (no `package.json`, no dependencies — pure Node.js stdlib).

- Run the aggregator locally: `node health-server.js` (env: `HEALTH_API_KEY`, `HEALTH_PORT` default `3850`; binds to `127.0.0.1`).
- Run an ad-hoc check from anywhere: `bash health-check.sh` (prints a human-readable table; exit code = number of failures).
- Deploy the aggregator to the VPS: `bash deploy.sh` (SSH/SCP + PM2; prints manual Nginx steps).
- Query the deployed aggregator: `curl -H "Authorization: Bearer <key>" https://api.monpermiscpf.com/health-report` (append `/detailed` for services + domains + SSL).

## Architecture

There are **two independent monitoring paths** that do not share code:

1. **`health-check.sh`** — runs from any machine, hits the VPS *public IP* on each service port directly, and emits a plain-text OK/FAIL report. Stateless, one-shot, exit code carries the failure count. Used by scheduled/remote Claude Code agents.

2. **`health-server.js`** — a long-running Node HTTP server that runs *on the VPS itself* (deployed via `deploy.sh`, managed by PM2 as `health-aggregator`). It checks services over `127.0.0.1` (not the public IP), returns JSON, and is reverse-proxied by Nginx at `api.monpermiscpf.com/health-report`. It enforces Bearer-token auth and an in-process rate limit of 10 req/hour (also enforced at the Nginx layer per `nginx-health.conf`).

### Status semantics (health-server.js)
- A service/domain is `UP`/`OK` when its HTTP status code is `< 500`.
- Overall status is `critical` if any service flagged `critical: true` is down, `healthy` if all are up, otherwise `degraded`.

### Critical gotcha: the service list is duplicated, not centralized
`config.json` is shipped to the VPS by `deploy.sh` but is **not** read by `health-server.js`. The list of monitored services and domains is hardcoded in **three** places that must be kept in sync by hand:
- `health-server.js` (`SERVICES` / `DOMAINS` arrays)
- `health-check.sh` (`SERVICES` / `DOMAINS` arrays)
- `config.json`

`README.md` also keeps its own tables. When adding, removing, or re-prioritizing a monitored service or domain, update all of these together. They have already drifted (e.g. domain lists differ between `README.md` and the scripts).

## Deployment notes

`deploy.sh` does not fully automate Nginx — it copies files and starts PM2, then prints manual steps to add the `limit_req_zone` / `location /health-report` block (mirrored in `nginx-health.conf`) and reload Nginx. The aggregator listens only on localhost, so it is unreachable without the Nginx proxy.

## LOOP_TEMPLATES.md

Copy-paste `/loop` prompts for real-time, session-scoped monitoring inside Claude Code (e.g. polling service ports every 5 min, SSL checks every 2h). These run only while the session is open; they are operator tooling, not part of the deployed system.

## Secrets

`health-server.js` and `deploy.sh` contain a hardcoded fallback `HEALTH_API_KEY`. Prefer setting `HEALTH_API_KEY` via the environment; do not introduce new hardcoded credentials.
