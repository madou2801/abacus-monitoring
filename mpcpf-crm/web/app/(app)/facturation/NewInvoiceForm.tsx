"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createInvoice } from "./actions";
import { FINANCEUR_LABEL } from "@/lib/labels";

export type BenefOption = { id: string; label: string };

export function NewInvoiceForm({ beneficiaries }: { beneficiaries: BenefOption[] }) {
  const router = useRouter();
  const [openForm, setOpenForm] = useState(false);
  const [search, setSearch] = useState("");
  const [benefId, setBenefId] = useState("");
  const [financeur, setFinanceur] = useState("edof");
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [externalRef, setExternalRef] = useState("");
  const [dueDays, setDueDays] = useState("30");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Recherche locale dans la liste (id + label) fournie par le serveur.
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return beneficiaries.filter((b) => b.label.toLowerCase().includes(q)).slice(0, 8);
  }, [search, beneficiaries]);

  const selected = beneficiaries.find((b) => b.id === benefId);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createInvoice({
        beneficiary_id: benefId,
        financeur,
        amount_euros: amount,
        formation_label: label,
        external_ref: externalRef,
        due_days: dueDays,
      });
      if (!res.ok) { setError(res.error ?? "Erreur"); return; }
      setOpenForm(false);
      setBenefId(""); setSearch(""); setAmount(""); setLabel(""); setExternalRef("");
      router.refresh();
    });
  }

  if (!openForm) {
    return (
      <button
        onClick={() => setOpenForm(true)}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        + Nouvelle facture
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-4 text-sm font-semibold text-slate-700">Nouvelle facture</h2>

      <div className="mb-3">
        <label className="block text-xs text-slate-500">Bénéficiaire *</label>
        {selected ? (
          <div className="mt-1 flex items-center gap-2">
            <span className="rounded-md bg-brand/10 px-3 py-1.5 text-sm font-medium text-brand">{selected.label}</span>
            <button onClick={() => { setBenefId(""); setSearch(""); }} className="text-xs text-slate-400 hover:text-rose-600">changer</button>
          </div>
        ) : (
          <div className="relative mt-1 max-w-md">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom, email ou téléphone…"
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-800"
            />
            {matches.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
                {matches.map((m) => (
                  <li key={m.id}>
                    <button
                      onClick={() => { setBenefId(m.id); setSearch(""); }}
                      className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-brand/5"
                    >
                      {m.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-xs text-slate-500">
          Financeur
          <select value={financeur} onChange={(e) => setFinanceur(e.target.value)}
            className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            {Object.entries(FINANCEUR_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-xs text-slate-500">
          Montant (€)
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1500"
            className="mt-1 w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col text-xs text-slate-500">
          Formation
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Permis B"
            className="mt-1 w-40 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col text-xs text-slate-500">
          Réf. externe
          <input value={externalRef} onChange={(e) => setExternalRef(e.target.value)} placeholder="Wedof / Chorus…"
            className="mt-1 w-36 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col text-xs text-slate-500">
          Échéance (jours)
          <input value={dueDays} onChange={(e) => setDueDays(e.target.value)}
            className="mt-1 w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
        <button onClick={submit} disabled={pending || !benefId}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {pending ? "Création…" : "Créer la facture"}
        </button>
        <button onClick={() => setOpenForm(false)} disabled={pending}
          className="text-sm text-slate-500 hover:underline">
          Annuler
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      <p className="mt-2 text-[11px] text-slate-400">
        La facture est créée « à émettre » ; une facture non annulée existe déjà pour ce dossier et ce financeur → elle est réutilisée (pas de doublon).
      </p>
    </div>
  );
}
