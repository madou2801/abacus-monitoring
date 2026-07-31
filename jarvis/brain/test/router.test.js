'use strict';

// Test offline du couplage — aucun appel réseau LLM (fournisseur injecté).
// Isole la mémoire dans un fichier temporaire pour ne pas polluer le store réel.
const os = require('os');
const path = require('path');
process.env.JARVIS_MEMORY_PATH = path.join(os.tmpdir(), `jarvis-test-${process.pid}.json`);

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const router = require('../router');

const cfg = require('../config.json');
const NOW = '2026-07-31T00:00:00.000Z';

function resetMemory() {
  try { fs.unlinkSync(process.env.JARVIS_MEMORY_PATH); } catch {}
}

// Fournisseur factice : réponse selon la couche (glm = réflexe, claude = profond).
function fakeCall(reflexObj, deepText) {
  return async (modelCfg) => {
    if (modelCfg.provider === 'glm') return { text: JSON.stringify(reflexObj), raw: {} };
    return { text: deepText, raw: {} };
  };
}

test('réflexe répond seul, pas d\'escalade', async () => {
  resetMemory();
  const call = fakeCall(
    { intent: 'chat', confidence: 0.95, needs_deep: false, tool: null, tool_args: {}, reply: 'Salut Madou !' },
    'NE DEVRAIT PAS ÊTRE APPELÉ'
  );
  const out = await router.handleTurn(cfg, 'coucou', NOW, { call });
  assert.strictEqual(out.route, 'reflex');
  assert.strictEqual(out.reply, 'Salut Madou !');
});

test('escalade vers Claude sur intention code', async () => {
  resetMemory();
  const call = fakeCall(
    { intent: 'code', confidence: 0.9, needs_deep: true, tool: null, tool_args: {}, reply: '' },
    'Voici le script demandé.'
  );
  const out = await router.handleTurn(cfg, 'écris-moi un script', NOW, { call });
  assert.strictEqual(out.route, 'deep');
  assert.strictEqual(out.reply, 'Voici le script demandé.');
});

test('escalade quand la confiance est trop basse', async () => {
  resetMemory();
  const call = fakeCall(
    { intent: 'chat', confidence: 0.2, needs_deep: false, tool: null, tool_args: {}, reply: 'hmm' },
    'Réponse réfléchie.'
  );
  const out = await router.handleTurn(cfg, 'un truc flou', NOW, { call });
  assert.strictEqual(out.route, 'deep');
});

test('garde-fou : outil engageant → confirmation, pas d\'exécution', async () => {
  resetMemory();
  const call = fakeCall(
    { intent: 'email', confidence: 0.95, needs_deep: false, tool: 'email_send',
      tool_args: { to: 'x@y.z', subject: 's', body: 'b' }, reply: '' },
    'x'
  );
  const out = await router.handleTurn(cfg, 'envoie un mail à x', NOW, { call });
  assert.ok(out.awaiting_confirmation, 'doit demander confirmation');
  assert.strictEqual(out.awaiting_confirmation.tool, 'email_send');
});

test('outil non engageant s\'exécute directement', async () => {
  resetMemory();
  const call = fakeCall(
    { intent: 'infra', confidence: 0.95, needs_deep: false, tool: 'infra_health',
      tool_args: {}, reply: 'Je vérifie l\'infra.' },
    'x'
  );
  const out = await router.handleTurn(cfg, 'tout tourne ?', NOW, { call });
  assert.strictEqual(out.route, 'reflex+tool');
  assert.strictEqual(out.tool, 'infra_health');
  assert.ok(out.result, 'un résultat outil est renvoyé');
});

test('mémoire : le tour est persisté', async () => {
  resetMemory();
  const call = fakeCall(
    { intent: 'chat', confidence: 0.95, needs_deep: false, tool: null, tool_args: {}, reply: 'ok' },
    'x'
  );
  await router.handleTurn(cfg, 'retiens ça', NOW, { call });
  const mem = JSON.parse(fs.readFileSync(process.env.JARVIS_MEMORY_PATH, 'utf8'));
  assert.ok(mem.recent.some((m) => m.content === 'retiens ça'), 'le message user est en mémoire');
});

test.after(() => resetMemory());
