'use strict';

// Le couplage. Chaque tour :
//   1. RÉFLEXE (GLM) : comprend l'intention, décide s'il peut répondre seul ou s'il faut
//      escalader vers le cerveau profond. Sortie structurée (JSON).
//   2. Selon l'intention/confiance → réponse réflexe directe, OU escalade Claude.
//   3. Garde-fou : toute intention engageante repart avec `awaiting_confirmation` (§4).
//   4. Mémoire mise à jour.
//
// `now` est injecté par l'appelant (le serveur) pour rester testable/déterministe.

const providers = require('./providers');
const memory = require('./memory');
const tools = require('./tools');

const REFLEX_SYSTEM = (ctx, toolList) => `Tu es JARVIS, l'assistante personnelle de Madou. Tu parles français, ton court et direct (réponse orale).
Contexte mémoire :
${ctx}

Outils disponibles : ${toolList.map((t) => t.name).join(', ')}.

Ta tâche à CE tour : analyser le message et répondre UNIQUEMENT en JSON, schéma :
{
  "intent": "chat | question | email | calendar | infra | crm | code | deploy | decision | analysis | multi_step",
  "confidence": 0.0-1.0,
  "needs_deep": true|false,        // true si raisonnement dur, code, jugement, ou plusieurs étapes
  "tool": "<nom d'outil ou null>", // si une action outil répond directement
  "tool_args": { },
  "reply": "<réponse orale courte si tu peux répondre seul, sinon ''>"
}
Escalade (needs_deep=true) pour : code, deploy, decision, analysis, multi_step, ou dès que tu n'es pas sûr.`;

const DEEP_SYSTEM = (ctx) => `Tu es JARVIS, l'assistante personnelle de Madou (ABACUS RH / PilotCPF). Tu parles français, clair et posé.
Tu es la couche de raisonnement profond : code, analyse, jugement, orchestration multi-outils.
Contexte mémoire :
${ctx}

Règles : ne confirme jamais une action engageante (email, relance, déploiement, suppression) sans le "go" explicite de Madou. Sur le réglementaire (CPF/AIF/montants), n'invente rien — renvoie vers un template validé.`;

function safeParse(text) {
  try { return JSON.parse(text); } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

// `deps.call` est injectable pour les tests (par défaut : les vrais fournisseurs).
async function handleTurn(cfg, userText, now, deps = {}) {
  const call = deps.call || providers.call;
  const mem = memory.load();
  const ctx = memory.contextBlock(mem);
  const toolList = tools.list();
  memory.remember(mem, 'user', userText, now);

  // 1. RÉFLEXE (GLM)
  const reflex = await call(cfg.reflex, {
    system: REFLEX_SYSTEM(ctx, toolList),
    messages: [{ role: 'user', content: userText }],
    jsonSchema: true
  });
  const decision = safeParse(reflex.text) || { intent: 'chat', confidence: 0, needs_deep: true, reply: '' };

  const esc = cfg.escalation;
  const mustDeep = decision.needs_deep
    || (decision.confidence || 0) < esc.confidenceFloor
    || esc.toDeepIntents.includes(decision.intent);

  // 2a. Action outil demandée par le réflexe
  if (decision.tool && tools.REGISTRY[decision.tool]) {
    if (tools.needsConfirm(decision.tool)) {
      // Garde-fou : on n'exécute pas, on demande le go vocal.
      memory.remember(mem, 'assistant', `[confirmation requise] ${decision.tool}`, now);
      memory.save(mem);
      return {
        route: 'reflex',
        awaiting_confirmation: { tool: decision.tool, args: decision.tool_args || {} },
        reply: decision.reply || `Je m'apprête à faire « ${decision.tool} ». Je lance ? (dis "go")`,
        decision
      };
    }
    const result = await tools.run(decision.tool, decision.tool_args);
    const reply = decision.reply || 'C\'est fait.';
    memory.remember(mem, 'assistant', reply, now);
    memory.save(mem);
    return { route: 'reflex+tool', tool: decision.tool, result, reply, decision };
  }

  // 2b. Réponse réflexe directe (pas d'escalade)
  if (!mustDeep && decision.reply) {
    memory.remember(mem, 'assistant', decision.reply, now);
    memory.save(mem);
    return { route: 'reflex', reply: decision.reply, decision };
  }

  // 3. CERVEAU PROFOND (Claude)
  const history = mem.recent.slice(-12).map((m) => ({ role: m.role, content: m.content }));
  const deep = await call(cfg.deep, {
    system: DEEP_SYSTEM(ctx),
    messages: history.length ? history : [{ role: 'user', content: userText }]
  });
  memory.remember(mem, 'assistant', deep.text, now);
  memory.save(mem);
  return { route: 'deep', reply: deep.text, decision };
}

module.exports = { handleTurn };
