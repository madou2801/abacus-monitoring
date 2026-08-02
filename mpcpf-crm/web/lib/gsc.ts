// lib/gsc.ts — Accès Google Search Console (lecture) pour l'onglet « Suivi des sites ».
// SERVEUR UNIQUEMENT. Auth service-account via JWT signé (crypto natif, aucune dépendance).
// Le service account (GSC_SERVICE_ACCOUNT_B64, base64 du JSON) a un accès webmasters.readonly
// aux propriétés sc-domain:monpermiscpf.com et sc-domain:abacus-rh.com.
import crypto from "crypto";

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let cachedToken: { token: string; exp: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;
  const raw = process.env.GSC_SERVICE_ACCOUNT_B64;
  if (!raw) throw new Error("GSC_SERVICE_ACCOUNT_B64 manquant");
  const sa = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
      aud: sa.token_uri,
      iat,
      exp,
    }),
  );
  const signingInput = `${header}.${claims}`;
  const sig = crypto.createSign("RSA-SHA256").update(signingInput).sign(sa.private_key);
  const jwt = `${signingInput}.${b64url(sig)}`;
  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error("GSC token error: " + JSON.stringify(j).slice(0, 200));
  cachedToken = { token: j.access_token, exp: Date.now() + (j.expires_in - 120) * 1000 };
  return cachedToken.token;
}

type Row = { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number };

async function query(site: string, body: any): Promise<Row[]> {
  const token = await getAccessToken();
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const j = await res.json();
  return (j.rows as Row[]) || [];
}

const D = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

export type SiteTraffic = {
  label: string;
  monthly: { month: string; clicks: number; impressions: number }[];
  cur: { clicks: number; impressions: number };
  prev: { clicks: number; impressions: number };
  zones: { country: string; clicks: number; impressions: number }[];
  quickWins: { query: string; position: number; impressions: number; clicks: number }[];
};

const TARGETS: { label: string; site: string; page?: string }[] = [
  { label: "MonPermisCPF", site: "sc-domain:monpermiscpf.com" },
  { label: "ABACUS-RH (tout)", site: "sc-domain:abacus-rh.com" },
  { label: "Blog abacus-rh.com", site: "sc-domain:abacus-rh.com", page: "blog.abacus-rh.com" },
];

async function trafficFor(t: { label: string; site: string; page?: string }): Promise<SiteTraffic> {
  const pf = t.page
    ? { dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "contains", expression: t.page }] }] }
    : {};
  const [monthlyRows, curRows, prevRows, zoneRows, qwRows] = await Promise.all([
    query(t.site, { startDate: D(220), endDate: D(3), dimensions: ["date"], rowLimit: 250, ...pf }),
    query(t.site, { startDate: D(31), endDate: D(3), dimensions: [], ...pf }),
    query(t.site, { startDate: D(59), endDate: D(31), dimensions: [], ...pf }),
    query(t.site, { startDate: D(31), endDate: D(3), dimensions: ["country"], rowLimit: 6, ...pf }),
    query(t.site, { startDate: D(90), endDate: D(3), dimensions: ["query"], rowLimit: 200, ...pf }),
  ]);
  const byMonth: Record<string, { clicks: number; impressions: number }> = {};
  for (const r of monthlyRows) {
    const m = (r.keys?.[0] ?? "").slice(0, 7);
    if (!m) continue;
    byMonth[m] ??= { clicks: 0, impressions: 0 };
    byMonth[m].clicks += r.clicks;
    byMonth[m].impressions += r.impressions;
  }
  const monthly = Object.keys(byMonth)
    .sort()
    .slice(-7)
    .map((m) => ({ month: m, clicks: Math.round(byMonth[m].clicks), impressions: Math.round(byMonth[m].impressions) }));
  const quickWins = qwRows
    .filter((r) => r.impressions >= 30 && r.position >= 5.5 && r.position <= 20)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 6)
    .map((r) => ({ query: r.keys?.[0] ?? "", position: r.position, impressions: Math.round(r.impressions), clicks: Math.round(r.clicks) }));
  return {
    label: t.label,
    monthly,
    cur: { clicks: Math.round(curRows[0]?.clicks ?? 0), impressions: Math.round(curRows[0]?.impressions ?? 0) },
    prev: { clicks: Math.round(prevRows[0]?.clicks ?? 0), impressions: Math.round(prevRows[0]?.impressions ?? 0) },
    zones: zoneRows.map((r) => ({ country: (r.keys?.[0] ?? "").toUpperCase(), clicks: Math.round(r.clicks), impressions: Math.round(r.impressions) })),
    quickWins,
  };
}

export async function getSitesTraffic(): Promise<SiteTraffic[]> {
  return Promise.all(TARGETS.map(trafficFor));
}
