#!/usr/bin/env node
// Scan-secrets léger (stand-in gitleaks — chantier C2 / passage-etape-2 §C2).
// Objectif : bloquant, haute précision (0 faux positif toléré), à remplacer par
// `gitleaks detect` dès qu'il est installé. Ne scanne que les fichiers versionnés,
// hors node_modules/.next/dist/.git et hors .env.example (référence de nommage).
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Motifs haute confiance uniquement (une vraie clé, pas un placeholder).
const RULES = [
  { name: "Supabase secret key", re: /sb_secret_[A-Za-z0-9_-]{12,}/ },
  { name: "Private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { name: "AWS access key id", re: /AKIA[0-9A-Z]{16}/ },
  { name: "OpenAI/DeepSeek key", re: /\bsk-[A-Za-z0-9]{20,}/ },
  { name: "Retell key", re: /\bkey_[a-f0-9]{24,}/ },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{30,}/ },
];

// Un placeholder n'est pas un secret : on ignore les valeurs manifestement factices.
const PLACEHOLDER = /(your|example|placeholder|xxxx|redacted|dummy|<[^>]+>|\.\.\.)/i;

let files = [];
try {
  files = execSync("git ls-files", { cwd: process.cwd(), encoding: "utf8" })
    .split("\n").map((s) => s.trim()).filter(Boolean);
} catch {
  console.error("scan:secrets — 'git ls-files' indisponible (pas un dépôt git ?).");
  process.exit(2);
}

const SKIP = /(^|\/)(node_modules|\.next|dist|\.git)\//;
const isText = (f) => !/\.(png|jpe?g|gif|pdf|zip|ico|woff2?|ttf|mp4|webp|lock)$/i.test(f);

const findings = [];
for (const f of files) {
  if (SKIP.test(f) || f.endsWith(".env.example") || f.endsWith("scripts/scan-secrets.mjs")) continue;
  if (!isText(f)) continue;
  let text;
  try { text = readFileSync(f, "utf8"); } catch { continue; }
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const rule of RULES) {
      const m = lines[i].match(rule.re);
      if (m && !PLACEHOLDER.test(m[0])) {
        findings.push(`${f}:${i + 1}  [${rule.name}]  ${m[0].slice(0, 12)}…`);
      }
    }
  }
}

if (findings.length) {
  console.error(`scan:secrets — ${findings.length} secret(s) potentiel(s) détecté(s) :`);
  for (const x of findings) console.error("  " + x);
  process.exit(1);
}
console.log(`scan:secrets — OK (aucun secret dans ${files.length} fichiers versionnés).`);
