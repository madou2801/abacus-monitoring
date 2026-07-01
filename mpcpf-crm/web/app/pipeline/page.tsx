import Link from "next/link";
import { crm } from "@/lib/supabase";
import { STAGES, FINANCEUR_LABEL } from "@/lib/labels";

export const dynamic = "force-dynamic";

const PER_COLUMN = 40;

// Teinte d'en-tête par étape (dégradé de l'entonnoir).
const HEAD: Record<string, string> = {
  lead: "border-slate-300",
  contact_etabli: "border-sky-300",
  qualifie: "border-indigo-300",
  inscrit: "border-violet-300",
  en_formation: "border-amber-300",
  certifie: "border-emerald-300",
  perdu: "border-rose-300",
};

export default async function Page({ searchParams }: { searchParams: { financeur?: string } }) {
  const db = crm();
  const financeur = searchParams.financeur ?? "";

  let query = db
    .from("beneficiaries")
    .select("id, first_name, last_name, financeur, pipeline_stage, auto_ecole_id, ae_match_needs_review")
    .order("stage_changed_at", { ascending: false })
    .limit(2000);
  if (financeur) query = query.eq("financeur", financeur);

  const [rowsRes, aesRes] = await Promise.all([
    query,
    db.from("auto_ecoles").select("id, raison_sociale, nom"),
  ]);
  const aeName = new Map((aesRes.data ?? []).map((a: any) => [a.id, a.raison_sociale ?? a.nom]));
  const rows = rowsRes.data ?? [];

  const byStage: Record<string, any[]> = {};
  for (const b of rows) (byStage[b.pipeline_stage] ??= []).push(b);

  return (
    <div className="flex h-screen flex-col p-6 lg:p-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pipeline</h1>
          <p className="text-sm text-slate-500">{rows.length} bénéficiaires · parcours DMAIC</p>
        </div>
        <form className="flex items-end gap-2">
          <label className="flex flex-col text-xs text-slate-500">
            Financeur
            <select name="financeur" defaultValue={financeur} className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm">
              <option value="">Tous</option>
              {Object.entries(FINANCEUR_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <button className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white">Filtrer</button>
          {financeur && <Link href="/pipeline" className="pb-1.5 text-sm text-slate-500 hover:underline">×</Link>}
        </form>
      </div>

      <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
        {STAGES.map((s) => {
          const items = byStage[s.code] ?? [];
          return (
            <div key={s.code} className="flex w-72 shrink-0 flex-col">
              <div className={`mb-2 flex items-center justify-between border-b-2 ${HEAD[s.code] ?? "border-slate-300"} pb-2`}>
                <span className="text-sm font-semibold text-slate-700">{s.label}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{items.length}</span>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                {items.slice(0, PER_COLUMN).map((b: any) => (
                  <Link
                    key={b.id}
                    href={`/beneficiaires/${b.id}`}
                    className="block rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm transition hover:border-brand hover:shadow"
                  >
                    <div className="font-medium text-slate-800">
                      {[b.first_name, b.last_name].filter(Boolean).join(" ") || "—"}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                      <span>{FINANCEUR_LABEL[b.financeur] ?? "—"}</span>
                      {b.auto_ecole_id && (
                        <span className="truncate pl-2 text-right text-slate-400">
                          {aeName.get(b.auto_ecole_id) ?? ""}
                          {b.ae_match_needs_review && <span className="ml-1 text-amber-500">•</span>}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
                {items.length > PER_COLUMN && (
                  <div className="pt-1 text-center text-xs text-slate-400">+ {items.length - PER_COLUMN} autres…</div>
                )}
                {items.length === 0 && <div className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-xs text-slate-300">—</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
