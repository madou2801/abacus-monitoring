"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addNote } from "../actions";

type Note = { id: string; author_email: string | null; content: string; created_at: string };

export function NotesCard({ beneficiaryId, notes }: { beneficiaryId: string; notes: Note[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!text.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await addNote(beneficiaryId, text);
      if (!res.ok) { setError(res.error ?? "Erreur"); return; }
      setText("");
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Notes ({notes.length})</h2>

      <div className="mb-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Ajouter une note…"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800"
        />
        {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
        <div className="mt-1.5 text-right">
          <button
            onClick={submit}
            disabled={pending || !text.trim()}
            className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {pending ? "Ajout…" : "Ajouter la note"}
          </button>
        </div>
      </div>

      {notes.length === 0 ? (
        <p className="text-sm text-slate-400">Aucune note.</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg bg-amber-50/60 p-3">
              <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                <span className="font-medium">{n.author_email ?? "staff"}</span>
                <span>{new Date(n.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{n.content}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
