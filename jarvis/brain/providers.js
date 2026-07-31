'use strict';

// Clients LLM interchangeables. Deux fournisseurs pour l'instant :
//  - GLM (z.ai)  : couche "réflexe" — rapide, pas cher, FR correct. API compatible OpenAI.
//  - Claude      : couche "profonde" — raisonnement, code, jugement. API Messages Anthropic.
//
// Aucune clé n'est écrite ici : elles viennent des variables d'environnement (config.apiKeyEnv).

function requireKey(cfg) {
  const key = process.env[cfg.apiKeyEnv];
  if (!key) throw new Error(`Clé manquante : variable d'environnement ${cfg.apiKeyEnv} non définie`);
  return key;
}

// --- GLM (z.ai), format OpenAI chat/completions -----------------------------
async function callGlm(cfg, { system, messages, jsonSchema }) {
  const key = requireKey(cfg);
  const body = {
    model: cfg.model,
    temperature: cfg.temperature,
    max_tokens: cfg.maxTokens,
    messages: [{ role: 'system', content: system }, ...messages]
  };
  // Sortie structurée quand un schéma est demandé (classification d'intention, etc.)
  if (jsonSchema) {
    body.response_format = { type: 'json_object' };
  }
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`GLM ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { text: data.choices?.[0]?.message?.content ?? '', raw: data };
}

// --- Claude (Anthropic Messages) --------------------------------------------
async function callClaude(cfg, { system, messages, tools }) {
  const key = requireKey(cfg);
  const body = {
    model: cfg.model,
    max_tokens: cfg.maxTokens,
    temperature: cfg.temperature,
    system,
    messages: messages.map((m) => ({ role: m.role === 'system' ? 'user' : m.role, content: m.content }))
  };
  if (tools && tools.length) body.tools = tools;
  const res = await fetch(`${cfg.baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { text, raw: data };
}

async function call(cfg, payload) {
  if (cfg.provider === 'glm') return callGlm(cfg, payload);
  if (cfg.provider === 'claude') return callClaude(cfg, payload);
  throw new Error(`Fournisseur inconnu : ${cfg.provider}`);
}

module.exports = { call };
