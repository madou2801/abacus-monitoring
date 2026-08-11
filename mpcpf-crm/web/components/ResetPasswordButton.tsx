"use client";

import { useState } from "react";
import { resetUserPassword } from "@/lib/actions/resetPassword";

export function ResetPasswordButton({
  email,
  cible,
  prenom,
  compact,
}: {
  email: string | null | undefined;
  cible: "eleve" | "autoecole";
  prenom?: string | null;
  compact?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!email) return <span className="text-xs text-slate-400">Pas d'email</span>;

  async function run() {
    if (!confirm(`Réinitialiser le mot de passe de ${email} et le lui envoyer par email ?`)) return;
    setLoading(true);
    setMsg(null);
    const r = await resetUserPassword({ email: email!, cible, prenom });
    setLoading(false);
    if (r.ok) {
      setMsg({
        ok: true,
        text: `✓ ${r.created ? "Compte créé + " : ""}Mot de passe : ${r.password}` + (r.error ? ` — ⚠️ ${r.error}` : ` — envoyé à ${email}`),
      });
    } else {
      setMsg({ ok: false, text: `✗ ${r.error}` });
    }
  }

  return (
    <div className={compact ? "inline-block" : ""}>
      <button
        onClick={run}
        disabled={loading}
        className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
      >
        {loading ? "…" : "🔑 Réinitialiser le mot de passe"}
      </button>
      {msg && (
        <p className={`mt-1 text-xs ${msg.ok ? "text-emerald-700" : "text-rose-600"}`}>{msg.text}</p>
      )}
    </div>
  );
}
