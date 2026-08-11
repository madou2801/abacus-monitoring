import { gaia, dateFr } from "@/lib/supabase";

// ZYVARA Factory — vue de suivi global (lecture seule).
// La factory est pilotée en CLI (collect/score/promote/kit) : ce tableau NE promeut
// et NE publie rien. Il reflète l'état poussé par le cron hebdo (commande `sync`).
export const dynamic = "force-dynamic";

const PROMO_THRESHOLD = 19; // config.yaml scoring.promotion_threshold
const SLOTS_TOTAL = 3; // config.yaml wip.active_slots

type Row = {
  id: string;
  title: string;
  state: string;
  zone: string | null;
  summary: string | null;
  score_total: number | null;
  voie: string | null;
  q2: { encashment_rail?: string | null; hard_barrier?: string | null; consumer_risk?: string | null } | null;
  blocked_reason: string | null;
  days_to_death: number | null;
  source: string | null;
  synced_at: string | null;
  raw: any;
};

const AXIS_LABEL: Record<string, string> = {
  regulatory_window: "Fenêtre réglementaire",
  monetizability: "Encaissabilité",
  solo_executability: "Exécutabilité solo",
  convergence: "Convergence ZYVARA",
  advantage_durability: "Durée de l'avantage",
};

const COLUMNS = [
  { key: "active", label: "Actifs", hint: "consomment un slot", states: ["active"] },
  { key: "scored", label: "File (scorés)", hint: "en attente de promotion", states: ["scored", "idea"] },
  { key: "blocked_external", label: "Attente tiers", hint: "hors slot, hors horloge", states: ["blocked_external"] },
  { key: "out", label: "Sortis", hint: "transmis · morts · archivés", states: ["transmis", "mort", "archive"] },
];

// Miroir du gate Python : score au seuil ET 3 champs Q2 ET barrière claire ET pas de risque conso élevé.
function promotable(p: Row): boolean {
  const q = p.q2 ?? {};
  return (
    (p.score_total ?? 0) >= PROMO_THRESHOLD &&
    !!q.encashment_rail &&
    !!q.hard_barrier &&
    String(q.hard_barrier).toLowerCase() === "clear" &&
    q.consumer_risk != null &&
    q.consumer_risk !== "high"
  );
}

function Score({ v }: { v: number | null }) {
  if (v == null) return <span className="text-slate-400">—</span>;
  const color = v >= PROMO_THRESHOLD ? "text-emerald-600" : v >= 14 ? "text-amber-600" : "text-slate-500";
  return <span className={`font-semibold ${color}`}>{v}/30</span>;
}

function Info({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <span className="w-28 shrink-0 text-slate-400">{label}</span>
      <span className="text-slate-600">{value}</span>
    </div>
  );
}

