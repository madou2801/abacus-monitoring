"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCompany, lookupSiret } from "./actions";

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
  const [siretMsg, setSiretMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [siretPending, startSiret] = useTransition();

  // Pré-remplit le formulaire depuis le SIRET (API recherche-entreprises).
  function runSiret() {
    setSiretMsg(null);
    const siret = (values.siret ?? "").trim();
    startSiret(async () => {
      const res = await lookupSiret(siret);
      if (!res.ok || !res.company) {
        setSiretMsg({ ok: false, text: res.error ?? "Introuvable" });
        return;
      }
      // n'écrase que les champs renvoyés non vides (préserve la saisie manuelle).
      const filled = Object.fromEntries(Object.entries(res.company).filter(([, v]) => v));
      setValues((v) => ({ ...v, ...filled }));
      setSiretMsg({ ok: true, text: "✓ " + (res.company.raison_sociale || "Entreprise trouvée") });
    });
  }

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
        {FIELDS.map((f) =>
          f.key === "siret" ? (
            <label key={f.key} className="flex flex-col text-xs text-slate-500">
              {f.label}
              <div className="mt-1 flex gap-1.5">
                <input
                  value={values.siret ?? ""}
                  placeholder={f.placeholder}
                  onChange={(e) => setValues((v) => ({ ...v, siret: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runSiret(); } }}
                  className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-800"
                />
                <button
                  type="button"
                  onClick={runSiret}
                  disabled={siretPending || !(values.siret ?? "").trim()}
                  className="shrink-0 rounded-md bg-slate-700 px-2.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
                >
                  {siretPending ? "…" : "Rechercher"}
                </button>
              </div>
              {siretMsg && (
                <span className={`mt-0.5 text-[11px] ${siretMsg.ok ? "text-emerald-600" : "text-rose-600"}`}>
                  {siretMsg.text}
                </span>
              )}
            </label>
          ) : (
            <label key={f.key} className="flex flex-col text-xs text-slate-500">
              {f.label}
              <input
                value={values[f.key] ?? ""}
                placeholder={f.placeholder}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-800"
              />
            </label>
          ),
        )}
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
