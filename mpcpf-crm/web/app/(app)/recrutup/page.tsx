import { ref } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types (schéma ref — vue v_recrutup_prospects + tables recrutup_leads/sends)
// ---------------------------------------------------------------------------
type Prospect = {
  siren: string | null;
  entreprise: string | null;
  code_postal: string | null;
  commune: string | null;
  departement: string | null;
  nb_offres: number | null;
  score_max: number | null;
  secteurs: string[] | null;
  postes: string[] | null;
  email_principal: string | null;
  email_mx_valide: boolean | null;
  has_email: boolean | null;
};
type Lead = {
  id: number;
  entreprise: string | null;
  ville: string | null;
  code_postal: string | null;
  nb_profils: number | null;
  dispositif: string | null;
  email: string | null;
  created_at: string | null;
};
type Send = { id: number; email: string | null; statut: string | null; ts: string | null };

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
async function load() {
  let prospects: Prospect[] = [];
  let leads: Lead[] = [];
  let sends: Send[] = [];
  let sendsTableExists = true;
  let err: string | null = null;
  try {
    const c = ref();
    const p = await c
      .from("v_recrutup_prospects")
      .select(
        "siren,entreprise,code_postal,commune,departement,nb_offres,score_max,secteurs,postes,email_principal,email_mx_valide,has_email",
      )
      .order("score_max", { ascending: false })
      .limit(2000);
    if (p.error) throw new Error(p.error.message);
    prospects = (p.data as Prospect[]) ?? [];

    const l = await c
      .from("recrutup_leads")
      .select("id,entreprise,ville,code_postal,nb_profils,dispositif,email,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (l.error) throw new Error(l.error.message);
    leads = (l.data as Lead[]) ?? [];

    const s = await c
      .from("recrutup_sends")
      .select("id,email,statut,ts")
      .order("ts", { ascending: false })
      .limit(2000);
    if (s.error) {
      sendsTableExists = false; // table pas encore créée = normal
    } else {
      sends = (s.data as Send[]) ?? [];
    }
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }
  return { prospects, leads, sends, sendsTableExists, err };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function countBy<T>(rows: T[], key: (r: T) => string | null | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}
function topN(m: Map<string, number>, n: number): [string, number][] {
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

const DEPT_NAMES: Record<string, string> = {
  "75": "Paris",
  "77": "Seine-et-Marne",
  "78": "Yvelines",
  "91": "Essonne",
  "92": "Hauts-de-Seine",
  "93": "Seine-Saint-Denis",
  "94": "Val-de-Marne",
  "95": "Val-d'Oise",
};
// Cartogramme IDF : positions approx. (grille 5×4)
const DEPT_POS: Record<string, { x: number; y: number }> = {
  "95": { x: 2, y: 0 },
  "78": { x: 0, y: 1.5 },
  "93": { x: 3, y: 0.95 },
  "92": { x: 1.25, y: 2 },
  "75": { x: 2.15, y: 2 },
  "77": { x: 4, y: 1.4 },
  "94": { x: 3.05, y: 2.75 },
  "91": { x: 2, y: 3.4 },
};

// ---------------------------------------------------------------------------
// Composants (server, statiques)
// ---------------------------------------------------------------------------
function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="text-3xl font-bold text-slate-900">{value}</div>
      <div className="mt-1 text-sm font-medium text-slate-700">{label}</div>
      {sub ? <div className="mt-0.5 text-xs text-slate-400">{sub}</div> : null}
    </div>
  );
}

function BarList({ data, total }: { data: [string, number][]; total: number }) {
  const max = data.length ? Math.max(...data.map((d) => d[1])) : 1;
  return (
    <div className="flex flex-col gap-2">
      {data.map(([label, n]) => (
        <div key={label} className="flex items-center gap-3 text-sm">
          <div className="w-44 shrink-0 truncate text-slate-600" title={label}>
            {label}
          </div>
          <div className="h-4 flex-1 rounded bg-slate-100">
            <div
              className="h-4 rounded bg-brand"
              style={{ width: `${Math.round((n / max) * 100)}%` }}
            />
          </div>
          <div className="w-16 shrink-0 text-right tabular-nums text-slate-700">
            {n}
            <span className="ml-1 text-xs text-slate-400">
              {total ? `${Math.round((n / total) * 100)}%` : ""}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function IdfMap({ byDept }: { byDept: Map<string, number> }) {
  const counts = [...byDept.values()];
  const max = counts.length ? Math.max(...counts) : 1;
  const cell = 92;
  const gap = 8;
  const cols = 5;
  const rows = 4.4;
  const W = cols * cell;
  const H = rows * cell;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Répartition par département IDF">
      {Object.entries(DEPT_POS).map(([code, pos]) => {
        const n = byDept.get(code) ?? 0;
        const t = max ? n / max : 0;
        // échelle de bleu : clair (peu) -> brand foncé (beaucoup)
        const bg = `rgba(79,70,229,${0.15 + t * 0.8})`;
        const x = pos.x * cell + gap / 2;
        const y = pos.y * cell + gap / 2;
        const size = cell - gap;
        return (
          <g key={code}>
            <title>{`${DEPT_NAMES[code]} (${code}) : ${n} entreprise(s)`}</title>
            <rect x={x} y={y} width={size} height={size} rx={12} fill={bg} stroke="#e2e8f0" />
            <text x={x + size / 2} y={y + size / 2 - 6} textAnchor="middle" fontSize="20" fontWeight="700" fill={t > 0.5 ? "#fff" : "#312e81"}>
              {code}
            </text>
            <text x={x + size / 2} y={y + size / 2 + 16} textAnchor="middle" fontSize="15" fontWeight="700" fill={t > 0.5 ? "#fff" : "#334155"}>
              {n}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function RecrutupPage() {
  const { prospects, leads, sends, sendsTableExists, err } = await load();

  const total = prospects.length;
  const withEmail = prospects.filter((p) => p.has_email).length;
  const mxValid = prospects.filter((p) => p.email_mx_valide).length;
  const totalOffres = prospects.reduce((s, p) => s + (p.nb_offres ?? 0), 0);

  const byDept = countBy(prospects, (p) => p.departement);
  const bySecteur = new Map<string, number>();
  for (const p of prospects) for (const s of p.secteurs ?? []) bySecteur.set(s, (bySecteur.get(s) ?? 0) + 1);

  const chaud = prospects.filter((p) => (p.score_max ?? 0) >= 85).length;
  const tiede = prospects.filter((p) => (p.score_max ?? 0) >= 60 && (p.score_max ?? 0) < 85).length;
  const froid = prospects.filter((p) => (p.score_max ?? 0) < 60).length;

  const hotList = prospects
    .filter((p) => p.has_email)
    .slice(0, 25);

  const sent = sends.length;
  const bounced = sends.filter((s) => s.statut === "bounce" || s.statut === "erreur").length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">🚀 Recrut&apos;up — pilotage</h1>
        <p className="text-sm text-slate-500">
          Programme recrutement-par-la-formation (Île-de-France). Prospects détectés, comptes chauds,
          leads entrants et suivi de campagne.
        </p>
      </div>

      {err ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Impossible de charger une partie des données Recrut&apos;up : {err}
        </div>
      ) : null}

      {/* KPI */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <Kpi label="Entreprises détectées" value={String(total)} sub="qui recrutent en IDF" />
        <Kpi label="Avec email" value={String(withEmail)} sub={`${mxValid} MX-valides`} />
        <Kpi label="Offres suivies" value={String(totalOffres)} sub="postes en tension" />
        <Kpi label="Comptes chauds" value={String(chaud)} sub="score ≥ 85" />
        <Kpi label="Leads entrants" value={String(leads.length)} sub="formulaire landing" />
        <Kpi label="Emails envoyés" value={String(sent)} sub={bounced ? `${bounced} en échec` : "campagne gatée"} />
      </div>

      {/* Carte IDF + secteurs */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 text-sm font-semibold text-slate-800">Répartition géographique (IDF)</div>
          <IdfMap byDept={byDept} />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 text-sm font-semibold text-slate-800">Top secteurs en tension</div>
          <BarList data={topN(bySecteur, 8)} total={total} />
        </div>
      </div>

      {/* Score + campagne */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 text-sm font-semibold text-slate-800">Chaleur des comptes</div>
          <BarList
            data={[
              [`Chauds (score ≥ 85)`, chaud],
              [`Tièdes (60–84)`, tiede],
              [`Froids (< 60)`, froid],
            ]}
            total={total}
          />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 text-sm font-semibold text-slate-800">Suivi de campagne</div>
          {!sendsTableExists ? (
            <p className="text-sm text-slate-500">
              Le suivi d&apos;envois s&apos;activera dès la création de la table{" "}
              <code className="rounded bg-slate-100 px-1">ref.recrutup_sends</code> et le lancement de la
              campagne (aujourd&apos;hui gatée).
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-2xl font-bold text-slate-900">{sent}</div>
                <div className="text-xs text-slate-500">envoyés</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900">{leads.length}</div>
                <div className="text-xs text-slate-500">leads reçus</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900">
                  {sent ? `${Math.round((leads.length / sent) * 100)}%` : "—"}
                </div>
                <div className="text-xs text-slate-500">taux de réponse</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Comptes chauds */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-3 text-sm font-semibold text-slate-800">
          Comptes chauds — top 25 (avec email exploitable)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="py-2 pr-3">Entreprise</th>
                <th className="py-2 pr-3">Dépt</th>
                <th className="py-2 pr-3">Score</th>
                <th className="py-2 pr-3">Offres</th>
                <th className="py-2 pr-3">Secteur</th>
                <th className="py-2 pr-3">Email</th>
              </tr>
            </thead>
            <tbody>
              {hotList.map((p, i) => (
                <tr key={`${p.siren ?? i}`} className="border-b border-slate-100">
                  <td className="py-2 pr-3 font-medium text-slate-800">{p.entreprise ?? "—"}</td>
                  <td className="py-2 pr-3 text-slate-600">{p.departement ?? "—"}</td>
                  <td className="py-2 pr-3 tabular-nums text-slate-700">{p.score_max ?? "—"}</td>
                  <td className="py-2 pr-3 tabular-nums text-slate-600">{p.nb_offres ?? "—"}</td>
                  <td className="py-2 pr-3 text-slate-500">{p.secteurs?.[0] ?? "—"}</td>
                  <td className="py-2 pr-3 text-slate-600">{p.email_principal ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Leads entrants */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-3 text-sm font-semibold text-slate-800">
          Leads entrants (formulaire landing) — {leads.length}
        </div>
        {leads.length === 0 ? (
          <p className="text-sm text-slate-500">
            Aucun lead pour l&apos;instant. Ils apparaîtront ici dès que la landing sera diffusée.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Entreprise</th>
                  <th className="py-2 pr-3">Ville</th>
                  <th className="py-2 pr-3">Profils</th>
                  <th className="py-2 pr-3">Dispositif</th>
                  <th className="py-2 pr-3">Email</th>
                </tr>
              </thead>
              <tbody>
                {leads.slice(0, 30).map((l) => (
                  <tr key={l.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 text-slate-500">{fmtDate(l.created_at)}</td>
                    <td className="py-2 pr-3 font-medium text-slate-800">{l.entreprise ?? "—"}</td>
                    <td className="py-2 pr-3 text-slate-600">{l.ville ?? "—"}</td>
                    <td className="py-2 pr-3 tabular-nums text-slate-600">{l.nb_profils ?? "—"}</td>
                    <td className="py-2 pr-3 text-slate-500">{l.dispositif ?? "—"}</td>
                    <td className="py-2 pr-3 text-slate-600">{l.email ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
