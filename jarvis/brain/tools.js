'use strict';

// Registre d'outils — les "mains" de JARVIS. Chaque outil déclare un schéma (pour que
// le LLM sache l'appeler) et un handler. Les domaines V1 sont câblés un par un ici.
//
// État : squelettes. Les handlers réels se brancheront sur les MCP (Gmail/Calendar/Drive/
// GitHub) et les APIs internes (health-server VPS, CRM PilotCPF, Claude Code).
// Chaque outil déclare `confirm: true` s'il est engageant/irréversible (garde-fou §4).

const https = require('https');
const http = require('http');

// --- Infra : lecture de l'état des services (health-server déjà en place) ----
function infraHealth() {
  const url = process.env.HEALTH_REPORT_URL || 'http://127.0.0.1:3850/health-report';
  const key = process.env.HEALTH_API_KEY || '';
  const lib = url.startsWith('https') ? https : http;
  return new Promise((resolve) => {
    const req = lib.get(url, { headers: { Authorization: `Bearer ${key}` }, timeout: 8000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try { resolve({ ok: true, data: JSON.parse(body) }); }
        catch { resolve({ ok: false, error: 'réponse non JSON', body }); }
      });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
  });
}

const REGISTRY = {
  infra_health: {
    description: "État de santé de l'infra VPS (services critiques up/down).",
    parameters: { type: 'object', properties: {}, required: [] },
    confirm: false,
    handler: async () => infraHealth()
  },

  // --- Squelettes des domaines V1 (handlers à brancher) ----------------------
  email_search: {
    description: 'Rechercher des emails (objet, expéditeur, période).',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' }, max: { type: 'number' } },
      required: ['query']
    },
    confirm: false,
    handler: async () => ({ ok: false, error: 'TODO: brancher MCP Gmail (search_threads)' })
  },
  email_send: {
    description: 'Envoyer un email (engageant — confirmation vocale requise).',
    parameters: {
      type: 'object',
      properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } },
      required: ['to', 'subject', 'body']
    },
    confirm: true,
    handler: async () => ({ ok: false, error: 'TODO: brancher MCP Gmail (create_draft/send)' })
  },
  calendar_today: {
    description: "Agenda du jour / prochains créneaux.",
    parameters: { type: 'object', properties: { range: { type: 'string' } }, required: [] },
    confirm: false,
    handler: async () => ({ ok: false, error: 'TODO: brancher MCP Google Calendar (list_events)' })
  },
  crm_relances: {
    description: 'Relances EDOF prêtes à valider / dossiers bloqués.',
    parameters: { type: 'object', properties: { statut: { type: 'string' } }, required: [] },
    confirm: false,
    handler: async () => ({ ok: false, error: 'TODO: brancher API CRM PilotCPF' })
  },
  code_task: {
    description: 'Déléguer une tâche de code/déploiement à Claude Code (engageant).',
    parameters: {
      type: 'object',
      properties: { instruction: { type: 'string' } },
      required: ['instruction']
    },
    confirm: true,
    handler: async () => ({ ok: false, error: 'TODO: brancher orchestration Claude Code' })
  }
};

function list() {
  return Object.entries(REGISTRY).map(([name, t]) => ({
    name,
    description: t.description,
    parameters: t.parameters,
    confirm: !!t.confirm
  }));
}

async function run(name, args) {
  const tool = REGISTRY[name];
  if (!tool) return { ok: false, error: `outil inconnu : ${name}` };
  return tool.handler(args || {});
}

function needsConfirm(name) {
  return !!(REGISTRY[name] && REGISTRY[name].confirm);
}

module.exports = { REGISTRY, list, run, needsConfirm };
