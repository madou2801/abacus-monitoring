"use client";

import { useState, useTransition } from "react";
import { reviewDecision, resetDecision } from "./actions";

const ACTIONS = [
  { code: "skip", label: "Ne pas répondre (skip)" },
  { code: "escalate", label: "Escalader (humain)" },
  { code: "draft", label: "Répondre (draft)" },
];

export function ReviewControls({
  id,
  verdict,
  correctAction,
}: {
  id: string;
  verdict: string | null;
  correctAction: string | null;
}) {
  const [pending, start] = useTransition();
  const [wrong, setWrong] = useState(false);
  const [action, setAction] = useState(correctAction || "");

  if (verdict === "correct") {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
          ✓ Correct
        </span>
        <button onClick={() => start(() => { void resetDecision(id); })} className="text-xs text-slate-400 hover:text-slate-600" disabled={pending}>
          annuler
        </button>
      </div>
    );
  }
  if (verdict === "incorrect") {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
          ✗ À revoir{correctAction ? ` → ${correctAction}` : ""}
        </span>
        <button onClick={() => start(() => { void resetDecision(id); })} className="text-xs text-slate-400 hover:text-slate-600" disabled={pending}>
          annuler
        </button>
      </div>
    );
  }

  if (wrong) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs"
        >
          <option value="">Bonne action…</option>
          {ACTIONS.map((a) => (
            <option key={a.code} value={a.code}>
              {a.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => action && start(() => { void reviewDecision(id, "incorrect", action); })}
          disabled={pending || !action}
          className="rounded-md bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"
        >
          Valider
        </button>
        <button onClick={() => setWrong(false)} className="text-xs text-slate-400 hover:text-slate-600">
          annuler
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => start(() => { void reviewDecision(id, "correct"); })}
        disabled={pending}
        className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
        title="La décision du module est correcte"
      >
        ✓ Correct
      </button>
      <button
        onClick={() => setWrong(true)}
        disabled={pending}
        className="rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-40"
        title="Le module s'est trompé"
      >
        ✗ À revoir
      </button>
    </div>
  );
}
