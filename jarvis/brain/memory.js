'use strict';

// Mémoire persistante de JARVIS. V1 : un simple fichier JSON versionnable.
// Contenu : qui est Madou (profil), préférences, projets en cours, faits durables,
// et un journal court des derniers échanges (fenêtre glissante).
// Évolution prévue : SQLite + embeddings pour la recherche sémantique.

const fs = require('fs');
const path = require('path');

const STORE_PATH = process.env.JARVIS_MEMORY_PATH || path.join(__dirname, 'memory.store.json');

const DEFAULT = {
  profile: {
    name: 'Madou',
    email: 'md@abacus-rh.com',
    langue: 'fr-FR',
    // rempli au fil de l'eau — l'agent apprend et confirme avant d'enregistrer un fait durable
    entreprises: ['ABACUS RH', 'PilotCPF'],
    preferences: {}
  },
  facts: [],        // faits durables { text, since, source }
  projects: [],     // projets en cours { name, status, note }
  recent: []        // fenêtre glissante des derniers tours { role, content, at }
};

function load() {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT));
  }
}

function save(mem) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(mem, null, 2));
  return mem;
}

// Ajoute un tour à la fenêtre glissante (bornée pour ne pas exploser le contexte).
function remember(mem, role, content, nowIso) {
  mem.recent.push({ role, content, at: nowIso });
  if (mem.recent.length > 40) mem.recent = mem.recent.slice(-40);
  return mem;
}

// Enregistre un fait durable (après confirmation de Madou côté agent).
function addFact(mem, text, source, nowIso) {
  mem.facts.push({ text, since: nowIso, source: source || 'conversation' });
  return mem;
}

// Construit le bloc de contexte injecté dans le prompt système.
function contextBlock(mem) {
  const p = mem.profile;
  const facts = mem.facts.slice(-20).map((f) => `- ${f.text}`).join('\n') || '- (aucun)';
  const projects = mem.projects.map((pr) => `- ${pr.name} : ${pr.status}`).join('\n') || '- (aucun)';
  return [
    `Utilisateur : ${p.name} <${p.email}>, langue ${p.langue}.`,
    `Entités : ${(p.entreprises || []).join(', ')}.`,
    `Faits durables :\n${facts}`,
    `Projets en cours :\n${projects}`
  ].join('\n');
}

module.exports = { load, save, remember, addFact, contextBlock, STORE_PATH };
