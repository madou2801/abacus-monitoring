import Link from "next/link";
import { notFound } from "next/navigation";
import { crm, euros, dateFr, dateTimeFr } from "@/lib/supabase";
import { STAGE_LABEL, STAGE_COLOR, INVOICE_STATUS, CONFIDENCE, FINANCEUR_LABEL, LEAD_STATUS, CHANNEL_LABEL } from "@/lib/labels";

export const dynamic = "force-dynamic";

const EVENT_ICON: Record<string, string> = {
  call: "📞", email: "✉️", notification: "🔔", wedof: "🎓",
  stage: "➡️", form: "📝", document: "📎", quote: "💶",
};

export default async function Page({ params }: { params: { id: string } }) {
  const db = crm();
  const { id } = params;

  const benefRes = await db.from("vw_beneficiary_enriched").select("*").eq("id", id).maybeSingle();
  const b = benefRes.data as any;
  if (!b) notFound();

  const [coRes, aeRes, tlRes, qRes, iRes] = await Promise.all([
    b.company_id ? db.from("companies").select("*").eq("id", b.company_id).maybeSingle() : Promise.resolve({ data: null }),
    b.auto_ecole_id ? db.from("auto_ecoles").select("raison_sociale, nom, email, telephone, ville").eq("id", b.auto_ecole_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("vw_beneficiary_timeline").select("*").eq("beneficiary_id", id).order("occurred_at", { ascending: false }).limit(60),
    db.from("quotes").select("*").eq("beneficiary_id", id).order("created_at", { ascending: false }),
    db.from("invoices").select("*").eq("beneficiary_id", id).order("created_at", { ascending: false }),
  ]);
  const co = coRes.data as any;
  const ae = aeRes.data as any;
  const timeline = tlRes.data ?? [];
  const quotes = qRes.data ?? [];
  const invoices = iRes.data ?? [];
  const fullName = [b.first_name, b.last_name].filter(Boolean).join(" ") || "Bénéficiaire";

  return (
    <div className="p-6 lg:p-8">
      <Link href="/beneficiaires" className="text-sm text-slate-500 hover:underline">← Bénéficiaires</Link>

      <div className="mt-2 mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-900">{fullName}</h1>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${STAGE_COLOR[b.pipeline_stage] ?? "bg-slate-100"}`}>
          {STAGE_LABEL[b.pipeline_stage] ?? b.pipeline_stage}
        </span>
        {co && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">🏢 {co.raison_sociale}</span>}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Colonne infos */}
        <div className="space-y-4">
          <Card title="Dates clés">
            <Row k="Date de création" v={dateFr(b.date_creation)} />
            <Row k="Date d'inscription" v={dateFr(b.date_inscription)} />
            <Row k="Formation" v={b.intitule_formation} />
            <Row k="Motif d'appel" v={b.motif} />
            <Row k="Canal" v={CHANNEL_LABEL[b.canal] ?? b.canal} />
            <Row k="Propriétaire" v={b.owner_email} />
          </Card>

          <Card title="Activité & relances">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-slate-500">Statut</span>
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${LEAD_STATUS[b.lead_status]?.color ?? "bg-slate-100"}`}>
                {LEAD_STATUS[b.lead_status]?.label ?? b.lead_status}
              </span>
            </div>
            <Row k="Dernière activité" v={dateTimeFr(b.last_activity_at)} />
            <Row k="Prochaine relance" v={dateTimeFr(b.next_relance_at)} />
            <Row k="Interactions" v={String(b.nb_interactions ?? 0)} />
            <Row k="Montant devis" v={b.montant_devis_cents != null ? euros(b.montant_devis_cents) : null} />
          </Card>

          <Card title="Coordonnées">
            <Row k="Email" v={b.email} />
            <Row k="Téléphone" v={b.phone} />
            <Row k="Ville" v={[b.code_postal, b.ville_formation].filter(Boolean).join(" ")} />
            <Row k="Financeur" v={FINANCEUR_LABEL[b.financeur] ?? b.financeur} />
            <Row k="France Travail" v={b.is_france_travail ? "Oui" : "—"} />
            <Row k="Source" v={b.source} />
          </Card>

          <Card title="Wedof / dossier">
            <Row k="Statut Wedof" v={b.wedof_state} />
            <Row k="Dossier (folder)" v={b.wedof_folder_id} />
            <Row k="SIRET formation" v={b.siret_formation} />
          </Card>

          <Card title="Auto-école">
            {ae ? (
              <>
                <div className="mb-1 font-medium text-slate-800">{ae.raison_sociale ?? ae.nom}</div>
                <div className="text-xs text-slate-500">{[ae.ville, ae.email, ae.telephone].filter(Boolean).join(" · ")}</div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-slate-500">Appariement : {b.ae_match_method}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${CONFIDENCE[b.ae_match_confidence]?.color ?? ""}`}>
                    {CONFIDENCE[b.ae_match_confidence]?.label ?? b.ae_match_confidence}
                  </span>
                  {b.ae_match_needs_review && <span className="text-[10px] text-amber-600">à confirmer</span>}
                </div>
              </>
            ) : <p className="text-sm text-slate-400">Non attribuée.</p>}
          </Card>

          {co && (
            <Card title="Entreprise">
              <Row k="Raison sociale" v={co.raison_sociale} />
              <Row k="SIRET" v={co.siret} />
              <Row k="OPCO" v={co.opco} />
              <Row k="Contact" v={[co.contact_prenom, co.contact_nom].filter(Boolean).join(" ")} />
              <Row k="Ville" v={co.ville} />
            </Card>
          )}
        </div>

        {/* Colonne principale */}
        <div className="space-y-4 lg:col-span-2">
          <Card title={`Devis (${quotes.length})`}>
            {quotes.length ? (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {quotes.map((q: any) => (
                    <tr key={q.id}>
                      <td className="py-1.5">{FINANCEUR_LABEL[q.financeur] ?? q.financeur}</td>
                      <td className="py-1.5 text-slate-600">{q.formation_label ?? "—"}</td>
                      <td className="py-1.5 font-medium">{euros(q.amount_cents)}</td>
                      <td className="py-1.5 text-xs text-slate-500">{q.status}</td>
                      <td className="py-1.5 text-xs text-slate-400">{dateFr(q.sent_at ?? q.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-sm text-slate-400">Aucun devis.</p>}
          </Card>

          <Card title={`Factures (${invoices.length})`}>
            {invoices.length ? (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {invoices.map((i: any) => (
                    <tr key={i.id}>
                      <td className="py-1.5">{FINANCEUR_LABEL[i.financeur] ?? i.financeur}</td>
                      <td className="py-1.5 font-medium">{euros(i.amount_cents)}</td>
                      <td className="py-1.5">
                        <span className={`rounded px-2 py-0.5 text-xs ${INVOICE_STATUS[i.status]?.color ?? "bg-slate-100"}`}>
                          {INVOICE_STATUS[i.status]?.label ?? i.status}
                        </span>
                      </td>
                      <td className="py-1.5 text-xs text-slate-400">{i.external_ref ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-sm text-slate-400">Aucune facture.</p>}
          </Card>

          <Card title="Historique (timeline)">
            {timeline.length ? (
              <ul className="space-y-3">
                {timeline.map((e: any, idx: number) => (
                  <li key={idx} className="flex gap-3">
                    <span className="text-lg leading-none">{EVENT_ICON[e.event_type] ?? "•"}</span>
                    <div className="flex-1 border-b border-slate-100 pb-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-800">{e.title}</span>
                        <span className="text-xs text-slate-400">{dateFr(e.occurred_at)}</span>
                      </div>
                      {e.detail && <div className="text-xs text-slate-500">{e.detail}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-400">Aucun évènement.</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">{title}</h2>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v?: string | null }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-slate-500">{k}</span>
      <span className="text-right font-medium text-slate-800">{v || "—"}</span>
    </div>
  );
}
