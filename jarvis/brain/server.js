'use strict';

// Service HTTP exposant le cerveau de JARVIS.
//   GET  /health   → sonde (cohérent avec le reste de l'infra ABACUS)
//   POST /turn     → un tour de conversation { text } → { reply, route, ... }
//   POST /confirm  → exécute une action engageante après le "go" de Madou
//
// La couche voix (STT/TTS) et le mobile appelleront /turn. Pour l'instant : texte.

const http = require('http');
const path = require('path');
const router = require('./router');
const tools = require('./tools');

const cfg = require('./config.json');

function nowIso() {
  return new Date().toISOString();
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch { resolve({}); }
    });
  });
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    return send(res, 200, {
      status: 'ok',
      service: 'jarvis-brain',
      reflex: `${cfg.reflex.provider}:${cfg.reflex.model}`,
      deep: `${cfg.deep.provider}:${cfg.deep.model}`,
      tools: tools.list().map((t) => t.name),
      timestamp: nowIso()
    });
  }

  if (req.method === 'POST' && req.url === '/turn') {
    const { text } = await readBody(req);
    if (!text || typeof text !== 'string') return send(res, 400, { error: 'champ "text" requis' });
    try {
      const out = await router.handleTurn(cfg, text, nowIso());
      return send(res, 200, out);
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
  }

  if (req.method === 'POST' && req.url === '/confirm') {
    const { tool, args } = await readBody(req);
    if (!tool) return send(res, 400, { error: 'champ "tool" requis' });
    try {
      const result = await tools.run(tool, args || {});
      return send(res, 200, { ok: true, tool, result });
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
  }

  send(res, 404, { error: 'Not found. Utilise GET /health, POST /turn, POST /confirm' });
});

const port = process.env.JARVIS_PORT || cfg.server.port;
const host = cfg.server.host;
server.listen(port, host, () => {
  console.log(`JARVIS brain sur http://${host}:${port}`);
  console.log(`  réflexe : ${cfg.reflex.provider}:${cfg.reflex.model}  |  profond : ${cfg.deep.provider}:${cfg.deep.model}`);
});
