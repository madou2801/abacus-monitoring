import Link from "next/link";
import { crm, euros } from "@/lib/supabase";
import { STAGES, INVOICE_STATUS, CHANNELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

function fmtPhoneFr(p?: string | null): string {
  if (!p) return "—";
  const d = p.replace(/\D/g, "");
  let local = d;
  if (d.startsWith("33") && d.length >= 11) local = "0" + d.slice(2);
  if (local.length === 10) return local.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  return p;
}

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
  const [benef, inv, companies, ae, review, todayRes, lateTasks, transfersRes] = await Promise.all([
    db.from("beneficiaries").select("pipeline_stage"),
    db.from("invoices").select("status, amount_cents"),
    db.from("companies").select("id", { count: "exact", head: true }),
    db.from("auto_ecoles").select("id", { count: "exact", head: true }),
    db.from("beneficiaries").select("id", { count: "exact", head: true }).eq("ae_match_needs_review", true),
    db.from("vw_intake_today").select("*").maybeSingle(),
    db.from("tasks").select("id", { count: "exact", head: true })
      .eq("status", "open").lte("due_at", new Date().toISOString()),
    // Transferts conseiller des dernières 48 h = appelants à rappeler (notification CRM).
    db.from("calls").select("id, from_number, started_at")
      .ilike("disconnection_reason", "%transfer%")
      .gte("started_at", new Date(Date.now() - 48 * 3600 * 1000).toISOString())
      .order("started_at", { ascending: false }),
  ]);
  const today = (todayRes.data ?? {}) as any;
  const transfers = (transfersRes.data ?? []) as { id: string; from_number: string | null; started_at: string | null }[];

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

      {transfers.length > 0 && (
        <Link
          href="/appels-retell"
          className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 transition hover:bg-amber-100"
        >
          <span className="text-xl" aria-hidden="true">📞</span>
          <div className="flex-1">
            <div className="font-semibold text-amber-800">
              {transfers.length} transfert{transfers.length > 1 ? "s" : ""} conseiller à rappeler (48 h)
            </div>
            <div className="text-sm tabular-nums text-amber-700">
              {transfers
                .slice(0, 5)
                .map((t) => fmtPhoneFr(t.from_number))
                .join("  ·  ")}
              {transfers.length > 5 ? "  …" : ""}
            </div>
          </div>
          <span className="whitespace-nowrap text-sm font-medium text-amber-800">Voir les appels →</span>
        </Link>
      )}

      {/* ---- Aujourd'hui (temps réel, dédupliqué par personne) ---- */}
      <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Aujourd'hui</h2>
          <span className="text-[11px] text-slate-400">temps réel · dédupliqué · sync ≤ 10 min</span>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <IntakeBlock title="Demandes du jour" total={today.demandes_total ?? 0} prefix="demandes" data={today} tone="brand" />
          <IntakeBlock title="Devis validés du jour" total={today.valides_total ?? 0} prefix="valides" data={today} tone="emerald" />
        </div>
        <p className="mt-3 text-[11px] text-slate-400">
          Total = bénéficiaires uniques (un même contact FT + formulaire + email compté une seule fois).
          Les compteurs par canal peuvent additionner plus que le total si un contact est multicanal.
        </p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-6">
        <Kpi label="Bénéficiaires" value={total} href="/beneficiaires" />
        <Kpi label="Service fait" value={certifie} hint={`${wonRate}% du total`} href="/beneficiaires?stage=certifie" />
        <Kpi label="Entreprises" value={companies.count ?? 0} href="/entreprises" />
        <Kpi label="Auto-écoles" value={ae.count ?? 0} />
        <Kpi label="Matching à confirmer" value={review.count ?? 0} tone="amber" href="/beneficiaires?review=1" />
        <Kpi label="Tâches en retard" value={lateTasks.count ?? 0} tone="amber" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Entonnoir du parcours (DMAIC)">
          <div className="space-y-2">
            {STAGES.map((s) => {
              const n = byStage[s.code] ?? 0;
              return (
                <Link key={s.code} href={`/beneficiaires?stage=${s.code}`}
                  className="flex items-center gap-3 rounded px-1 py-0.5 transition hover:bg-slate-50"
                  title={`Voir les bénéficiaires « ${s.label} »`}>
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
                </Link>
              );
            })}
          </div>
        </Card>

        <Card title="Facturation">
          <Link href="/facturation?status=encaissee" className="mb-4 block rounded-lg bg-emerald-50 p-4 transition hover:bg-emerald-100">
            <div className="text-xs font-medium text-emerald-700">Encaissé</div>
            <div className="text-2xl font-bold text-emerald-800">{euros(encaisse)}</div>
          </Link>
          {invoices.length === 0 ? (
            <p className="text-sm text-slate-400">Aucune facture pour l'instant.</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(invByStatus).map(([st, n]) => (
                <Link key={st} href={`/facturation?status=${st}`}
                  className="flex items-center justify-between rounded px-1 py-0.5 text-sm transition hover:bg-slate-50">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${INVOICE_STATUS[st]?.color ?? "bg-slate-100"}`}>
                    {INVOICE_STATUS[st]?.label ?? st}
                  </span>
                  <span className="font-semibold">{n}</span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function IntakeBlock({
  title, total, prefix, data, tone,
}: { title: string; total: number; prefix: string; data: any; tone: "brand" | "emerald" }) {
  const big = tone === "emerald" ? "text-emerald-700" : "text-brand";
  const jour = prefix; // "demandes" | "valides" — filtre correspondant côté liste
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
      <Link href={`/beneficiaires?jour=${jour}`} className="flex items-baseline justify-between rounded px-1 transition hover:bg-white/70"
        title="Voir les dossiers correspondants">
        <span className="text-xs font-medium text-slate-500">{title}</span>
        <span className={`text-3xl font-bold ${big}`}>{total}</span>
      </Link>
      <div className="mt-3 space-y-1.5">
        {CHANNELS.filter((c) => c.code !== "autre" || (data[`${prefix}_autre`] ?? 0) > 0).map((c) => {
          const n = data[`${prefix}_${c.code}`] ?? 0;
          return (
            <Link key={c.code} href={`/beneficiaires?jour=${jour}&canal=${c.code}`}
              className="flex items-center justify-between rounded px-1 py-0.5 text-sm transition hover:bg-white/70">
              <span className="text-slate-600"><span className="mr-1">{c.icon}</span>{c.label}</span>
              <span className={`font-semibold ${n ? "text-slate-800" : "text-slate-300"}`}>{n}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Kpi({ label, value, hint, tone, href }: {
  label: string; value: number; hint?: string; tone?: "amber"; href?: string;
}) {
  const inner = (
    <>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone === "amber" ? "text-amber-600" : "text-slate-900"}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
    </>
  );
  const cls = "rounded-xl border border-slate-200 bg-white p-4";
  return href
    ? <Link href={href} className={`${cls} block transition hover:border-brand hover:shadow-sm`}>{inner}</Link>
    : <div className={cls}>{inner}</div>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-4 text-sm font-semibold text-slate-700">{title}</h2>
      {children}
    </div>
  );
}
