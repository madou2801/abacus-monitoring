"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addTask, setTaskStatus } from "../actions";
import { TASK_STATUS } from "@/lib/labels";

type Task = {
  id: string; title: string; status: string;
  due_at: string | null; assignee_email: string | null; created_at: string;
};

export function TasksCard({
  beneficiaryId, tasks, staffEmails,
}: { beneficiaryId: string; tasks: Task[]; staffEmails: string[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [assignee, setAssignee] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = tasks.filter((t) => t.status === "open");
  const closed = tasks.filter((t) => t.status !== "open");

  function submit() {
    if (!title.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await addTask(beneficiaryId, {
        title,
        due_at: due ? new Date(due).toISOString() : undefined,
        assignee_email: assignee || undefined,
      });
      if (!res.ok) { setError(res.error ?? "Erreur"); return; }
      setTitle(""); setDue("");
      router.refresh();
    });
  }

  function mark(taskId: string, status: "done" | "canceled" | "open") {
    startTransition(async () => {
      const res = await setTaskStatus(taskId, beneficiaryId, status);
      if (!res.ok) { setError(res.error ?? "Erreur"); return; }
      router.refresh();
    });
  }

  const overdue = (t: Task) => t.status === "open" && t.due_at && new Date(t.due_at) < new Date();

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">
        Tâches ({open.length} ouverte{open.length > 1 ? "s" : ""})
      </h2>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nouvelle tâche (ex. rappeler le bénéficiaire)…"
          className="min-w-48 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-800"
        />
        <input
          type="datetime-local"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-600"
        />
        <select
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-600"
        >
          <option value="">Moi</option>
          {staffEmails.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <button
          onClick={submit}
          disabled={pending || !title.trim()}
          className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          Ajouter
        </button>
      </div>
      {error && <p className="mb-2 text-xs text-rose-600">{error}</p>}

      {tasks.length === 0 ? (
        <p className="text-sm text-slate-400">Aucune tâche.</p>
      ) : (
        <ul className="space-y-2">
          {[...open, ...closed].map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-2.5">
              <input
                type="checkbox"
                checked={t.status === "done"}
                onChange={() => mark(t.id, t.status === "done" ? "open" : "done")}
                disabled={pending || t.status === "canceled"}
                className="h-4 w-4"
              />
              <div className="flex-1">
                <span className={`text-sm ${t.status !== "open" ? "text-slate-400 line-through" : "text-slate-800"}`}>
                  {t.title}
                </span>
                <div className="text-xs text-slate-400">
                  {t.assignee_email}
                  {t.due_at && (
                    <span className={overdue(t) ? "ml-2 font-medium text-rose-600" : "ml-2"}>
                      échéance {new Date(t.due_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      {overdue(t) ? " (en retard)" : ""}
                    </span>
                  )}
                </div>
              </div>
              <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${TASK_STATUS[t.status]?.color ?? "bg-slate-100"}`}>
                {TASK_STATUS[t.status]?.label ?? t.status}
              </span>
              {t.status === "open" && (
                <button
                  onClick={() => mark(t.id, "canceled")}
                  disabled={pending}
                  className="text-xs text-slate-300 hover:text-rose-600"
                  title="Annuler la tâche"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
