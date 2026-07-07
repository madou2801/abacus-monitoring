"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export function ChangePassword() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; err?: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (pw.length < 8) return setMsg({ err: "8 caractères minimum." });
    if (pw !== pw2) return setMsg({ err: "Les mots de passe ne correspondent pas." });
    setBusy(true);
    const sb = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { error } = await sb.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) setMsg({ err: error.message });
    else { setMsg({ ok: "Mot de passe mis à jour ✓" }); setPw(""); setPw2(""); }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="text-xs font-medium text-slate-500">Nouveau mot de passe</label>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="8 caractères minimum" />
      </div>
      <div>
        <label className="text-xs font-medium text-slate-500">Confirmer</label>
        <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Retapez le mot de passe" />
      </div>
      {msg?.err && <p className="text-sm text-rose-600">{msg.err}</p>}
      {msg?.ok && <p className="text-sm text-emerald-600">{msg.ok}</p>}
      <button disabled={busy} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? "…" : "Changer mon mot de passe"}
      </button>
    </form>
  );
}
