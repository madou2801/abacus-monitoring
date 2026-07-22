"use client";

import { useEffect, useState } from "react";

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
};

type MailBody = {
  id: string;
  subject: string;
  from: string;
  to: string;
  cc: string;
  date: string;
  html: string;
  text: string;
};

function fmtDate(internalDate: number, fallback: string): string {
  const ts = internalDate || Date.parse(fallback);
  if (!ts) return "";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ts));
  } catch {
    return "";
  }
}

// Carte "Emails" de la fiche bénéficiaire : liste des messages Gmail
// (boîte contact@monpermiscpf.com) impliquant l'adresse du bénéficiaire.
// Clic sur un message -> dépliage du corps complet (rendu en iframe sandboxé).
export function BeneficiaryEmails({ email }: { email: string | null }) {
  const [loading, setLoading] = useState<boolean>(!!email);
  const [error, setError] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<MailMsg[]>([]);

  const [openId, setOpenId] = useState<string | null>(null);
  const [bodies, setBodies] = useState<Record<string, MailBody>>({});
  const [bodyLoading, setBodyLoading] = useState<string | null>(null);
  const [bodyError, setBodyError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!email) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setOpenId(null);
    (async () => {
      try {
        const res = await fetch("/api/beneficiary-emails", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (!alive) return;
        if (!res.ok || !data.ok) {
          setError(data?.error || "Erreur de chargement");
          setMsgs([]);
        } else {
          setMsgs(data.messages || []);
        }
      } catch (e) {
        if (alive) setError(String((e as Error)?.message || e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [email]);

  async function toggle(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    setBodyError(null);
    if (bodies[id]) return; // déjà chargé
    setBodyLoading(id);
    try {
      const res = await fetch("/api/email-body", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setBodyError(data?.error || "Impossible de charger le message");
      } else {
        setBodies((b) => ({ ...b, [id]: data.message }));
      }
    } catch (e) {
      setBodyError(String((e as Error)?.message || e));
    } finally {
      setBodyLoading(null);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">
        Emails {msgs.length ? `(${msgs.length})` : ""}
        {email ? <span className="ml-2 font-normal text-slate-400">{email}</span> : null}
      </h2>

      {!email && <p className="text-sm text-slate-400">Aucune adresse email sur ce dossier.</p>}
      {email && loading && <p className="text-sm text-slate-400">Chargement des emails…</p>}
      {email && !loading && error && <p className="text-sm text-rose-500">Erreur : {error}</p>}
      {email && !loading && !error && msgs.length === 0 && (
        <p className="text-sm text-slate-400">Aucun email trouvé pour cette adresse.</p>
      )}

      {msgs.length > 0 && (
        <ul className="space-y-1">
          {msgs.map((m) => {
            const isOpen = openId === m.id;
            const body = bodies[m.id];
            return (
              <li key={m.id} className="border-b border-slate-100 pb-1 last:border-0">
                <button
                  type="button"
                  onClick={() => toggle(m.id)}
                  className="flex w-full gap-3 rounded px-1 py-1.5 text-left hover:bg-slate-50"
                >
                  <span
                    className="mt-0.5 text-base leading-none"
                    title={m.direction === "sent" ? "Envoyé" : "Reçu"}
                  >
                    {m.direction === "sent" ? "📤" : "📥"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-slate-800">{m.subject}</span>
                      <span className="shrink-0 text-xs text-slate-400">{fmtDate(m.internalDate, m.date)}</span>
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {m.direction === "sent" ? `À : ${m.to}` : `De : ${m.from}`}
                    </span>
                    {!isOpen && m.snippet && (
                      <span className="mt-0.5 line-clamp-2 block text-xs text-slate-400">{m.snippet}</span>
                    )}
                  </span>
                  <span className="mt-0.5 shrink-0 text-xs text-slate-300">{isOpen ? "▾" : "▸"}</span>
                </button>

                {isOpen && (
                  <div className="mb-2 ml-7 mr-1">
                    {bodyLoading === m.id && <p className="text-xs text-slate-400">Chargement du message…</p>}
                    {bodyError && !body && <p className="text-xs text-rose-500">{bodyError}</p>}
                    {body && (
                      <>
                        {(body.cc || "") && <div className="mb-1 text-[11px] text-slate-400">Cc : {body.cc}</div>}
                        {body.html ? (
                          <iframe
                            title={`Email ${m.id}`}
                            sandbox=""
                            srcDoc={body.html}
                            className="w-full rounded border border-slate-200 bg-white"
                            style={{ height: 380 }}
                          />
                        ) : body.text ? (
                          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                            {body.text}
                          </pre>
                        ) : (
                          <p className="text-xs text-slate-400">(corps du message vide)</p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <a
        href="https://mail.google.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block text-xs text-slate-400 hover:underline"
      >
        Ouvrir la boîte contact@monpermiscpf.com ↗
      </a>
    </div>
  );
}
