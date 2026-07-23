import Link from "next/link";
import { notFound } from "next/navigation";
import { crm, euros, dateFr, dateTimeFr } from "@/lib/supabase";
import {
  STAGE_LABEL, STAGE_COLOR, INVOICE_STATUS, CONFIDENCE, FINANCEUR_LABEL,
  LEAD_STATUS, CHANNEL_LABEL, QUOTE_STATUS, MATCH_METHOD_LABEL, wedofStateFr,
} from "@/lib/labels";
import { EditableCard, StaticRow } from "./EditableCard";
import { NotesCard } from "./NotesCard";
import { TasksCard } from "./TasksCard";
import { QuoteForm } from "./QuoteForm";
import { QuoteActions } from "./QuoteActions";
import { OwnerSelect } from "./OwnerSelect";
import { getStaffUser } from "@/lib/auth";
import { ResetPasswordButton } from "@/components/ResetPasswordButton";
import { UnifiedTimeline } from "@/components/UnifiedTimeline";
import { DossierCompletion } from "./DossierCompletion";

export const dynamic = "force-dynamic";

const FINANCEUR_OPTIONS = Object.entries(FINANCEUR_LABEL).map(([value, label]) => ({ value, label }));

export default async function Page({ params }: { params: { id: string } }) {
  const db = crm();
  const { id } = params;

  const benefRes = await db.from("vw_beneficiary_enriched").select("*").eq("id", id).maybeSingle();
  const b = benefRes.data as any;
  if (!b) notFound();

  const me = await getStaffUser();
  const isAdmin = me?.role === "admin";

  const [coRes, aeRes, tlRes, qRes, iRes, notesRes, tasksRes, staffRes] = await Promise.all([
    b.company_id ? db.from("companies").select("*").eq("id", b.company_id).maybeSingle() : Promise.resolve({ data: null }),
    b.auto_ecole_id ? db.from("auto_ecoles").select("raison_sociale, nom, email, telephone, ville").eq("id", b.auto_ecole_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("vw_beneficiary_timeline").select("*").eq("beneficiary_id", id).order("occurred_at", { ascending: false }).limit(60),
    db.from("quotes").select("*").eq("beneficiary_id", id).order("created_at", { ascending: false }),
    db.from("invoices").select("*").eq("beneficiary_id", id).order("created_at", { ascending: false }),
    db.from("notes").select("id, author_email, content, created_at").eq("beneficiary_id", id).order("created_at", { ascending: false }).limit(50),
    db.from("tasks").select("id, title, status, due_at, assignee_email, created_at").eq("beneficiary_id", id).order("created_at", { ascending: false }).limit(50),
    db.from("app_users").select("email").eq("active", true).order("email"),
  ]);
  const co = coRes.data as any;
  const ae = aeRes.data as any;
  const timeline = tlRes.data ?? [];
  const quotes = qRes.data ?? [];
  const invoices = iRes.data ?? [];
  const notes = (notesRes.data ?? []) as any[];
  const tasks = (tasksRes.data ?? []) as any[];
  const staffEmails = (staffRes.data ?? []).map((u: any) => u.email as string);
  const fullName = [b.first_name, b.last_name].filter(Boolean).join(" ") || "Bénéficiaire";

  // Complétude : champs Dossier vides mais dérivables du dernier devis.
  const latestQuote = (quotes as any[])[0];
  const dossierSuggested: Record<string, string> = {};
  if (!b.intitule_formation && latestQuote?.formation_label) {
    dossierSuggested.intitule_formation = latestQuote.formation_label;
  }
  if (!b.financeur && latestQuote?.financeur) {
    dossierSuggested.financeur = latestQuote.financeur;
  }

  return (
    <div className="p-6 lg:p-8">
      <Link href="/beneficiaires" className="text-sm text-slate-500 hover:underline">← Bénéficiaires</Link>

      <div className="mt-2 mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-900">{fullName}</h1>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${STAGE_COLOR[b.pipeline_stage] ?? "bg-slate-100"}`}>
          {STAGE_LABEL[b.pipeline_stage] ?? b.pipeline_stage}
        </span>
        {co && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">🏢 {co.raison_sociale}</span>}
        <OwnerSelect beneficiaryId={id} current={b.owner_email ?? null} staffEmails={staffEmails} />
        {isAdmin && (
          <div className="ml-auto">
            <ResetPasswordButton email={b.email} cible="eleve" prenom={b.first_name} compact />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Colonne infos */}
        <div className="space-y-4">
          <EditableCard
            title="Identité & coordonnées"
            beneficiaryId={id}
            fields={[
              { key: "first_name", label: "Prénom", value: b.first_name },
              { key: "last_name", label: "Nom", value: b.last_name },
              { key: "email", label: "Email", value: b.email },
              { key: "phone", label: "Téléphone", value: b.phone },
              { key: "code_postal", label: "Code postal", value: b.code_postal },
              { key: "ville_formation", label: "Ville", value: b.ville_formation },
            ]}
            extra={
              <>
                <StaticRow k="France Travail" v={b.is_france_travail ? "Oui" : "—"} />
                <StaticRow k="Canal" v={CHANNEL_LABEL[b.canal] ?? b.canal} />
              </>
            }
          />

          {Object.keys(dossierSuggested).length > 0 && (
            <DossierCompletion beneficiaryId={id} suggested={dossierSuggested} source="devis" />
          )}

          <EditableCard
            title="Dossier"
            beneficiaryId={id}
            fields={[
              { key: "intitule_formation", label: "Formation", value: b.intitule_formation },
              { key: "financeur", label: "Financeur", value: b.financeur, type: "select", options: FINANCEUR_OPTIONS },
              { key: "motif", label: "Motif / contexte", value: b.motif, type: "textarea" },
            ]}
            extra={
              <>
                <StaticRow k="Date de création" v={dateFr(b.date_creation)} />
                <StaticRow k="Date d'inscription" v={dateFr(b.date_inscription)} />
              </>
            }
          />

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Activité & relances</h2>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-slate-500">Statut</span>
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${LEAD_STATUS[b.lead_status]?.color ?? "bg-slate-100"}`}>
                {LEAD_STATUS[b.lead_status]?.label ?? b.lead_status}
              </span>
            </div>
            <StaticRow k="Dernière activité" v={dateTimeFr(b.last_activity_at)} />
            <StaticRow k="Prochaine relance" v={dateTimeFr(b.next_relance_at)} />
            <StaticRow k="Interactions" v={String(b.nb_interactions ?? 0)} />
            <StaticRow k="Montant devis" v={b.montant_devis_cents != null ? euros(b.montant_devis_cents) : null} />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Wedof / dossier</h2>
            <StaticRow k="Statut Wedof" v={wedofStateFr(b.wedof_state)} />
            <StaticRow k="Dossier (folder)" v={b.wedof_folder_id} />
            <StaticRow k="SIRET formation" v={b.siret_formation} />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Auto-école</h2>
            {ae ? (
              <>
                <div className="mb-1 font-medium text-slate-800">{ae.raison_sociale ?? ae.nom}</div>
                <div className="text-xs text-slate-500">{[ae.ville, ae.email, ae.telephone].filter(Boolean).join(" · ")}</div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-slate-500">
                    Appariement : {MATCH_METHOD_LABEL[b.ae_match_method] ?? b.ae_match_method}
                  </span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${CONFIDENCE[b.ae_match_confidence]?.color ?? ""}`}>
                    {CONFIDENCE[b.ae_match_confidence]?.label ?? b.ae_match_confidence}
                  </span>
                  {b.ae_match_needs_review && <span className="text-[10px] text-amber-600">à confirmer</span>}
                </div>
              </>
            ) : <p className="text-sm text-slate-400">Non attribuée.</p>}
          </div>

          {co && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">Entreprise</h2>
              <StaticRow k="Raison sociale" v={co.raison_sociale} />
              <StaticRow k="SIRET" v={co.siret} />
              <StaticRow k="OPCO" v={co.opco} />
              <StaticRow k="Contact" v={[co.contact_prenom, co.contact_nom].filter(Boolean).join(" ")} />
              <StaticRow k="Ville" v={co.ville} />
            </div>
          )}
        </div>

        {/* Colonne principale */}
        <div className="space-y-4 lg:col-span-2">
          <TasksCard beneficiaryId={id} tasks={tasks} staffEmails={staffEmails} />
          <NotesCard beneficiaryId={id} notes={notes} />

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-700">Devis ({quotes.length})</h2>
              <QuoteForm beneficiaryId={id} />
            </div>
            {quotes.length ? (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {quotes.map((q: any) => (
                    <tr key={q.id}>
                      <td className="py-1.5">{FINANCEUR_LABEL[q.financeur] ?? q.financeur}</td>
                      <td className="py-1.5 text-slate-600">{q.formation_label ?? "—"}</td>
                      <td className="py-1.5 font-medium">{euros(q.amount_cents)}</td>
                      <td className="py-1.5">
                        <span className={`rounded px-2 py-0.5 text-xs ${QUOTE_STATUS[q.status]?.color ?? "bg-slate-100"}`}>
                          {QUOTE_STATUS[q.status]?.label ?? q.status}
                        </span>
                      </td>
                      <td className="py-1.5 text-xs text-slate-400">{dateFr(q.sent_at ?? q.created_at)}</td>
                      <td className="py-1.5">
                        {(q.status === "draft" || q.status === "sent") && (
                          <QuoteActions beneficiaryId={id} quoteId={q.id} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-sm text-slate-400">Aucun devis.</p>}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Factures ({invoices.length})</h2>
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
          </div>

          <UnifiedTimeline events={timeline as any[]} email={b.email} />
        </div>
      </div>
    </div>
  );
}
