"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setInvoiceStatus } from "./actions";
import { INVOICE_STATUS, INVOICE_NEXT } from "@/lib/labels";

export function InvoiceActions({ invoiceId, status }: { invoiceId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const next = INVOICE_NEXT[status];
  const cancellable = status !== "encaissee" && status !== "annulee";

  function move(to: string) {
    setError(null);
    startTransition(async () => {
      const res = await setInvoiceStatus(invoiceId, to);
      if (!res.ok) { setError(res.error ?? "Erreur"); return; }
      router.refresh();
    });
  }

  if (!next && !cancellable) return null;

  return (
    <span className="flex items-center justify-end gap-2">
      {error && <span className="text-xs text-rose-600">{error}</span>}
      {next && (
        <button
          onClick={() => move(next)}
          disabled={pending}
          className="rounded-md border border-brand px-2.5 py-1 text-xs font-medium text-brand hover:bg-brand hover:text-white disabled:opacity-50"
          title={`Passer à « ${INVOICE_STATUS[next]?.label ?? next} »`}
        >
          → {INVOICE_STATUS[next]?.label ?? next}
        </button>
      )}
      {cancellable && (
        <button
          onClick={() => move("annulee")}
          disabled={pending}
          className="text-xs text-slate-300 hover:text-rose-600 disabled:opacity-50"
          title="Annuler la facture"
        >
          ✕
        </button>
      )}
    </span>
  );
}
