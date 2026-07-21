import { pub } from "@/lib/supabase";
import { getStaffUser } from "@/lib/auth";
import { ResetPasswordButton } from "@/components/ResetPasswordButton";

export const dynamic = "force-dynamic";

type AutoEcole = {
  id: string;
  nom: string | null;
  raison_sociale: string | null;
  email: string | null;
  telephone: string | null;
  ville: string | null;
  code_postal: string | null;
  statut: string | null;
  active: boolean | null;
  responsable_prenom: string | null;
  responsable_nom: string | null;
};

export default async function Page() {
  const me = await getStaffUser();
  const isAdmin = me?.role === "admin";

  const { data, error } = await pub()
    .from("auto_ecoles")
    .select(
      "id, nom, raison_sociale, email, telephone, ville, code_postal, statut, active, responsable_prenom, responsable_nom"
    )
    .order("nom", { ascending: true });

  const list = (data ?? []) as AutoEcole[];

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Auto-écoles &amp; moniteurs</h1>
        <p className="text-sm text-slate-500">
          {list.length} compte{list.length > 1 ? "s" : ""} partenaire{list.length > 1 ? "s" : ""} — portail{" "}
          <span className="font-medium">autoecole.monpermiscpf.com</span>
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          Erreur de chargement : {error.message}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Auto-école</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Ville</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Mot de passe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((ae) => {
              const nom = ae.raison_sociale || ae.nom || "—";
              const resp = [ae.responsable_prenom, ae.responsable_nom].filter(Boolean).join(" ");
              return (
                <tr key={ae.id} className="align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{nom}</div>
                    {resp && <div className="text-xs text-slate-500">{resp}</div>}
                    {ae.telephone && <div className="text-xs text-slate-400">{ae.telephone}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{ae.email || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {[ae.code_postal, ae.ville].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        ae.statut === "active"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {ae.statut === "active" ? "Actif" : ae.statut || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin ? (
                      <ResetPasswordButton
                        email={ae.email}
                        cible="autoecole"
                        prenom={ae.responsable_prenom}
                        compact
                      />
                    ) : (
                      <span className="text-xs text-slate-400">admin requis</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && !error && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Aucune auto-école.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
