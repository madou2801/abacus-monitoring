// Fait transiter le `code` formation à travers le workflow devis n8n (simulateur → /t/devis).
const { execSync } = require("child_process");
const WFID = "BZvogEqIUvv4Vyns", BASE = "http://localhost:5678/api/v1";
const KEY = (process.env.N8N_KEY || execSync(`docker exec n8n-postgres psql -U n8n -d n8ndb -t -A -c "select \\"apiKey\\" from user_api_keys where label='n8n mai26'"`).toString()).trim();
const H = { "X-N8N-API-KEY": KEY, "Content-Type": "application/json" };
(async () => {
  const wf = await (await fetch(`${BASE}/workflows/${WFID}`, { headers: H })).json();
  if (!wf || !wf.nodes) { console.error("GET KO"); process.exit(1); }
  let n1 = 0, n2 = 0;
  for (const node of wf.nodes) {
    if (node.name === "Preparer devis") {
      const js = node.parameters.jsCode;
      if (js.includes("code:d.code")) { console.log("Preparer devis: code déjà présent"); }
      else if (js.includes("return [{json:{cf_ok,")) { node.parameters.jsCode = js.replace("return [{json:{cf_ok,", 'return [{json:{code:d.code||"",cf_ok,'); n1++; }
      else console.log("Preparer devis: motif return introuvable");
    }
    if (node.name === "Envoi devis (/t/devis)") {
      const jb = node.parameters.jsonBody;
      if (jb.includes("code: $json.code")) { console.log("Envoi devis: code déjà présent"); }
      else if (jb.includes("{ prenom: $json.prenom,")) { node.parameters.jsonBody = jb.replace("{ prenom: $json.prenom,", "{ code: $json.code, prenom: $json.prenom,"); n2++; }
      else console.log("Envoi devis: motif prenom introuvable");
    }
  }
  console.log("modifs: Preparer=" + n1 + " Envoi=" + n2);
  if (n1 + n2 === 0) { console.log("rien à changer"); return; }
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings || {} };
  const r = await fetch(`${BASE}/workflows/${WFID}`, { method: "PUT", headers: H, body: JSON.stringify(body) });
  console.log("PUT", r.status, (await r.text()).slice(0, 120));
})().catch(e => { console.error("ERR", e && e.message); process.exit(1); });
