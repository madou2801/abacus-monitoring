import Link from "next/link";
import { crm } from "@/lib/supabase";
import { STAGES, FINANCEUR_LABEL } from "@/lib/labels";
import { KanbanBoard } from "./KanbanBoard";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: { financeur?: string } }) {
  const db = crm();
  const financeur = searchParams.financeur ?? "";

  let query = db
    .from("vw_beneficiary_enriched")
    .select("id, first_name, last_name, phone, email, financeur, pipeline_stage, auto_ecole_id, ae_match_needs_review, motif, montant_devis_cents")
    .order("stage_changed_at", { ascending: false })
    .limit(2000);
  if (financeur) query = query.eq("financeur", financeur);

  const [rowsRes, aesRes] = await Promise.all([
    query,
    db.from("auto_ecoles").select("id, raison_sociale, nom"),
  ]);
  const aeName: Record<string, string> = {};
  for (const a of aesRes.data ?? []) aeName[a.id] = a.raison_sociale ?? a.nom;
  const rows = rowsRes.data ?? [];

  const byStage: Record<string, any[]> = {};
  const centsByStage: Record<string, number> = {};
  for (const s of STAGES) { byStage[s.code] = []; centsByStage[s.code] = 0; }
  for (const b of rows) {
    (byStage[b.pipeline_stage] ??= []).push(b);
    centsByStage[b.pipeline_stage] = (centsByStage[b.pipeline_stage] ?? 0) + (b.montant_devis_cents ?? 0);
  }

  return (
    <div className="flex h-screen flex-col p-6 lg:p-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pipeline</h1>
          <p className="text-sm text-slate-500">
            {rows.length} bénéficiaires · parcours DMAIC · <span className="text-slate-400">glissez une carte pour changer d'étape</span>
          </p>
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

      <KanbanBoard initial={byStage} aeName={aeName} centsByStage={centsByStage} />
    </div>
  );
}
