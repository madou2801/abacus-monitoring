"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideQuote } from "../actions";

// Validation / refus d'un devis en un clic (affiché sur les devis draft/sent).
export function QuoteActions({ beneficiaryId, quoteId }: { beneficiaryId: string; quoteId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function decide(status: "accepted" | "refused") {
    if (status === "refused" && !window.confirm("Refuser ce devis ?")) return;
    setError(null);
    startTransition(async () => {
      const res = await decideQuote(beneficiaryId, quoteId, status);
      if (!res.ok) { setError(res.error ?? "Erreur"); return; }
      router.refresh();
    });
  }

  return (
    <span className="flex items-center justify-end gap-2">
      {error && <span className="text-xs text-rose-600">{error}</span>}
      <button
        onClick={() => decide("accepted")}
        disabled={pending}
        className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        title="Valider le devis (fait avancer le parcours)"
      >
        ✓ Valider
      </button>
      <button
        onClick={() => decide("refused")}
        disabled={pending}
        className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:border-rose-300 hover:text-rose-600 disabled:opacity-50"
        title="Refuser le devis"
      >
        ✗
      </button>
    </span>
  );
}
