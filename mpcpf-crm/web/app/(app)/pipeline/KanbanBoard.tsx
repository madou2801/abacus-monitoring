"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { STAGES, FINANCEUR_LABEL } from "@/lib/labels";
import { moveStage } from "./actions";

type Card = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  financeur?: string | null;
  auto_ecole_id?: string | null;
  ae_match_needs_review?: boolean | null;
};

const PER_COLUMN = 40;

const HEAD: Record<string, string> = {
  lead: "border-slate-300", contact_etabli: "border-sky-300", qualifie: "border-indigo-300",
  inscrit: "border-violet-300", en_formation: "border-amber-300", certifie: "border-emerald-300",
  perdu: "border-rose-300",
};

function title(b: Card): string {
  const n = [b.first_name, b.last_name].filter(Boolean).join(" ").trim();
  if (n) return n;
  if (b.phone) return `📞 ${b.phone}`;
  if (b.email) return b.email;
  return "Sans nom";
}

export function KanbanBoard({
  initial, aeName,
}: { initial: Record<string, Card[]>; aeName: Record<string, string> }) {
  const [cols, setCols] = useState<Record<string, Card[]>>(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  function findCard(id: string): { card: Card; from: string } | null {
    for (const [stage, list] of Object.entries(cols)) {
      const card = list.find((c) => c.id === id);
      if (card) return { card, from: stage };
    }
    return null;
  }

  function drop(toStage: string) {
    setOverStage(null);
    const id = dragId;
    setDragId(null);
    if (!id) return;
    const found = findCard(id);
    if (!found || found.from === toStage) return;

    const snapshot = cols;
    // Optimiste : déplace la carte tout de suite.
    setCols((prev) => {
      const next: Record<string, Card[]> = {};
      for (const [s, list] of Object.entries(prev)) next[s] = list.filter((c) => c.id !== id);
      next[toStage] = [found.card, ...(next[toStage] ?? [])];
      return next;
    });

    startTransition(async () => {
      const res = await moveStage(id, toStage);
      if (!res.ok) {
        setCols(snapshot); // revert
        setToast(res.error ?? "Déplacement refusé");
        setTimeout(() => setToast(null), 3500);
      }
    });
  }

  return (
    <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-rose-600 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
      {STAGES.map((s) => {
        const items = cols[s.code] ?? [];
        const isOver = overStage === s.code;
        return (
          <div
            key={s.code}
            className={`flex w-72 shrink-0 flex-col rounded-lg transition ${isOver ? "bg-brand/5 ring-2 ring-brand/40" : ""}`}
            onDragOver={(e) => { e.preventDefault(); if (overStage !== s.code) setOverStage(s.code); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverStage(null); }}
            onDrop={() => drop(s.code)}
          >
            <div className={`mb-2 flex items-center justify-between border-b-2 ${HEAD[s.code] ?? "border-slate-300"} px-1 pb-2`}>
              <span className="text-sm font-semibold text-slate-700">{s.label}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{items.length}</span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto px-1 pr-1">
              {items.slice(0, PER_COLUMN).map((b) => (
                <div
                  key={b.id}
                  draggable
                  onDragStart={() => setDragId(b.id)}
                  onDragEnd={() => { setDragId(null); setOverStage(null); }}
                  className={`group block cursor-grab rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm transition hover:border-brand hover:shadow active:cursor-grabbing ${dragId === b.id ? "opacity-40" : ""} ${pending ? "pointer-events-none" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/beneficiaires/${b.id}`} className="font-medium text-slate-800 hover:text-brand hover:underline">
                      {title(b)}
                    </Link>
                    <span className="select-none text-slate-300 group-hover:text-slate-400">⠿</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                    <span>{FINANCEUR_LABEL[b.financeur ?? ""] ?? "—"}</span>
                    {b.auto_ecole_id && (
                      <span className="truncate pl-2 text-right text-slate-400">
                        {aeName[b.auto_ecole_id] ?? ""}
                        {b.ae_match_needs_review && <span className="ml-1 text-amber-500">•</span>}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {items.length > PER_COLUMN && (
                <div className="pt-1 text-center text-xs text-slate-400">+ {items.length - PER_COLUMN} autres…</div>
              )}
              {items.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-xs text-slate-300">déposer ici</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
