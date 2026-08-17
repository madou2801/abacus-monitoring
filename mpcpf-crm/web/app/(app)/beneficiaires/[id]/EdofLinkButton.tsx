"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchEdofLinks, sendEdofLink } from "../actions";
import type { EdofUrlRow } from "@/lib/edof";

export function EdofLinkButton({
  beneficiaryId,
  defaultQuery,
  cp,
  hasEmail,
}: {
  beneficiaryId: string;
  defaultQuery?: string | null;
  cp?: string | null;
  hasEmail: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(defaultQuery ?? "");
  const [rows, setRows] = useState<EdofUrlRow[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [searching, setSearching] = useState(false);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function runSearch() {
    setSearching(true);
    setMsg(null);
    try {
      const res = await searchEdofLinks(q, cp ?? undefined);
      setRows(res);
      setSelected(res.length ? res[0].id : null);
      if (!res.length) setMsg({ type: "err", text: "Aucun lien trouvé. Affinez la recherche." });
    } finally {
      setSearching(false);
    }
  }

  function openModal() {
    setOpen(true);
    setMsg(null);
    // Pré-recherche sur la formation du bénéficiaire.
    void runSearch();
  }

  function send() {
    if (selected == null) return;
    setMsg(null);
    startTransition(async () => {
      const res = await sendEdofLink(beneficiaryId, selected, message.trim() || undefined);
      if (!res.ok) {
        setMsg({ type: "err", text: res.error ?? "Erreur" });
        return;
      }
      setMsg({ type: "ok", text: res.message ?? "Lien envoyé." });
      router.refresh();
      setTimeout(() => setOpen(false), 1200);
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Lien d'inscription CPF (moncompteformation)</h2>

      {!hasEmail ? (
        <p className="text-xs text-slate-400">Renseignez l'email du bénéficiaire pour pouvoir envoyer le lien.</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-slate-500">
            Envoie au bénéficiaire le lien officiel moncompteformation.gouv.fr pour s'inscrire en autonomie (suivi du clic inclus).
          </p>
          <button
            onClick={openModal}
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Envoyer le lien d'inscription CPF
          </button>
        </>
      )}

      {msg && !open && (
        <p className={`mt-2 text-xs ${msg.type === "ok" ? "text-emerald-600" : "text-rose-600"}`}>{msg.text}</p>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-base font-semibold text-slate-800">Choisir le lien d'inscription CPF</h3>

            <div className="mb-3 flex gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void runSearch(); }}
                placeholder="Formation, code (PCB…) ou ville"
                className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
              <button onClick={() => void runSearch()} disabled={searching}
                className="rounded bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                {searching ? "…" : "Rechercher"}
              </button>
            </div>

            <div className="mb-3 max-h-64 overflow-auto rounded border border-slate-100">
              {rows.length ? (
                <ul className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <li key={r.id}>
                      <label className="flex cursor-pointer items-start gap-2 px-3 py-2 hover:bg-slate-50">
                        <input
                          type="radio"
                          name="edof-url"
                          checked={selected === r.id}
                          onChange={() => setSelected(r.id)}
                          className="mt-1"
                        />
                        <span className="text-sm">
                          <span className="font-medium text-slate-800">{r.intitule}</span>
                          <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">{r.formation_numero}</span>
                          <br />
                          <span className="text-xs text-slate-500">{r.ville} ({r.code_postal})</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-4 text-sm text-slate-400">{searching ? "Recherche…" : "Aucun résultat."}</p>
              )}
            </div>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Message personnalisé (optionnel) — ajouté en tête de l'email."
              rows={2}
              className="mb-3 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />

            {msg && (
              <p className={`mb-2 text-xs ${msg.type === "ok" ? "text-emerald-600" : "text-rose-600"}`}>{msg.text}</p>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100">
                Annuler
              </button>
              <button
                onClick={send}
                disabled={pending || selected == null}
                className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {pending ? "Envoi…" : "Envoyer le lien"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
