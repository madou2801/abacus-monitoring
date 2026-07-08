import Link from "next/link";
import { crm, dateFr, dateTimeFr, benefTitle } from "@/lib/supabase";
import { STAGES, STAGE_LABEL, STAGE_COLOR, FINANCEUR_LABEL, CONFIDENCE, LEAD_STATUS } from "@/lib/labels";

export const dynamic = "force-dynamic";

type SP = { q?: string; stage?: string; financeur?: string; review?: string; owner?: string; page?: string };

const PAGE_SIZE = 50;

export default async function Page({ searchParams }: { searchParams: SP }) {
  const db = crm();
  // On retire les caractères significatifs pour PostgREST ( , ( ) * ) : sinon un `q`
  // forgé pourrait injecter des clauses `.or()` arbitraires (filtre injection).
  const q = (searchParams.q ?? "").trim().replace(/[,()*]/g, "");
  const stage = searchParams.stage ?? "";
  const financeur = searchParams.financeur ?? "";
  const review = searchParams.review === "1";
  const owner = (searchParams.owner ?? "").trim().replace(/[,()*]/g, "");
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);

  let query = db
    .from("vw_beneficiary_enriched")
    .select(
      "id, first_name, last_name, email, phone, pipeline_stage, financeur, ae_match_confidence, ae_match_needs_review, auto_ecole_id, date_creation, date_inscription, intitule_formation, code_postal, ville_formation, lead_status, last_activity_at, owner_email",
      { count: "exact" },
    )
    .order("date_creation", { ascending: false, nullsFirst: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (q) query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`);
  if (stage) query = query.eq("pipeline_stage", stage);
  if (financeur) query = query.eq("financeur", financeur);
  if (review) query = query.eq("ae_match_needs_review", true);
  if (owner) query = query.ilike("owner_email", owner);

  const [rowsRes, aesRes, staffRes] = await Promise.all([
    query,
    db.from("auto_ecoles").select("id, raison_sociale, nom"),
    db.from("app_users").select("email").eq("active", true).order("email"),
  ]);
  const aeName = new Map((aesRes.data ?? []).map((a: any) => [a.id, a.raison_sociale ?? a.nom]));
  const list = rowsRes.data ?? [];
  const total = rowsRes.count ?? list.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const staffEmails = (staffRes.data ?? []).map((u: any) => u.email as string);

  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (stage) sp.set("stage", stage);
    if (financeur) sp.set("financeur", financeur);
    if (review) sp.set("review", "1");
    if (owner) sp.set("owner", owner);
    if (p > 1) sp.set("page", String(p));
    const s = sp.toString();
    return `/beneficiaires${s ? `?${s}` : ""}`;
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bénéficiaires</h1>
          <p className="text-sm text-slate-500">
            {total} résultat(s){pageCount > 1 ? ` · page ${page}/${pageCount}` : ""}
          </p>
        </div>
        <Link
          href="/beneficiaires/nouveau"
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          + Nouveau bénéficiaire
        </Link>
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
        <label className="flex flex-col text-xs text-slate-500">
          Propriétaire
          <select name="owner" defaultValue={owner} className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm">
            <option value="">Tous</option>
            {staffEmails.map((e) => <option key={e} value={e}>{e}</option>)}
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
              <th className="px-4 py-2">Créé le</th>
              <th className="px-4 py-2">Formation</th>
              <th className="px-4 py-2">Statut</th>
              <th className="px-4 py-2">Étape</th>
              <th className="px-4 py-2">Financeur</th>
              <th className="px-4 py-2">Dernière act.</th>
              <th className="px-4 py-2">Auto-école</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((b: any) => (
              <tr key={b.id} className="hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link href={`/beneficiaires/${b.id}`} className="font-medium text-brand hover:underline">
                    {benefTitle(b)}
                  </Link>
                  <div className="text-xs text-slate-400">
                    {[
                      [b.first_name, b.last_name].some(Boolean) ? (b.email ?? b.phone) : null,
                      [b.code_postal, b.ville_formation].filter(Boolean).join(" "),
                    ].filter(Boolean).join(" · ")}
                  </div>
                </td>
                <td className="px-4 py-2 text-slate-600">
                  <div>{dateFr(b.date_creation)}</div>
                  {b.date_inscription && (
                    <div className="text-[10px] text-emerald-600">inscrit {dateFr(b.date_inscription)}</div>
                  )}
                </td>
                <td className="px-4 py-2 text-slate-600">{b.intitule_formation ?? "—"}</td>
                <td className="px-4 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${LEAD_STATUS[b.lead_status]?.color ?? "bg-slate-100"}`}>
                    {LEAD_STATUS[b.lead_status]?.label ?? b.lead_status}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${STAGE_COLOR[b.pipeline_stage] ?? "bg-slate-100"}`}>
                    {STAGE_LABEL[b.pipeline_stage] ?? b.pipeline_stage}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-600">{FINANCEUR_LABEL[b.financeur] ?? "—"}</td>
                <td className="px-4 py-2 text-xs text-slate-500">{dateTimeFr(b.last_activity_at)}</td>
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
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Aucun bénéficiaire.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-slate-600 hover:border-brand">
              ← Précédent
            </Link>
          ) : <span />}
          <span className="text-slate-400">Page {page} / {pageCount}</span>
          {page < pageCount ? (
            <Link href={pageHref(page + 1)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-slate-600 hover:border-brand">
              Suivant →
            </Link>
          ) : <span />}
        </div>
      )}
    </div>
  );
}
