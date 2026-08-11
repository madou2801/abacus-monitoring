// Ré-injecte /opt/campaign-tracker/devis_route.js (scp'é) dans server.js entre les marqueurs.
const fs = require("fs");
const route = fs.readFileSync("/opt/campaign-tracker/devis_route.js", "utf8").trim();
const START = "// ==== ROUTE DEVIS PDF";
const END = "// ==== FIN ROUTE DEVIS PDF ====";
let s = fs.readFileSync("/opt/campaign-tracker/server.js", "utf8");
const i = s.indexOf(START), j = s.indexOf(END);
if (i < 0 || j < 0) { console.error("MARQUEURS INTROUVABLES (i=" + i + " j=" + j + ")"); process.exit(1); }
if (!route.startsWith(START) || !route.trimEnd().endsWith(END)) { console.error("le fichier route ne contient pas les 2 marqueurs"); process.exit(1); }
fs.writeFileSync("/opt/campaign-tracker/server.js.bak-prixcode-" + Date.now(), s);
const neu = s.slice(0, i) + route + s.slice(j + END.length);
fs.writeFileSync("/opt/campaign-tracker/server.js", neu);
console.log("OK server.js mis à jour (delta " + (neu.length - s.length) + " car). Vérif syntaxe...");
