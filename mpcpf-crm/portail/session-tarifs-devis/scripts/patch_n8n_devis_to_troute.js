// patch_n8n_devis_to_troute.js
// Branche le workflow "MPCPF - Devis Web (Simulateur)" (BZvogEqIUvv4Vyns) sur /t/devis
// pour l'email AVEC bouton de validation + enregistrement CRM.
// GARDE les relances J+1/J+3 (node "INSERT relance" sur branche independante = intouche).
// A lancer SUR le VPS 81 :  node /root/patch_n8n_devis_to_troute.js
// Backup workflow deja fait cote poste (backup_wf_devis_web_YYYYMMDD.json).
const { execSync } = require("child_process");

const WFID = "BZvogEqIUvv4Vyns";
const BASE = "http://localhost:5678/api/v1";
const KEY = (process.env.N8N_KEY || execSync(
  `docker exec n8n-postgres psql -U n8n -d n8ndb -t -A -c "select \\"apiKey\\" from user_api_keys where label='n8n mai26'"`
).toString()).trim();
const H = { "X-N8N-API-KEY": KEY, "Content-Type": "application/json" };

(async () => {
  const wf = await (await fetch(`${BASE}/workflows/${WFID}`, { headers: H })).json();
  if (!wf || !wf.nodes) { console.error("GET KO", JSON.stringify(wf).slice(0, 300)); process.exit(1); }

  // 1) Node "Generer PDF" -> "Envoi devis (/t/devis)" : retire return_pdf, ajoute route + source.
  const node = wf.nodes.find(n => n.name === "Generer PDF");
  if (!node) { console.error("node 'Generer PDF' introuvable"); process.exit(1); }
  const NEWNAME = "Envoi devis (/t/devis)";
  node.name = NEWNAME;
  node.parameters.jsonBody =
    "={{ { prenom: $json.prenom, nom: $json.nom, email: $json.email, telephone: $json.tel, " +
    "formation: $json.formation, formation_detail: $json.detail, situation: $json.situation, " +
    "code_postal: $json.cp, prix_cpf: $json.prix, " +
    "cpf_eligible: $('Webhook Devis').item.json.body.cpf_eligible, " +
    "route: $json.route, source: 'simulateur-web' } }}";

  // 2) Connexions : Devis chiffre? -> nouveau nom ; branche principale du node = STOP
  //    (on coupe -> "PDF binaire" pour supprimer l'email doublon SANS bouton),
  //    on garde la sortie erreur (index 1) -> "Email beneficiaire" comme filet de secours.
  const c = wf.connections;
  c["Devis chiffre ?"].main[0] = [{ node: NEWNAME, type: "main", index: 0 }];
  const oldOut = c["Generer PDF"] || { main: [[], [{ node: "Email beneficiaire", type: "main", index: 0 }]] };
  const fallback = (oldOut.main && oldOut.main[1]) ? oldOut.main[1] : [{ node: "Email beneficiaire", type: "main", index: 0 }];
  c[NEWNAME] = { main: [[], fallback] };  // main[0] vide = plus de "PDF binaire" / "Email benef + PDF"
  delete c["Generer PDF"];

  const body = { name: wf.name, nodes: wf.nodes, connections: c, settings: wf.settings || {} };
  const r = await fetch(`${BASE}/workflows/${WFID}`, { method: "PUT", headers: H, body: JSON.stringify(body) });
  console.log("PUT", r.status, (await r.text()).slice(0, 200));
})().catch(e => { console.error("ERR", e && e.message); process.exit(1); });
