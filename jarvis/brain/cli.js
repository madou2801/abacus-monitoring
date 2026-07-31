'use strict';

// REPL texte pour dialoguer avec JARVIS depuis le terminal.
// Usage :  GLM_API_KEY=... ANTHROPIC_API_KEY=... node cli.js
// Tape ta phrase, JARVIS répond. "go" confirme une action en attente. Ctrl+C pour quitter.

const readline = require('readline');
const router = require('./router');
const tools = require('./tools');
const cfg = require('./config.json');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'toi › ' });

let pending = null; // action en attente de confirmation { tool, args }

console.log('JARVIS (texte). réflexe=%s:%s  profond=%s:%s', cfg.reflex.provider, cfg.reflex.model, cfg.deep.provider, cfg.deep.model);
console.log('Astuce : réponds "go" pour confirmer une action, Ctrl+C pour quitter.\n');
rl.prompt();

rl.on('line', async (line) => {
  const text = line.trim();
  if (!text) return rl.prompt();

  try {
    // Confirmation d'une action engageante précédemment proposée.
    if (pending && /^(go|oui|vas-y|confirme|ok)$/i.test(text)) {
      const result = await tools.run(pending.tool, pending.args);
      console.log('jarvis › [%s] %s', pending.tool, JSON.stringify(result));
      pending = null;
      return rl.prompt();
    }

    const out = await router.handleTurn(cfg, text, new Date().toISOString());
    if (out.awaiting_confirmation) {
      pending = out.awaiting_confirmation;
      console.log('jarvis › %s', out.reply);
    } else {
      pending = null;
      console.log('jarvis › %s', out.reply);
      if (out.route) console.log('        (route: %s)', out.route);
    }
  } catch (e) {
    console.error('jarvis › erreur:', e.message);
  }
  rl.prompt();
});

rl.on('close', () => { console.log('\nÀ bientôt, Madou.'); process.exit(0); });
