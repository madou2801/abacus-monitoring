"use client";

import { useRef, useState } from "react";

type Source = { source: string; score: number };
type Turn = {
  role: "user" | "assistant";
  text: string;
  sources?: Source[];
  error?: boolean;
};

const SUGGESTIONS = [
  "Quels dispositifs pour financer une formation dans une entreprise relevant de l'OPCO Mobilités ?",
  "Le CACES R489 est-il finançable par le CPF ?",
  "Comment fonctionne une POEI et qui la finance ?",
  "Quelles aides pour un recrutement en contrat de professionnalisation ?",
];

export default function Page() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function ask(question: string) {
    const text = question.trim();
    if (text.length < 3 || loading) return;
    setQ("");
    setTurns((t) => [...t, { role: "user", text }]);
    setLoading(true);
    try {
      const r = await fetch("/api/financements/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        const msg =
          d?.error === "assistant_non_configure"
            ? "Assistant non configuré (le token RAG manque côté serveur). Contactez l'administrateur."
            : d?.detail || d?.error || `Erreur ${r.status}`;
        setTurns((t) => [...t, { role: "assistant", text: msg, error: true }]);
      } else {
        setTurns((t) => [...t, { role: "assistant", text: d.answer || "(réponse vide)", sources: d.sources || [] }]);
      }
    } catch (e) {
      setTurns((t) => [...t, { role: "assistant", text: `Réseau indisponible : ${(e as Error).message}`, error: true }]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 50);
    }
  }

  return (
    <div className="flex h-[calc(100vh-1px)] flex-col p-6 lg:p-8">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">Assistant financements</h1>
        <p className="text-sm text-slate-500">
          Interroge la base des dispositifs de financement (11 OPCO, aides, POEI…) pour qualifier
          un financement pendant la prospection. Usage interne — les réponses citent leurs sources.
        </p>
      </div>

      {/* Fil de conversation */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4"
      >
        {turns.length === 0 && (
          <div className="mx-auto max-w-2xl pt-6">
            <p className="mb-3 text-center text-sm text-slate-400">Exemples de questions :</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="rounded-lg border border-slate-200 bg-white p-3 text-left text-sm text-slate-600 hover:border-blue-300 hover:text-blue-700"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                t.role === "user"
                  ? "bg-blue-600 text-white"
                  : t.error
                  ? "border border-amber-200 bg-amber-50 text-amber-800"
                  : "border border-slate-200 bg-white text-slate-800"
              }`}
            >
              <div className="whitespace-pre-wrap leading-relaxed">{t.text}</div>
              {t.sources && t.sources.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">
                  {t.sources.map((s, j) => (
                    <span
                      key={j}
                      title={`score ${s.score}`}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"
                    >
                      📄 {s.source}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-400">
              L&apos;assistant réfléchit…
            </div>
          </div>
        )}
      </div>

      {/* Saisie */}
      <form
        onSubmit={(e) => { e.preventDefault(); ask(q); }}
        className="mt-4 flex items-end gap-2"
      >
        <textarea
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(q); }
          }}
          rows={2}
          placeholder="Posez votre question sur les dispositifs de financement… (Entrée pour envoyer, Maj+Entrée = nouvelle ligne)"
          className="flex-1 resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-blue-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || q.trim().length < 3}
          className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          Envoyer
        </button>
      </form>
      <p className="mt-2 text-[11px] text-slate-400">
        Les réponses proviennent des documents indexés (BM25 + LLM). Vérifiez les sources avant de vous
        engager auprès d&apos;un client.
      </p>
    </div>
  );
}
