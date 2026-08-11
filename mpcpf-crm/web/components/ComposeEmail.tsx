"use client";

import { useState } from "react";

export type ComposeInit = {
  to: string;
  subject: string;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
};

// Modale de composition / réponse d'email, envoi via /api/send-email
// (contact@monpermiscpf.com). Si threadId présent -> réponse dans le fil.
export function ComposeEmail({
  init,
  onClose,
  onSent,
}: {
  init: ComposeInit;
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState(init.to || "");
  const [subject, setSubject] = useState(init.subject || "");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setError(null);
    if (!to.trim() || !body.trim()) {
      setError("Destinataire et message requis.");
      return;
    }
    setSending(true);
    const esc = body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html =
      '<div style="font-family:Arial,sans-serif;font-size:14px;color:#111;white-space:pre-wrap">' +
      esc +
      "</div>";
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to: to.trim(),
          subject,
          html,
          inReplyTo: init.inReplyTo,
          references: init.references,
          threadId: init.threadId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data?.error || "Échec de l'envoi");
        setSending(false);
        return;
      }
      onSent();
    } catch (e) {
      setError(String((e as Error)?.message || e));
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">
            {init.threadId ? "↩ Répondre" : "✉️ Nouvel email"}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-slate-500">À</label>
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Objet</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              autoFocus
              className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
            />
          </div>
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={send}
              disabled={sending}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {sending ? "Envoi…" : "Envoyer"}
            </button>
            <button
              onClick={onClose}
              className="rounded border border-slate-200 px-3 py-1.5 text-sm text-slate-600"
            >
              Annuler
            </button>
            <span className="ml-auto text-xs text-slate-400">via contact@monpermiscpf.com</span>
          </div>
        </div>
      </div>
    </div>
  );
}
