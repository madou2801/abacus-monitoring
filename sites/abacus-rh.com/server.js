/**
 * ABACUS-RH.com - Serveur du site vitrine
 * E-learning (catalogue SCORM), Bilan de competences en ligne (BOVC),
 * VAE en ligne, Outplacement - financements OPCO, AIF, personnel, entreprises.
 *
 * Meme architecture que les autres services du VPS ABACUS :
 * - Node.js natif (aucune dependance), ecoute sur 127.0.0.1
 * - Servi par Nginx (reverse proxy) sur abacus-rh.com
 * - Endpoint /health pour le monitoring (abacus-monitoring)
 * - Leads du formulaire stockes en JSONL local (POST /api/lead)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3820;
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');
const LEADS_FILE = process.env.LEADS_FILE || path.join(__dirname, 'leads.jsonl');
const START_TIME = Date.now();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<h1>404 - Page introuvable</h1><p><a href="/">Retour a l\'accueil</a></p>');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400'
    });
    res.end(data);
  });
}

function handleLead(req, res) {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 100 * 1024) req.destroy(); // 100 Ko max
  });
  req.on('end', () => {
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return sendJson(res, 400, { ok: false, error: 'JSON invalide' });
    }
    if (!payload.nom || !(payload.email || payload.telephone)) {
      return sendJson(res, 400, { ok: false, error: 'Nom et email ou telephone requis' });
    }
    const lead = {
      site: 'abacus-rh.com',
      date: new Date().toISOString(),
      nom: String(payload.nom).slice(0, 200),
      email: String(payload.email || '').slice(0, 200),
      telephone: String(payload.telephone || '').slice(0, 50),
      service: String(payload.service || '').slice(0, 200),
      statut: String(payload.statut || '').slice(0, 100),
      financement: String(payload.financement || '').slice(0, 50),
      message: String(payload.message || '').slice(0, 2000)
    };
    fs.appendFile(LEADS_FILE, JSON.stringify(lead) + '\n', (err) => {
      if (err) {
        console.error('Erreur ecriture lead:', err.message);
        return sendJson(res, 500, { ok: false, error: 'Erreur serveur' });
      }
      console.log(`[LEAD] ${lead.nom} - ${lead.service || 'non precise'} (${lead.financement || '?'})`);
      sendJson(res, 200, { ok: true, message: 'Demande enregistree. Un consultant vous recontacte sous 24h ouvrees.' });
    });
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === '/health') {
    return sendJson(res, 200, {
      status: 'ok',
      service: 'abacus-rh-site',
      uptime_s: Math.round((Date.now() - START_TIME) / 1000),
      timestamp: new Date().toISOString()
    });
  }

  if (pathname === '/api/lead' && req.method === 'POST') {
    return handleLead(req, res);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { error: 'Methode non autorisee' });
  }

  // Resolution statique avec garde anti path-traversal
  let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (!path.extname(rel)) rel += '.html'; // URLs propres : /vae -> vae.html
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    return sendJson(res, 403, { error: 'Interdit' });
  }
  serveFile(res, filePath);
});

server.listen(PORT, HOST, () => {
  console.log(`ABACUS RH site en ecoute sur ${HOST}:${PORT}`);
});
