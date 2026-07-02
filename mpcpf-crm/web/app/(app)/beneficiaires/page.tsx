import Link from "next/link";
import { crm } from "@/lib/supabase";
import { STAGES, STAGE_LABEL, STAGE_COLOR, FINANCEUR_LABEL, CONFIDENCE } from "@/lib/labels";

export const dynamic = "force-dynamic";

type SP = { q?: string; stage?: string; financeur?: string; review?: string };

export default async function Page({ searchParams }: { searchParams: SP }) {
  const db = crm();
  const q = (searchParams.q ?? "").trim();
  const stage = searchParams.stage ?? "";
  const financeur = searchParams.financeur ?? "";
  const review = searchParams.review === "1";

  let query = db
    .from("beneficiaries")
    .select(
      "id, first_name, last_name, email, phone, pipeline_stage, financeur, ae_match_confidence, ae_match_needs_review, auto_ecole_id, company_id",
    )
    .order("stage_changed_at", { ascending: false })
    .limit(300);
  if (q) query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`);
  if (stage) query = query.eq("pipeline_stage", stage);
  if (financeur) query = query.eq("financeur", financeur);
  if (review) query = query.eq("ae_match_needs_review", true);

  const [rowsRes, aesRes, cosRes] = await Promise.all([
    query,
    db.from("auto_ecoles").select("id, raison_sociale, nom"),
    db.from("companies").select("id, raison_sociale"),
  ]);
  const aeName = new Map((aesRes.data ?? []).map((a: any) => [a.id, a.raison_sociale ?? a.nom]));
  const coName = new Map((cosRes.data ?? []).map((c: any) => [c.id, c.raison_sociale]));
  const list = rowsRes.data ?? [];

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bénéficiaires</h1>
          <p className="text-sm text-slate-500">{list.length} résultat(s){list.length >= 300 ? " (limité à 300)" : ""}</p>
        </div>
      </div>

      <form className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="flex flex-col text-xs text-slate-500">
          Recherche
          <input name="q" defaultValue={q} placeholder="nom, prénom, email…"
            className="mt-1 w-64 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-800" />
        </label>
        <label className="flex flex-col text-xs text-slate-500">
          Étape
          <select name="stage" defaultValue={stage} className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm">
            <option value="">Toutes</option>
            {STAGES.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-xs text-slate-500">
          Financeur
          <select name="financeur" defaultValue={financeur} className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm">
            <option value="">Tous</option>
            {Object.entries(FINANCEUR_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-1.5 text-xs text-slate-600">
          <input type="checkbox" name="review" value="1" defaultChecked={review} /> Matching à confirmer
        </label>
        <button className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white">Filtrer</button>
        <Link href="/beneficiaires" className="pb-1.5 text-sm text-slate-500 hover:underline">Réinitialiser</Link>
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Bénéficiaire</th>
              <th className="px-4 py-2">Étape</th>
              <th className="px-4 py-2">Financeur</th>
              <th className="px-4 py-2">Auto-école</th>
              <th className="px-4 py-2">Entreprise</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((b: any) => (
              <tr key={b.id} className="hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link href={`/beneficiaires/${b.id}`} className="font-medium text-brand hover:underline">
                    {[b.first_name, b.last_name].filter(Boolean).join(" ") || "—"}
                  </Link>
                  <div className="text-xs text-slate-400">{b.email ?? b.phone ?? ""}</div>
                </td>
                <td className="px-4 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${STAGE_COLOR[b.pipeline_stage] ?? "bg-slate-100"}`}>
                    {STAGE_LABEL[b.pipeline_stage] ?? b.pipeline_stage}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-600">{FINANCEUR_LABEL[b.financeur] ?? "—"}</td>
                <td className="px-4 py-2 text-slate-600">
                  {b.auto_ecole_id ? (
                    <span>
                      {aeName.get(b.auto_ecole_id) ?? "—"}
                      {b.ae_match_needs_review && (
                        <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${CONFIDENCE[b.ae_match_confidence]?.color ?? ""}`}>
                          à confirmer
                        </span>
                      )}
                    </span>
                  ) : "—"}
                </td>
                <td className="px-4 py-2 text-slate-600">{b.company_id ? coName.get(b.company_id) ?? "—" : "—"}</td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Aucun bénéficiaire.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
