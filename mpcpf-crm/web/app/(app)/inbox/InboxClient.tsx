"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ComposeEmail } from "@/components/ComposeEmail";
import type { MailMsg, MailBody } from "@/lib/gmail";

export type Conversation = MailMsg & {
  count: number;
  counterpart: string;
  benef: { id: string; name: string } | null;
};

function dateShort(v: string, internalDate: number): string {
  const d = internalDate ? new Date(internalDate) : v ? new Date(v) : null;
  if (!d || isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function nameFrom(header: string): string {
  const m = (header || "").match(/^\s*"?([^"<]+?)"?\s*</);
  return (m ? m[1] : header || "").trim();
}

export function InboxClient({
  conversations,
  filter,
  search,
}: {
  conversations: Conversation[];
  filter: "all" | "unread";
  search: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(search);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [body, setBody] = useState<MailBody | null>(null);
  const [loadingBody, setLoadingBody] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (filter === "unread") p.set("filter", "unread");
    router.push(`/inbox?${p.toString()}`);
  }

  function setFilter(f: "all" | "unread") {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (f === "unread") p.set("filter", "unread");
    router.push(`/inbox?${p.toString()}`);
  }

  async function open(c: Conversation) {
    setSelected(c);
    setBody(null);
    setLoadingBody(true);
    try {
      const res = await fetch("/api/email-body", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: c.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.ok && data.message) setBody(data.message);
    } finally {
      setLoadingBody(false);
    }
    if (c.unread) {
      fetch("/api/mark-read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: c.id }),
      })
        .then(() => router.refresh())
        .catch(() => {});
    }
  }

  return (
    <div className="flex min-h-0 flex-1 gap-4">
      {/* Colonne liste */}
      <div className="flex w-full max-w-sm flex-col rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-3">
          <form onSubmit={submitSearch} className="flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher (nom, email, mot-clé)…"
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
            <button className="rounded-md bg-slate-800 px-3 text-sm text-white">🔍</button>
          </form>
          <div className="mt-2 flex gap-1 text-xs">
            <button
              onClick={() => setFilter("all")}
              className={`rounded-full px-3 py-1 ${filter === "all" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              Tous
            </button>
            <button
              onClick={() => setFilter("unread")}
              className={`rounded-full px-3 py-1 ${filter === "unread" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              Non lus
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {conversations.length === 0 && (
            <p className="p-4 text-sm text-slate-400">Aucune conversation.</p>
          )}
          {conversations.map((c) => {
            const active = selected?.id === c.id;
            const who = c.benef?.name || nameFrom(c.direction === "sent" ? c.to : c.from) || c.counterpart || "—";
            return (
              <button
                key={c.id}
                onClick={() => open(c)}
                className={`flex w-full flex-col gap-0.5 border-b border-slate-50 px-3 py-2.5 text-left hover:bg-slate-50 ${
                  active ? "bg-blue-50" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  {c.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" />}
                  <span className={`flex-1 truncate text-sm ${c.unread ? "font-semibold text-slate-900" : "text-slate-700"}`}>
                    {c.direction === "sent" ? "↗ " : ""}
                    {who}
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-400">{dateShort(c.date, c.internalDate)}</span>
                </div>
                <span className={`truncate text-xs ${c.unread ? "font-medium text-slate-700" : "text-slate-500"}`}>
                  {c.subject}
                  {c.count > 1 && <span className="ml-1 text-slate-400">({c.count})</span>}
                </span>
                <span className="truncate text-[11px] text-slate-400">{c.snippet}</span>
                {c.benef && (
                  <span className="mt-0.5 inline-flex w-fit items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">
                    🧑 fiche liée
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Colonne détail */}
      <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
            Sélectionnez une conversation pour la lire.
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-slate-900">{selected.subject}</h2>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {selected.direction === "sent" ? "À " : "De "}
                  <span className="font-medium text-slate-700">{selected.direction === "sent" ? selected.to : selected.from}</span>
                </p>
                {selected.benef && (
                  <Link
                    href={`/beneficiaires/${selected.benef.id}`}
                    className="mt-1 inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-100"
                  >
                    🧑 Ouvrir la fiche · {selected.benef.name}
                  </Link>
                )}
              </div>
              <button
                onClick={() => setReplyOpen(true)}
                className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                ↩ Répondre
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-4">
              {loadingBody ? (
                <p className="text-sm text-slate-400">Chargement…</p>
              ) : body ? (
                body.html ? (
                  <iframe
                    title="corps"
                    sandbox=""
                    srcDoc={body.html}
                    className="h-full min-h-[300px] w-full rounded border border-slate-100"
                  />
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700">{body.text || "(vide)"}</pre>
                )
              ) : (
                <p className="text-sm text-slate-400">Contenu indisponible.</p>
              )}
            </div>
          </>
        )}
      </div>

      {replyOpen && selected && (
        <ComposeEmail
          init={{
            to: selected.direction === "sent" ? selected.to : selected.from,
            subject: selected.subject.startsWith("Re:") ? selected.subject : `Re: ${selected.subject}`,
            threadId: selected.threadId,
            inReplyTo: body?.messageId,
            references: body?.messageId,
          }}
          onClose={() => setReplyOpen(false)}
          onSent={() => {
            setReplyOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
