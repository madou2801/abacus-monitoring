import { Nav } from "@/components/Nav";
import { getStaffUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const staff = await getStaffUser();

  // Authentifié (middleware) mais pas dans crm.app_users → accès refusé (empêche
  // les comptes bénéficiaires d'entrer). Pas de redirect (éviterait une boucle avec /login).
  if (!staff) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="text-lg font-semibold text-slate-900">Accès refusé</div>
          <p className="mt-2 text-sm text-slate-500">Ce compte n'est pas autorisé à accéder au super-CRM.</p>
          <form action="/auth/signout" method="post" className="mt-4">
            <button className="rounded-md bg-slate-800 px-4 py-2 text-sm text-white">Se déconnecter</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white p-4 md:flex">
        <div className="mb-6 px-2">
          <div className="text-lg font-bold text-slate-900">Super-CRM</div>
          <div className="text-xs text-slate-500">MonPermisCPF</div>
        </div>
        <Nav />
        <div className="mt-auto border-t border-slate-100 pt-3">
          <div className="px-2 text-sm font-medium text-slate-700">{staff.full_name ?? staff.email}</div>
          <div className="px-2 text-[10px] uppercase text-slate-400">{staff.role}</div>
          <form action="/auth/signout" method="post" className="mt-2 px-2">
            <button className="text-xs text-slate-500 hover:text-rose-600">Se déconnecter</button>
          </form>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
