"use client";

import { useEffect, useMemo, useState } from "react";
import { ComposeEmail, type ComposeInit } from "@/components/ComposeEmail";

type DbEvent = {
  event_type: string;
  title: string;
  detail: string | null;
  occurred_at: string;
};

type MailMsg = {
  id: string;
  threadId: string;
  internalDate: number;
  date: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  direction: "sent" | "received";
  unread: boolean;
};

type MailBody = {
  id: string;
  threadId: string;
  messageId: string;
  subject: string;
  from: string;
  to: string;
  cc: string;
  date: string;
  html: string;
  text: string;
};

// Extrait l'adresse email d'une chaîne "Nom <email>" ou "email".
function extractAddr(s: string): string {
  const m = (s || "").match(/<([^>]+)>/);
  return (m ? m[1] : s || "").trim();
}
// "Re: " en évitant "Re: Re:".
function replySubject(s: string): string {
  return "Re: " + (s || "").replace(/^(re\s*:\s*)+/i, "").trim();
}

const EVENT_ICON: Record<string, string> = {
  call: "📞", email: "✉️", notification: "🔔", wedof: "🎓",
  stage: "➡️", form: "📝", document: "📎", quote: "💶",
  note: "🗒️", task: "✅", edit: "✏️",
};

function fmtDateTime(ts: number): string {
  if (!ts) return "";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    }).format(new Date(ts));
  } catch {
    return "";
  }
}

type Item =
  | { kind: "db"; ts: number; icon: string; title: string; detail: string | null; eventType: string }
  | { kind: "mail"; ts: number; msg: MailMsg };

