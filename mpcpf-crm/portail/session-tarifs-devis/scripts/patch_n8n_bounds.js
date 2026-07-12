// Aligne les bornes prix du node "Preparer devis" (n8n) sur /t/devis (caces 3500, ssiap 5500, securite 1500).
const { execSync } = require("child_process");
const WFID = "BZvogEqIUvv4Vyns", BASE = "http://localhost:5678/api/v1";
const KEY = (process.env.N8N_KEY || execSync(`docker exec n8n-postgres psql -U n8n -d n8ndb -t -A -c "select \\"apiKey\\" from user_api_keys where label='n8n mai26'"`).toString()).trim();
const H = { "X-N8N-API-KEY": KEY, "Content-Type": "application/json" };
const REP = [['"caces":[400,2000]', '"caces":[400,3500]'], ['"ssiap":[1000,3500]', '"ssiap":[1000,5500]'], ['"securite":[80,600]', '"securite":[80,1500]']];
(async () => {
  const wf = await (await fetch(`${BASE}/workflows/${WFID}`, { headers: H })).json();
  if (!wf || !wf.nodes) { console.error("GET KO"); process.exit(1); }
  const node = wf.nodes.find(n => n.name === "Preparer devis");
  if (!node) { console.error("node introuvable"); process.exit(1); }
  let js = node.parameters.jsCode, changed = 0;
  for (const [o, n] of REP) { if (js.includes(o)) { js = js.split(o).join(n); changed++; console.log("OK", o, "->", n); } else console.log("motif absent:", o); }
  if (!changed) { console.log("rien à changer"); return; }
  node.parameters.jsCode = js;
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings || {} };
  const r = await fetch(`${BASE}/workflows/${WFID}`, { method: "PUT", headers: H, body: JSON.stringify(body) });
  console.log("PUT", r.status);
})().catch(e => { console.error("ERR", e && e.message); process.exit(1); });
