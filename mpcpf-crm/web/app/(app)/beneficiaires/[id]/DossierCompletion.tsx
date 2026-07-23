"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateBeneficiary, type EditableField } from "../actions";

const LABELS: Record<string, string> = {
  intitule_formation: "Formation",
  financeur: "Financeur",
  motif: "Motif",
  code_postal: "Code postal",
  ville_formation: "Ville",
};

// Bannière de complétude : propose de remplir les champs vides de la fiche
// à partir de données déjà présentes (ex. le devis), en un clic.
export function DossierCompletion({
  beneficiaryId,
  suggested,
  source,
}: {
  beneficiaryId: string;
  suggested: Partial<Record<EditableField, string>>;
  source: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const entries = Object.entries(suggested).filter(([, v]) => v && v.trim());
  if (entries.length === 0 || done) return null;

  function complete() {
    setError(null);
    startTransition(async () => {
      const res = await updateBeneficiary(beneficiaryId, suggested);
      if (!res.ok) {
        setError(res.error ?? "Erreur");
        return;
      }
      setDone(true);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
      <div className="mb-1 text-xs font-semibold text-amber-800">
        💡 Fiche incomplète — à compléter depuis le {source}
      </div>
      <ul className="mb-2 space-y-0.5 text-xs text-amber-700">
        {entries.map(([k, v]) => (
          <li key={k}>
            <span className="font-medium">{LABELS[k] ?? k}</span> : {v}
          </li>
        ))}
      </ul>
      {error && <p className="mb-2 text-xs text-rose-600">{error}</p>}
      <button
        onClick={complete}
        disabled={pending}
        className="rounded bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {pending ? "Application…" : "Compléter la fiche"}
      </button>
    </div>
  );
}
