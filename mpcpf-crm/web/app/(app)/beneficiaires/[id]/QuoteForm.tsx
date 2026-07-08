"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createQuote } from "../actions";
import { FINANCEUR_LABEL } from "@/lib/labels";

export function QuoteForm({ beneficiaryId }: { beneficiaryId: string }) {
  const router = useRouter();
  const [openForm, setOpenForm] = useState(false);
  const [financeur, setFinanceur] = useState("edof");
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [transmit, setTransmit] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createQuote(beneficiaryId, {
        financeur, amount_euros: amount, formation_label: label, transmit,
      });
      if (!res.ok) { setError(res.error ?? "Erreur"); return; }
      setOpenForm(false); setAmount(""); setLabel("");
      router.refresh();
    });
  }

  if (!openForm) {
    return (
      <button
        onClick={() => setOpenForm(true)}
        className="rounded-md border border-brand px-3 py-1 text-xs font-medium text-brand hover:bg-brand hover:text-white"
      >
        + Nouveau devis
      </button>
    );
  }

  return (
    <div className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-slate-500">
          Financeur
          <select value={financeur} onChange={(e) => setFinanceur(e.target.value)}
            className="mt-0.5 rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            {Object.entries(FINANCEUR_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-xs text-slate-500">
          Montant (€)
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1500"
            className="mt-0.5 w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col text-xs text-slate-500">
          Formation
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Permis B"
            className="mt-0.5 w-40 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
        <label className="flex items-center gap-1.5 pb-2 text-xs text-slate-600">
          <input type="checkbox" checked={transmit} onChange={(e) => setTransmit(e.target.checked)} />
          Transmettre (relance auto)
        </label>
        <button onClick={submit} disabled={pending}
          className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
          {pending ? "Création…" : "Créer"}
        </button>
        <button onClick={() => setOpenForm(false)} disabled={pending}
          className="rounded-md px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100">
          Annuler
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
