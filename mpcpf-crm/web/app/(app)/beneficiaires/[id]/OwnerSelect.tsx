"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateBeneficiary } from "../actions";

// Assignation du propriétaire du dossier (équiv. "Contact owner" HubSpot).
export function OwnerSelect({
  beneficiaryId, current, staffEmails,
}: { beneficiaryId: string; current: string | null; staffEmails: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function change(email: string) {
    setError(null);
    startTransition(async () => {
      const res = await updateBeneficiary(beneficiaryId, { owner_email: email });
      if (!res.ok) { setError(res.error ?? "Erreur"); return; }
      router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-xs text-slate-400">Propriétaire :</span>
      <select
        value={current ?? ""}
        onChange={(e) => change(e.target.value)}
        disabled={pending}
        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 disabled:opacity-50"
      >
        <option value="">Non assigné</option>
        {staffEmails.map((e) => <option key={e} value={e}>{e}</option>)}
      </select>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </span>
  );
}
