import { getStaffUser } from "@/lib/auth";
import { crm } from "@/lib/supabase";
import { ChangePassword } from "./ChangePassword";
import { AddMember } from "./AddMember";

export const dynamic = "force-dynamic";

export default async function Page() {
  const me = await getStaffUser();
  const isAdmin = me?.role === "admin";
  const members = isAdmin
    ? ((await crm().from("app_users").select("email, full_name, role, active").order("created_at")).data ?? [])
    : [];

  return (
    <div className="max-w-2xl p-6 lg:p-8">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Paramètres</h1>
      <p className="mb-6 text-sm text-slate-500">
        Compte connecté : <b>{me?.email}</b> · rôle <span className="uppercase">{me?.role}</span>
      </p>

      <Card title="Mon mot de passe">
        <ChangePassword />
      </Card>

      {isAdmin ? (
        <>
          <Card title="Ajouter un membre">
            <p className="mb-3 text-sm text-slate-500">
              Crée un accès au CRM : compte + mot de passe temporaire, ajouté à la liste autorisée.
            </p>
            <AddMember />
          </Card>

          <Card title={`Équipe (${members.length})`}>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="pb-2">Membre</th>
                  <th className="pb-2">Rôle</th>
                  <th className="pb-2">Accès</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(members as any[]).map((m) => (
                  <tr key={m.email}>
                    <td className="py-2">
                      <div className="font-medium text-slate-800">{m.full_name ?? m.email}</div>
                      {m.full_name && <div className="text-xs text-slate-400">{m.email}</div>}
                    </td>
                    <td className="py-2 text-slate-600 uppercase text-xs">{m.role}</td>
                    <td className="py-2">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${m.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {m.active ? "Actif" : "Désactivé"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      ) : (
        <Card title="Équipe">
          <p className="text-sm text-slate-400">La gestion des membres est réservée aux administrateurs.</p>
        </Card>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">{title}</h2>
      {children}
    </div>
  );
}
