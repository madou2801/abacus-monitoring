import Link from "next/link";
import { crm, euros, dateFr } from "@/lib/supabase";
import { INVOICE_STATUS, FINANCEUR_LABEL } from "@/lib/labels";
import { InvoiceActions } from "./InvoiceActions";

export const dynamic = "force-dynamic";

const CHANNEL_FR: Record<string, string> = {
  wedof: "Wedof (CPF)",
  france_travail: "France Travail",
  opco: "OPCO",
  facture_directe: "Facture directe",
  stripe: "Stripe",
};

export default async function Page({ searchParams }: { searchParams: { status?: string } }) {
  const db = crm();
  const status = searchParams.status ?? "";

  let query = db
    .from("vw_facturation")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (status) query = query.eq("status", status);

  const [invRes, funnelRes] = await Promise.all([
    query,
    db.from("vw_facturation_funnel").select("*"),
  ]);
  const invoices = invRes.data ?? [];
  const funnel = funnelRes.data ?? [];

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">Facturation</h1>
        <p className="text-sm text-slate-500">
          Cycle de vie des factures tous financeurs (le CPF reste facturé par Wedof, suivi ici via les références externes).
        </p>
      </div>

      {/* Entonnoir par statut (cliquable = filtre) */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {funnel.map((f: any) => (
          <Link
            key={f.status}
            href={status === f.status ? "/facturation" : `/facturation?status=${f.status}`}
            className={`rounded-xl border bg-white p-3 transition hover:border-brand ${status === f.status ? "border-brand ring-1 ring-brand/30" : "border-slate-200"}`}
          >
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${INVOICE_STATUS[f.status]?.color ?? "bg-slate-100"}`}>
              {INVOICE_STATUS[f.status]?.label ?? f.status}
            </span>
            <div className="mt-2 text-xl font-bold text-slate-900">{f.count}</div>
            <div className="text-xs text-slate-500">{euros(f.total_cents)}</div>
          </Link>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Bénéficiaire</th>
              <th className="px-4 py-2">Financeur / canal</th>
              <th className="px-4 py-2">Montant</th>
              <th className="px-4 py-2">Statut</th>
              <th className="px-4 py-2">Échéance</th>
              <th className="px-4 py-2">Réf. externe</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoices.map((i: any) => (
              <tr key={i.id} className="hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link href={`/beneficiaires/${i.beneficiary_id}`} className="font-medium text-brand hover:underline">
                    {[i.first_name, i.last_name].filter(Boolean).join(" ") || i.email || "Sans nom"}
                  </Link>
                  {i.formation_label && <div className="text-xs text-slate-400">{i.formation_label}</div>}
                </td>
                <td className="px-4 py-2 text-slate-600">
                  {FINANCEUR_LABEL[i.financeur] ?? i.financeur}
                  <div className="text-xs text-slate-400">{CHANNEL_FR[i.channel] ?? i.channel}</div>
                </td>
                <td className="px-4 py-2 font-medium text-slate-800">{euros(i.amount_cents)}</td>
                <td className="px-4 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${INVOICE_STATUS[i.status]?.color ?? "bg-slate-100"}`}>
                    {INVOICE_STATUS[i.status]?.label ?? i.status}
                  </span>
                  {i.days_overdue > 0 && (
                    <div className="mt-0.5 text-xs font-medium text-rose-600">{i.days_overdue} j de retard</div>
                  )}
                </td>
                <td className="px-4 py-2 text-slate-600">{dateFr(i.due_date)}</td>
                <td className="px-4 py-2 text-xs text-slate-500">{i.external_ref ?? "—"}</td>
                <td className="px-4 py-2">
                  <InvoiceActions invoiceId={i.id} status={i.status} />
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  {status ? "Aucune facture avec ce statut." : "Aucune facture (elles se créent automatiquement à la certification Wedof, ou via la fiche bénéficiaire)."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