// Historique unifié : évènements CRM (base) + emails Gmail (boîte contact@monpermiscpf.com),
// fusionnés par date. Les emails sont cliquables pour lire le corps complet.
export function UnifiedTimeline({ events, email }: { events: DbEvent[]; email: string | null }) {
  const [mails, setMails] = useState<MailMsg[]>([]);
  const [mailsLoading, setMailsLoading] = useState<boolean>(!!email);
  const [mailsError, setMailsError] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [bodies, setBodies] = useState<Record<string, MailBody>>({});
  const [bodyLoading, setBodyLoading] = useState<string | null>(null);
  const [bodyError, setBodyError] = useState<string | null>(null);

  const [compose, setCompose] = useState<ComposeInit | null>(null);
  const [reload, setReload] = useState(0);
  const [max, setMax] = useState(25);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    if (!email) {
      setMailsLoading(false);
      return;
    }
    setMailsLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/beneficiary-emails", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, max }),
        });
        const data = await res.json();
        if (!alive) return;
        if (res.ok && data.ok) setMails(data.messages || []);
        else setMailsError(data?.error || "emails indisponibles");
      } catch (e) {
        if (alive) setMailsError(String((e as Error)?.message || e));
      } finally {
        if (alive) setMailsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [email, reload, max]);

  const items = useMemo<Item[]>(() => {
    const dbItems: Item[] = (events || []).map((e) => ({
      kind: "db",
      ts: Date.parse(e.occurred_at) || 0,
      icon: EVENT_ICON[e.event_type] ?? "•",
      title: e.title,
      detail: e.detail,
      eventType: e.event_type,
    }));
    const mailItems: Item[] = mails.map((m) => ({
      kind: "mail",
      ts: m.internalDate || Date.parse(m.date) || 0,
      msg: m,
    }));
    // Dédup : un évènement "email" en base qui coïncide (±3 min) avec un vrai
    // message Gmail est masqué — on garde le message Gmail (plus riche, cliquable).
    const mailTs = mailItems.map((mi) => mi.ts);
    const dbFiltered = dbItems.filter(
      (d) =>
        d.kind !== "db" ||
        d.eventType !== "email" ||
        !mailTs.some((t) => Math.abs(t - d.ts) < 180000)
    );
    let all = [...dbFiltered, ...mailItems].sort((a, b) => b.ts - a.ts);
    const q = query.trim().toLowerCase();
    if (q) {
      all = all.filter((it) =>
        it.kind === "db"
          ? `${it.title} ${it.detail || ""}`.toLowerCase().includes(q)
          : `${it.msg.subject} ${it.msg.from} ${it.msg.to} ${it.msg.snippet}`.toLowerCase().includes(q)
      );
    }
    return all;
  }, [events, mails, query]);

  async function toggle(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    setBodyError(null);
    // marquer lu (optimiste) si le message est non-lu
    const msg = mails.find((x) => x.id === id);
    if (msg && msg.unread) {
      setMails((prev) => prev.map((x) => (x.id === id ? { ...x, unread: false } : x)));
      fetch("/api/mark-read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      }).catch(() => {});
    }
    if (bodies[id]) return;
    setBodyLoading(id);
    try {
      const res = await fetch("/api/email-body", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) setBodyError(data?.error || "Impossible de charger le message");
      else setBodies((b) => ({ ...b, [id]: data.message }));
    } catch (e) {
      setBodyError(String((e as Error)?.message || e));
    } finally {
      setBodyLoading(null);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700">Historique</h2>
        <div className="flex items-center gap-3">
          {mails.some((m) => m.unread) && (
            <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {mails.filter((m) => m.unread).length} non lu{mails.filter((m) => m.unread).length > 1 ? "s" : ""}
            </span>
          )}
          <span className="text-xs text-slate-400">
            {mailsLoading ? "chargement des emails…" : email ? `${mails.length} email${mails.length > 1 ? "s" : ""}` : ""}
          </span>
          {email && (
            <button
              type="button"
              onClick={() => setCompose({ to: email, subject: "" })}
              className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
            >
              ✉️ Nouvel email
            </button>
          )}
        </div>
      </div>

      {email && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher dans l'historique…"
          className="mb-3 w-full rounded border border-slate-200 px-2 py-1 text-xs"
        />
      )}

      {mailsError && <p className="mb-2 text-xs text-amber-600">Emails : {mailsError}</p>}

      {items.length ? (
        <ul className="space-y-3">
          {items.map((it, idx) => {
            if (it.kind === "db") {
              return (
                <li key={`db-${idx}`} className="flex gap-3">
                  <span className="text-lg leading-none">{it.icon}</span>
                  <div className="flex-1 border-b border-slate-100 pb-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-800">{it.title}</span>
                      <span className="text-xs text-slate-400">{fmtDateTime(it.ts)}</span>
                    </div>
                    {it.detail && <div className="text-xs text-slate-500">{it.detail}</div>}
                  </div>
                </li>
              );
            }
            const m = it.msg;
            const isOpen = openId === m.id;
            const body = bodies[m.id];
            return (
              <li key={`mail-${m.id}`} className="flex gap-3">
                <span className="text-lg leading-none" title={m.direction === "sent" ? "Email envoyé" : "Email reçu"}>
                  {m.direction === "sent" ? "📤" : "📥"}
                </span>
                <div className="min-w-0 flex-1 border-b border-slate-100 pb-2">
                  <button type="button" onClick={() => toggle(m.id)} className="block w-full text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`truncate text-sm ${m.unread ? "font-bold text-slate-900" : "font-medium text-slate-800"}`}>
                        {m.unread && (
                          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-500 align-middle" title="Non lu" />
                        )}
                        {m.subject} <span className="ml-1 text-slate-300">{isOpen ? "▾" : "▸"}</span>
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">{fmtDateTime(it.ts)}</span>
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {m.direction === "sent" ? `À : ${m.to}` : `De : ${m.from}`}
                    </div>
                    {!isOpen && m.snippet && (
                      <div className="mt-0.5 line-clamp-1 text-xs text-slate-400">{m.snippet}</div>
                    )}
                  </button>
                  {isOpen && (
                    <div className="mt-2">
                      {bodyLoading === m.id && <p className="text-xs text-slate-400">Chargement du message…</p>}
                      {bodyError && !body && <p className="text-xs text-rose-500">{bodyError}</p>}
                      {body && (body.html ? (
                        <iframe
                          title={`Email ${m.id}`}
                          sandbox=""
                          srcDoc={body.html}
                          className="w-full rounded border border-slate-200 bg-white"
                          style={{ height: 360 }}
                        />
                      ) : body.text ? (
                        <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                          {body.text}
                        </pre>
                      ) : (
                        <p className="text-xs text-slate-400">(corps du message vide)</p>
                      ))}
                      {body && (
                        <button
                          type="button"
                          onClick={() =>
                            setCompose({
                              to: extractAddr(m.direction === "sent" ? m.to : m.from),
                              subject: replySubject(m.subject),
                              inReplyTo: body.messageId || undefined,
                              references: body.messageId || undefined,
                              threadId: body.threadId || m.threadId || undefined,
                            })
                          }
                          className="mt-2 rounded border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          ↩ Répondre
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-slate-400">
          {query ? "Aucun résultat pour cette recherche." : "Aucun évènement."}
        </p>
      )}

      {email && !query && mails.length >= max && max < 100 && (
        <button
          type="button"
          onClick={() => setMax((m) => Math.min(m + 25, 100))}
          disabled={mailsLoading}
          className="mt-3 w-full rounded border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {mailsLoading ? "Chargement…" : "Charger plus d'emails"}
        </button>
      )}

      {compose && (
        <ComposeEmail
          init={compose}
          onClose={() => setCompose(null)}
          onSent={() => {
            setCompose(null);
            setReload((r) => r + 1);
          }}
        />
      )}
    </div>
  );
}
