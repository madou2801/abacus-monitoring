// patch_mailer_mime.js — corrige le separateur d'en-tetes MIME (ligne vide manquante)
// dans sendMailWithAttachment : le corps HTML etait avale -> email "juste PDF sans texte".
const fs = require("fs");
const f = "/opt/campaign-tracker/mailer_abacus.js";
let s = fs.readFileSync(f, "utf8");

const OLD = '].join("\\r\\n") + parts.join("\\r\\n");';
const NEW = '].join("\\r\\n") + "\\r\\n" + parts.join("\\r\\n");';

const n = s.split(OLD).length - 1;
if (n !== 1) { console.error("ABORT: motif trouve " + n + " fois (attendu 1)"); process.exit(1); }
fs.writeFileSync(f + ".bak-mime-" + Date.now(), fs.readFileSync(f));
s = s.replace(OLD, NEW);
fs.writeFileSync(f, s);
console.log("OK: separateur MIME corrige (ligne vide ajoutee avant le premier boundary).");
