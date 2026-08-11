import { getSitesTraffic, type SiteTraffic } from "@/lib/gsc";

// Cache 1h : évite de solliciter GSC à chaque affichage.
export const revalidate = 3600;

function pct(a: number, b: number): number {
  if (!b) return a ? 100 : 0;
  return Math.round(((a - b) / b) * 100);
}

function Trend({ v }: { v: number }) {
  const color = v > 0 ? "text-emerald-600" : v < 0 ? "text-rose-600" : "text-slate-400";
  const arrow = v > 0 ? "▲" : v < 0 ? "▼" : "=";
  return (
    <span className={`text-sm font-semibold ${color}`}>
      {arrow} {v > 0 ? "+" : ""}
      {v}%
    </span>
  );
}

function MonthlyBars({ monthly }: { monthly: SiteTraffic["monthly"] }) {
  const max = Math.max(1, ...monthly.map((m) => m.clicks));
  return (
    <div className="flex items-end gap-1.5 h-20">
      {monthly.map((m) => (
        <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
          <div className="text-[10px] font-medium text-slate-500">{m.clicks}</div>
          <div
            className="w-full rounded-t bg-brand/70"
            style={{ height: `${Math.max(3, (m.clicks / max) * 56)}px` }}
            title={`${m.month} : ${m.clicks} clics, ${m.impressions} impr`}
          />
          <div className="text-[10px] text-slate-400">{m.month.slice(2)}</div>
        </div>
      ))}
    </div>
  );
}

function SiteCard({ s }: { s: SiteTraffic }) {
  const cClics = pct(s.cur.clicks, s.prev.clicks);
  const cImpr = pct(s.cur.impressions, s.prev.impressions);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">{s.label}</h2>
        <span className="text-xs text-slate-400">28 jours vs 28 précédents</span>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-xs text-slate-500">Clics</div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{s.cur.clicks}</span>
            <Trend v={cClics} />
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-xs text-slate-500">Impressions</div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{s.cur.impressions.toLocaleString("fr-FR")}</span>
            <Trend v={cImpr} />
          </div>
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-1 text-xs font-medium text-slate-500">Clics / mois (7 mois)</div>
        <MonthlyBars monthly={s.monthly} />
      </div>

      {s.zones.length > 0 && (
        <div className="mb-4">
          <div className="mb-1.5 text-xs font-medium text-slate-500">Zones (par clics, 28j)</div>
          <div className="flex flex-wrap gap-1.5">
            {s.zones.map((z) => (
              <span key={z.country} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                {z.country} <b>{z.clicks}</b>
                <span className="text-slate-400"> / {z.impressions}i</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {s.quickWins.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-medium text-slate-500">
            🎯 Quick wins (position 6-20, à pousser vers le top 3)
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400">
                <th className="py-1">Requête</th>
                <th className="py-1 text-right">Pos.</th>
                <th className="py-1 text-right">Impr.</th>
                <th className="py-1 text-right">Clics</th>
              </tr>
            </thead>
            <tbody>
              {s.quickWins.map((q) => (
                <tr key={q.query} className="border-t border-slate-100">
                  <td className="py-1.5 pr-2 text-slate-700">{q.query}</td>
                  <td className="py-1.5 text-right font-medium text-slate-600">{q.position.toFixed(0)}</td>
                  <td className="py-1.5 text-right text-slate-500">{q.impressions}</td>
                  <td className="py-1.5 text-right text-slate-500">{q.clicks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default async function Page() {
  let sites: SiteTraffic[] = [];
  let error = "";
  try {
    sites = await getSitesTraffic();
  } catch (e: any) {
    error = e?.message ?? "Erreur GSC";
  }

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Suivi des sites</h1>
        <p className="text-sm text-slate-500">
          Trafic Google Search Console (recherche organique) — mis à jour toutes les heures.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Impossible de charger les données GSC : {error}
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {sites.map((s) => (
            <SiteCard key={s.label} s={s} />
          ))}
        </div>
      )}
    </div>
  );
}
