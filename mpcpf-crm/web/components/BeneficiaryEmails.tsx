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

// Carte "Emails" de la fiche bénéficiaire : charge en asynchrone les messages Gmail
// (boîte contact@monpermiscpf.com) impliquant l'adresse du bénéficiaire.
export function BeneficiaryEmails({ email }: { email: string | null }) {
  const [loading, setLoading] = useState<boolean>(!!email);
  const [error, setError] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<MailMsg[]>([]);

  useEffect(() => {
    let alive = true;
    if (!email) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
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
        <ul className="space-y-2">
          {msgs.map((m) => (
            <li key={m.id} className="flex gap-3 border-b border-slate-100 pb-2 last:border-0">
              <span
                className="mt-0.5 text-base leading-none"
                title={m.direction === "sent" ? "Envoyé" : "Reçu"}
              >
                {m.direction === "sent" ? "📤" : "📥"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-slate-800">{m.subject}</span>
                  <span className="shrink-0 text-xs text-slate-400">{fmtDate(m.internalDate, m.date)}</span>
                </div>
                <div className="truncate text-xs text-slate-500">
                  {m.direction === "sent" ? `À : ${m.to}` : `De : ${m.from}`}
                </div>
                {m.snippet && <div className="mt-0.5 line-clamp-2 text-xs text-slate-400">{m.snippet}</div>}
              </div>
            </li>
          ))}
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
