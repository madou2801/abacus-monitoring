"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCompany } from "./actions";

const FIELDS: { key: string; label: string; placeholder?: string; required?: boolean }[] = [
  { key: "raison_sociale", label: "Raison sociale *", required: true },
  { key: "siret", label: "SIRET", placeholder: "14 chiffres" },
  { key: "email", label: "Email" },
  { key: "telephone", label: "Téléphone" },
  { key: "contact_prenom", label: "Prénom du contact" },
  { key: "contact_nom", label: "Nom du contact" },
  { key: "contact_fonction", label: "Fonction du contact", placeholder: "RH, gérant…" },
  { key: "opco", label: "OPCO", placeholder: "Opco Mobilités…" },
  { key: "adresse", label: "Adresse" },
  { key: "code_postal", label: "Code postal" },
  { key: "ville", label: "Ville" },
];

export function NewCompanyForm() {
  const router = useRouter();
  const [openForm, setOpenForm] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createCompany(values as any);
      if (!res.ok) { setError(res.error ?? "Erreur"); return; }
      setValues({}); setOpenForm(false);
      router.refresh();
    });
  }

  if (!openForm) {
    return (
      <button
        onClick={() => setOpenForm(true)}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        + Nouvelle entreprise
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-4 text-sm font-semibold text-slate-700">Nouvelle entreprise</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col text-xs text-slate-500">
            {f.label}
            <input
              value={values[f.key] ?? ""}
              placeholder={f.placeholder}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-800"
            />
          </label>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={pending || !(values.raison_sociale ?? "").trim()}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Création…" : "Créer l'entreprise"}
        </button>
        <button
          onClick={() => setOpenForm(false)}
          disabled={pending}
          className="text-sm text-slate-500 hover:underline"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
