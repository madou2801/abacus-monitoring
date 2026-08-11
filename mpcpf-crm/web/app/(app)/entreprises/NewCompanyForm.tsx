"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCompany, lookupSiret } from "./actions";

type Hit = {
  raison_sociale: string;
  siren: string;
  siret: string;
  adresse: string;
  code_postal: string;
  ville: string;
  naf: string;
  contact_prenom: string;
  contact_nom: string;
};

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

  // Recherche entreprise (SIREN/SIRET/nom/adresse) via recherche-entreprises.api.gouv.fr
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  async function search() {
    setLookupError(null);
    setHits([]);
    if (q.trim().length < 3) {
      setLookupError("Saisis au moins 3 caractères.");
      return;
    }
    setSearching(true);
    try {
      const res = await fetch("/api/company-lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q: q.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) setLookupError(data?.error || "Recherche indisponible");
      else if ((data.results || []).length === 0) setLookupError("Aucune entreprise trouvée.");
      else setHits(data.results);
    } catch (e) {
      setLookupError(String((e as Error)?.message || e));
    } finally {
      setSearching(false);
    }
  }

  function pick(h: Hit) {
    setValues((v) => ({
      ...v,
      raison_sociale: h.raison_sociale,
      siret: h.siret,
      adresse: h.adresse,
      code_postal: h.code_postal,
      ville: h.ville,
      contact_prenom: v.contact_prenom || h.contact_prenom,
      contact_nom: v.contact_nom || h.contact_nom,
    }));
    setHits([]);
    setQ("");
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createCompany(values as any);
      if (!res.ok) {
        setError(res.error ?? "Erreur");
        return;
      }
      setValues({});
      setOpenForm(false);
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

      {/* Auto-remplissage via l'annuaire des entreprises */}
      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <label className="text-xs font-medium text-slate-600">
          🔎 Remplir automatiquement — SIREN, SIRET, nom ou adresse
        </label>
        <div className="mt-1 flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                search();
              }
            }}
            placeholder="ex. 884335290, ABACUS, 3 place octogonale Chessy…"
            className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-800"
          />
          <button
            onClick={search}
            disabled={searching}
            className="rounded bg-slate-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {searching ? "…" : "Rechercher"}
          </button>
        </div>
        {lookupError && <p className="mt-2 text-xs text-rose-600">{lookupError}</p>}
        {hits.length > 0 && (
          <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded border border-slate-200 bg-white">
            {hits.map((h) => (
              <li key={h.siret || h.siren}>
                <button
                  onClick={() => pick(h)}
                  className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                >
                  <div className="text-sm font-medium text-slate-800">{h.raison_sociale || "(sans nom)"}</div>
                  <div className="text-xs text-slate-500">
                    SIREN {h.siren}
                    {h.siret ? ` · SIRET ${h.siret}` : ""}
                    {[h.code_postal, h.ville].filter(Boolean).length
                      ? ` · ${[h.code_postal, h.ville].filter(Boolean).join(" ")}`
                      : ""}
                    {h.naf ? ` · NAF ${h.naf}` : ""}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-[11px] text-slate-400">
          Source : recherche-entreprises.api.gouv.fr (INSEE SIRENE + RNE/INPI). Les champs restent modifiables.
        </p>
      </div>

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
