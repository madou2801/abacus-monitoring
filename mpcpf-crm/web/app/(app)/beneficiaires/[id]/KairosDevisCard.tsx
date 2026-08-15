"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createKairosDevis } from "../actions";

type Devis = {
  statut: string;
  numero: string | null;
  dateEnvoi: string | null;
  montantTtc: number | null;
  formation: string | null;
  syncStatus: string | null;
  syncError: string | null;
} | null;

const STATUT: Record<string, { label: string; color: string }> = {
  PROSPECT: { label: "En file (robot)", color: "bg-slate-100 text-slate-600" },
  DEVIS_BROUILLON: { label: "Devis en brouillon", color: "bg-amber-100 text-amber-700" },
  DEVIS_TRANSMIS_DE: { label: "Devis transmis (attente DE)", color: "bg-emerald-100 text-emerald-700" },
  DEVIS_VALIDE_DE: { label: "Devis validé par le DE", color: "bg-emerald-100 text-emerald-700" },
  DEVIS_REFUSE_DE: { label: "Devis refusé par le DE", color: "bg-rose-100 text-rose-700" },
  DEVIS_TRANSMIS_FT: { label: "Transmis France Travail", color: "bg-emerald-100 text-emerald-700" },
  DEVIS_VALIDE_FT: { label: "Validé France Travail", color: "bg-emerald-100 text-emerald-700" },
  DEVIS_REFUSE_FT: { label: "Refusé France Travail", color: "bg-rose-100 text-rose-700" },
  CLOTURE: { label: "Clôturé", color: "bg-slate-100 text-slate-500" },
  ANNULE: { label: "Annulé", color: "bg-slate-100 text-slate-500" },
};

function dateFr(v: string | null): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export function KairosDevisCard({
  beneficiaryId,
  ftValid,
  formationFilled,
  devis,
}: {
  beneficiaryId: string;
  ftValid: boolean;
  formationFilled: boolean;
  devis: Devis;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  function trigger() {
    setMsg(null);
    startTransition(async () => {
      const res = await createKairosDevis(beneficiaryId);
      if (!res.ok) {
        setMsg({ type: "err", text: res.error ?? "Erreur" });
        return;
      }
      setMsg({ type: "ok", text: res.message ?? "Dossier Kairos créé." });
      router.refresh();
    });
  }

  const st = devis ? STATUT[devis.statut] ?? { label: devis.statut, color: "bg-slate-100 text-slate-600" } : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Devis Kairos (France Travail — AIF)</h2>

      {devis ? (
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Statut</span>
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${st!.color}`}>{st!.label}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">N° devis Kairos</span>
            <span className="font-medium">{devis.numero ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Envoyé le</span>
            <span>{dateFr(devis.dateEnvoi)}</span>
          </div>
          {devis.montantTtc != null && (
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Montant TTC</span>
              <span className="font-medium">{devis.montantTtc.toLocaleString("fr-FR")} €</span>
            </div>
          )}
          {devis.syncStatus === "FAILED" && devis.syncError && (
            <p className="mt-1 text-xs text-rose-600">⚠️ {devis.syncError}</p>
          )}
        </div>
      ) : ftValid && formationFilled ? (
        <>
          <p className="mb-3 text-xs text-slate-500">
            Crée le dossier AIF et le transmet à France Travail via le robot Kairos.
          </p>
          <button
            onClick={trigger}
            disabled={pending}
            className="rounded bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {pending ? "Création…" : "Créer & transmettre le devis Kairos"}
          </button>
        </>
      ) : (
        <p className="text-xs text-slate-400">
          {!ftValid && "Renseignez l'identifiant France Travail (DE)"}
          {!ftValid && !formationFilled && " et "}
          {!formationFilled && (ftValid ? "Renseignez la formation" : "la formation")}
          {" pour pouvoir créer le devis."}
        </p>
      )}

      {msg && (
        <p className={`mt-2 text-xs ${msg.type === "ok" ? "text-emerald-600" : "text-rose-600"}`}>{msg.text}</p>
      )}
    </div>
  );
}
