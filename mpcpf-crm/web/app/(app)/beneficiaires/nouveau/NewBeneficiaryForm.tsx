"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBeneficiary } from "../actions";
import { FINANCEUR_LABEL } from "@/lib/labels";

const FIELDS: { key: string; label: string; placeholder?: string }[] = [
  { key: "first_name", label: "Prénom" },
  { key: "last_name", label: "Nom" },
  { key: "email", label: "Email", placeholder: "prenom.nom@exemple.fr" },
  { key: "phone", label: "Téléphone", placeholder: "06 12 34 56 78" },
  { key: "intitule_formation", label: "Formation", placeholder: "Permis B" },
  { key: "code_postal", label: "Code postal" },
  { key: "ville_formation", label: "Ville" },
];

export function NewBeneficiaryForm() {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createBeneficiary(values as any);
      if (!res.ok || !res.id) { setError(res.error ?? "Erreur"); return; }
      router.push(`/beneficiaires/${res.id}`);
    });
  }

  return (
    <div className="max-w-xl rounded-xl border border-slate-200 bg-white p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col text-xs text-slate-500">
            {f.label}
            <input
              value={values[f.key] ?? ""}
              placeholder={f.placeholder}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800"
            />
          </label>
        ))}
        <label className="flex flex-col text-xs text-slate-500">
          Financeur
          <select
            value={values.financeur ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, financeur: e.target.value }))}
            className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800"
          >
            <option value="">—</option>
            {Object.entries(FINANCEUR_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>
      <label className="mt-4 flex flex-col text-xs text-slate-500">
        Motif / contexte
        <textarea
          value={values.motif ?? ""}
          rows={3}
          onChange={(e) => setValues((v) => ({ ...v, motif: e.target.value }))}
          className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800"
        />
      </label>

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Création…" : "Créer le dossier"}
        </button>
        <button
          onClick={() => router.push("/beneficiaires")}
          disabled={pending}
          className="text-sm text-slate-500 hover:underline"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
