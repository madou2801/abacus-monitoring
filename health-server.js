const http = require('http');
const https = require('https');

const API_KEY = process.env.HEALTH_API_KEY || '6f20ade18b199808ca76f7f639565ddd9dcce828e1ad6ec3cd6f11a34441f905';
const PORT = process.env.HEALTH_PORT || 3850;

const SERVICES = [
  { name: 'COMEX Dashboard API', port: 3751, path: '/api/overview', critical: true },
  { name: 'LLM Router', port: 3800, path: '/health', critical: true },
  { name: 'Commercial Server', port: 3760, path: '/health', critical: true },
  { name: 'Campaign Tracker', port: 3770, path: '/health', critical: false },
  { name: 'Stripe Webhook', port: 3780, path: '/health', critical: true },
  { name: 'PilotCPF Site', port: 3790, path: '/', critical: true },
  { name: 'BDR Alexandra', port: 3402, path: '/health', critical: true },
  { name: 'PilotCPF CRM', port: 3700, path: '/health', critical: false }
];

const DOMAINS = [
  'pilotcpf.monpermiscpf.com',
  'api.monpermiscpf.com',
  'abacus-rh.com',
  'platform.abacus-rh.com',
  'formations.abacus-rh.com',
  'academy.abacus-rh.com',
  'annuaire.monpermiscpf.com'
];

// Rate limiting: max 10 requests per hour
const rateLimit = { count: 0, resetAt: Date.now() + 3600000 };

function checkRateLimit() {
  const now = Date.now();
  if (now > rateLimit.resetAt) {
    rateLimit.count = 0;
    rateLimit.resetAt = now + 3600000;
  }
  rateLimit.count++;
  return rateLimit.count <= 10;
}

function checkService(service) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = http.get({
      hostname: '127.0.0.1',
      port: service.port,
      path: service.path,
      timeout: 5000
    }, (res) => {
      const ms = Date.now() - start;
      resolve({ name: service.name, status: res.statusCode < 500 ? 'UP' : 'DOWN', response_ms: ms, critical: service.critical });
    });
    req.on('error', () => resolve({ name: service.name, status: 'DOWN', response_ms: -1, critical: service.critical }));
    req.on('timeout', () => { req.destroy(); resolve({ name: service.name, status: 'DOWN', response_ms: -1, critical: service.critical }); });
  });
}

function checkDomain(domain) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = https.get({
      hostname: domain,
      path: '/',
      timeout: 10000
    }, (res) => {
      const ms = Date.now() - start;
      resolve({ domain, status: res.statusCode < 500 ? 'OK' : 'FAIL', http_code: res.statusCode, response_ms: ms });
    });
    req.on('error', (e) => resolve({ domain, status: 'FAIL', http_code: 0, response_ms: -1, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ domain, status: 'FAIL', http_code: 0, response_ms: -1, error: 'timeout' }); });
  });
}

const server = http.createServer(async (req, res) => {
  // Auth check
  const auth = req.headers['authorization'];
  if (auth !== `Bearer ${API_KEY}`) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Unauthorized' }));
  }

  // Rate limit
  if (!checkRateLimit()) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Rate limit exceeded (10/hour)' }));
  }

  if (req.url === '/health-report') {
    // Minimal report (safe for external access)
    const results = await Promise.all(SERVICES.map(checkService));
    const up = results.filter(r => r.status === 'UP').length;
    const criticalDown = results.filter(r => r.status === 'DOWN' && r.critical);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      status: criticalDown.length > 0 ? 'critical' : up === results.length ? 'healthy' : 'degraded',
      services_up: up,
      services_total: results.length,
      critical_down: criticalDown.length,
      timestamp: new Date().toISOString()
    }));
  }

  if (req.url === '/health-report/detailed') {
    // Detailed report (services + domains + SSL)
    const [serviceResults, domainResults] = await Promise.all([
      Promise.all(SERVICES.map(checkService)),
      Promise.all(DOMAINS.map(checkDomain))
    ]);

    const up = serviceResults.filter(r => r.status === 'UP').length;
    const criticalDown = serviceResults.filter(r => r.status === 'DOWN' && r.critical);
    const domainsOk = domainResults.filter(r => r.status === 'OK').length;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      status: criticalDown.length > 0 ? 'critical' : up === serviceResults.length ? 'healthy' : 'degraded',
      services: serviceResults,
      domains: domainResults,
      summary: {
        services_up: up,
        services_total: serviceResults.length,
        critical_down: criticalDown.map(s => s.name),
        domains_ok: domainsOk,
        domains_total: domainResults.length
      },
      timestamp: new Date().toISOString()
    }));
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found. Use /health-report or /health-report/detailed' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Health aggregator running on 127.0.0.1:${PORT}`);
  console.log(`Endpoints: /health-report (minimal), /health-report/detailed (full)`);
  console.log(`Rate limit: 10 requests/hour`);
});
