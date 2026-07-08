import { crm, dateFr } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function Page() {
  const db = crm();
  const [coRes, benefRes] = await Promise.all([
    db.from("companies").select("*").order("raison_sociale", { ascending: true }).limit(500),
    db.from("beneficiaries").select("company_id").not("company_id", "is", null),
  ]);
  const companies = coRes.data ?? [];

  const salaries: Record<string, number> = {};
  for (const b of benefRes.data ?? []) {
    if (b.company_id) salaries[b.company_id] = (salaries[b.company_id] ?? 0) + 1;
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">Entreprises</h1>
        <p className="text-sm text-slate-500">
          {companies.length} entreprise(s) — financement OPCO / employeur, devis et factures au nom de l'entreprise.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Entreprise</th>
              <th className="px-4 py-2">SIRET</th>
              <th className="px-4 py-2">Contact</th>
              <th className="px-4 py-2">OPCO</th>
              <th className="px-4 py-2">Ville</th>
              <th className="px-4 py-2">Salariés</th>
              <th className="px-4 py-2">Créée le</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {companies.map((c: any) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-2">
                  <div className="font-medium text-slate-800">{c.raison_sociale}</div>
                  <div className="text-xs text-slate-400">{[c.email, c.telephone].filter(Boolean).join(" · ")}</div>
                </td>
                <td className="px-4 py-2 text-slate-600">{c.siret ?? "—"}</td>
                <td className="px-4 py-2 text-slate-600">
                  {[c.contact_prenom, c.contact_nom].filter(Boolean).join(" ") || "—"}
                  {c.contact_fonction && <div className="text-xs text-slate-400">{c.contact_fonction}</div>}
                </td>
                <td className="px-4 py-2 text-slate-600">{c.opco ?? "—"}</td>
                <td className="px-4 py-2 text-slate-600">{[c.code_postal, c.ville].filter(Boolean).join(" ") || "—"}</td>
                <td className="px-4 py-2 font-medium text-slate-800">{salaries[c.id] ?? 0}</td>
                <td className="px-4 py-2 text-xs text-slate-500">{dateFr(c.created_at)}</td>
              </tr>
            ))}
            {companies.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  Aucune entreprise. Elles se créent automatiquement via l'intake (devis entreprise / OPCO).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
