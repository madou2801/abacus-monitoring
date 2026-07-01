import { crm, euros } from "@/lib/supabase";
import { STAGES, INVOICE_STATUS } from "@/lib/labels";

export const dynamic = "force-dynamic";

function tally<T extends string>(rows: { [k: string]: any }[], key: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const v = (r[key] ?? "—") as string;
    out[v] = (out[v] ?? 0) + 1;
  }
  return out;
}

export default async function Dashboard() {
  const db = crm();
  const [benef, inv, companies, ae, review] = await Promise.all([
    db.from("beneficiaries").select("pipeline_stage"),
    db.from("invoices").select("status, amount_cents"),
    db.from("companies").select("id", { count: "exact", head: true }),
    db.from("auto_ecoles").select("id", { count: "exact", head: true }),
    db.from("beneficiaries").select("id", { count: "exact", head: true }).eq("ae_match_needs_review", true),
  ]);

  const rows = benef.data ?? [];
  const total = rows.length;
  const byStage = tally(rows, "pipeline_stage");
  const max = Math.max(1, ...STAGES.map((s) => byStage[s.code] ?? 0));
  const certifie = byStage["certifie"] ?? 0;
  const wonRate = total ? Math.round((certifie / total) * 100) : 0;

  const invoices = inv.data ?? [];
  const encaisse = invoices
    .filter((i: any) => i.status === "encaissee")
    .reduce((s: number, i: any) => s + (i.amount_cents ?? 0), 0);
  const invByStatus = tally(invoices, "status");

  return (
    <div className="p-6 lg:p-8">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Tableau de bord</h1>
      <p className="mb-6 text-sm text-slate-500">Vue d'ensemble du parcours bénéficiaire jusqu'à la facturation.</p>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="Bénéficiaires" value={total} />
        <Kpi label="Certifiés" value={certifie} hint={`${wonRate}% du total`} />
        <Kpi label="Entreprises" value={companies.count ?? 0} />
        <Kpi label="Auto-écoles" value={ae.count ?? 0} />
        <Kpi label="Matching à confirmer" value={review.count ?? 0} tone="amber" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Entonnoir du parcours (DMAIC)">
          <div className="space-y-2">
            {STAGES.map((s) => {
              const n = byStage[s.code] ?? 0;
              return (
                <div key={s.code} className="flex items-center gap-3">
                  <div className="w-32 shrink-0 text-sm text-slate-600">{s.label}</div>
                  <div className="flex-1">
                    <div className="h-6 rounded bg-slate-100">
                      <div
                        className="h-6 rounded bg-brand/80"
                        style={{ width: `${(n / max) * 100}%`, minWidth: n ? "1.5rem" : 0 }}
                      />
                    </div>
                  </div>
                  <div className="w-10 text-right text-sm font-semibold text-slate-800">{n}</div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="Facturation">
          <div className="mb-4 rounded-lg bg-emerald-50 p-4">
            <div className="text-xs font-medium text-emerald-700">Encaissé</div>
            <div className="text-2xl font-bold text-emerald-800">{euros(encaisse)}</div>
          </div>
          {invoices.length === 0 ? (
            <p className="text-sm text-slate-400">Aucune facture pour l'instant.</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(invByStatus).map(([st, n]) => (
                <div key={st} className="flex items-center justify-between text-sm">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${INVOICE_STATUS[st]?.color ?? "bg-slate-100"}`}>
                    {INVOICE_STATUS[st]?.label ?? st}
                  </span>
                  <span className="font-semibold">{n}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: "amber" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone === "amber" ? "text-amber-600" : "text-slate-900"}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-4 text-sm font-semibold text-slate-700">{title}</h2>
      {children}
    </div>
  );
}
