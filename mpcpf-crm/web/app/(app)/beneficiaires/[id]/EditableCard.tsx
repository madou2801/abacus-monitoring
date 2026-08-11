"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateBeneficiary, type EditableField } from "../actions";

export type EditableFieldDef = {
  key: EditableField;
  label: string;
  value: string | null | undefined;
  type?: "text" | "textarea" | "select";
  options?: { value: string; label: string }[];
};

// Rangée statique + champ affiché en dur (pour mixer champs éditables et
// champs en lecture seule dans une même carte).
export function StaticRow({ k, v }: { k: string; v?: string | null }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-slate-500">{k}</span>
      <span className="text-right font-medium text-slate-800">{v || "—"}</span>
    </div>
  );
}

// Carte de propriétés éditables façon HubSpot : mode lecture par défaut,
// crayon → formulaire, enregistrement via crm.update_beneficiary_fields
// (diff + historique + verrouillage anti-sync).
export function EditableCard({
  title, beneficiaryId, fields, extra,
}: {
  title: string;
  beneficiaryId: string;
  fields: EditableFieldDef[];
  extra?: React.ReactNode;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function startEdit() {
    const init: Record<string, string> = {};
    for (const f of fields) init[f.key] = f.value ?? "";
    setDraft(init);
    setError(null);
    setEditing(true);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updateBeneficiary(beneficiaryId, draft);
      if (!res.ok) {
        setError(res.error ?? "Erreur");
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        {!editing && (
          <button
            onClick={startEdit}
            className="rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Modifier"
          >
            ✏️ Modifier
          </button>
        )}
      </div>

      {!editing ? (
        <>
          {fields.map((f) => (
            <StaticRow
              key={f.key}
              k={f.label}
              v={f.type === "select"
                ? f.options?.find((o) => o.value === (f.value ?? ""))?.label ?? f.value
                : f.value}
            />
          ))}
          {extra}
        </>
      ) : (
        <div className="space-y-2">
          {fields.map((f) => (
            <label key={f.key} className="block text-xs text-slate-500">
              {f.label}
              {f.type === "select" ? (
                <select
                  value={draft[f.key] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                  className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
                >
                  <option value="">—</option>
                  {(f.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea
                  value={draft[f.key] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                  rows={3}
                  className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
                />
              ) : (
                <input
                  value={draft[f.key] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                  className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
                />
              )}
            </label>
          ))}
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={save}
              disabled={pending}
              className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {pending ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={pending}
              className="rounded-md px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