function Card({ p }: { p: Row }) {
  const canPromote = p.state === "scored" && promotable(p);
  const dead = p.days_to_death;
  const axes: Array<{ axis: string; raw: number; weight: number; justification?: string }> =
    p.raw?.score?.axes ?? [];
  const q = p.q2 ?? {};
  return (
    <details className="group rounded-lg border border-slate-200 bg-white shadow-sm transition open:border-brand/40 open:shadow">
      <summary className="flex cursor-pointer list-none flex-col gap-2 p-3 [&::-webkit-details-marker]:hidden">
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm font-medium leading-snug text-slate-900">{p.title}</div>
          <div className="flex shrink-0 items-center gap-1">
            {p.voie && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                voie {p.voie}
              </span>
            )}
            <span className="text-slate-300 transition group-open:rotate-180">▾</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <Score v={p.score_total} />
          {p.zone && <span>· {p.zone}</span>}
          {dead != null && (
            <span className={dead <= 2 ? "font-semibold text-rose-600" : dead <= 7 ? "text-amber-600" : "text-slate-500"}>
              · ⏳ {dead} j
            </span>
          )}
          {canPromote && (
            <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              ✓ promouvable
            </span>
          )}
        </div>
        {p.blocked_reason && <div className="text-xs italic text-slate-500">« {p.blocked_reason} »</div>}
      </summary>

      <div className="space-y-3 border-t border-slate-100 px-3 py-3 text-xs">
        {p.summary && <p className="leading-relaxed text-slate-600">{p.summary}</p>}

        {axes.length > 0 && (
          <div className="space-y-1.5">
            <div className="font-semibold text-slate-500">Notation (5 axes)</div>
            {axes.map((a) => (
              <div key={a.axis}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-600">{AXIS_LABEL[a.axis] ?? a.axis}</span>
                  <span className="tabular-nums text-slate-400">
                    {a.raw}/5 <span className="text-slate-300">× {a.weight}</span>
                  </span>
                </div>
                {a.justification && <div className="text-slate-400">{a.justification}</div>}
              </div>
            ))}
          </div>
        )}

        {(q.encashment_rail || q.hard_barrier || q.consumer_risk) && (
          <div className="space-y-1">
            <div className="font-semibold text-slate-500">Champs Q2</div>
            <Info label="Rail d'encaissement" value={q.encashment_rail} />
            <Info label="Barrière dure" value={q.hard_barrier} />
            <Info label="Risque conso" value={q.consumer_risk} />
          </div>
        )}

        <div className="space-y-1">
          <Info label="Source" value={p.source} />
          <Info label="Zone" value={p.zone} />
          <Info label="État" value={p.state} />
        </div>
      </div>
    </details>
  );
}

export default async function Page() {
  let rows: Row[] = [];
  let err: string | null = null;
  try {
    const { data, error } = await gaia()
      .from("zyvara_factory_projects")
      .select("id, title, state, zone, summary, score_total, voie, q2, blocked_reason, days_to_death, source, synced_at, raw")
      .order("score_total", { ascending: false, nullsFirst: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    rows = (data ?? []) as Row[];
  } catch (e: any) {
    err = e?.message ?? String(e);
  }

  const byState: Record<string, Row[]> = {};
  for (const r of rows) (byState[r.state] ??= []).push(r);
  const count = (states: string[]) => states.reduce((n, s) => n + (byState[s]?.length ?? 0), 0);
  const slotsUsed = count(["active"]);
  const lastSync = rows.map((r) => r.synced_at).filter(Boolean).sort().at(-1) ?? null;

  return (
    <div className="flex min-h-screen flex-col p-6 lg:p-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">🏭 Internal Factory</h1>
          <p className="text-sm text-slate-500">
            Suivi global des opportunités ZYVARA · lecture seule (pilotage en CLI) ·{" "}
            <span className="text-slate-400">dernière synchro {lastSync ? dateFr(lastSync) : "—"}</span>
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-1.5">
            Slots <span className="font-bold text-slate-900">{slotsUsed}/{SLOTS_TOTAL}</span>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-1.5">
            File <span className="font-bold text-slate-900">{count(["scored", "idea"])}</span>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-1.5">
            Attente tiers <span className="font-bold text-slate-900">{count(["blocked_external"])}</span>
          </div>
        </div>
      </div>

      {err ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          <div className="font-semibold">Suivi indisponible pour le moment.</div>
          <p className="mt-1">
            La table <code>zyvara_factory_projects</code> (Gaia) est introuvable ou les accès ne sont pas
            configurés. Elle se remplit au premier <code>sync</code> du cron hebdo.
          </p>
          <p className="mt-2 text-xs text-amber-700/80">Détail technique : {err}</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Aucun projet synchronisé pour l'instant. Le cron hebdo alimentera ce tableau.
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const items = col.states.flatMap((s) => byState[s] ?? []);
            return (
              <div key={col.key} className="flex flex-col rounded-xl bg-slate-50 p-3">
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <div className="text-sm font-semibold text-slate-700">{col.label}</div>
                  <div className="text-xs text-slate-400">{items.length}</div>
                </div>
                <div className="px-1 pb-2 text-[11px] text-slate-400">{col.hint}</div>
                <div className="flex flex-col gap-2">
                  {items.map((p) => <Card key={p.id} p={p} />)}
                  {items.length === 0 && <div className="px-1 text-xs text-slate-300">vide</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
