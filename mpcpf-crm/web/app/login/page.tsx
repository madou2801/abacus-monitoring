"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/utils/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const sb = supabaseBrowser();
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setError("Identifiants invalides.");
      setLoading(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="text-xl font-bold text-slate-900">Super-CRM</div>
          <div className="text-xs text-slate-500">MonPermisCPF — accès staff</div>
        </div>
        <label className="mb-3 block text-sm">
          <span className="text-slate-600">Email</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="mb-4 block text-sm">
          <span className="text-slate-600">Mot de passe</span>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}
        <button disabled={loading}
          className="w-full rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {loading ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </div>
  );
}
