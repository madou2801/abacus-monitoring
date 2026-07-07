"use client";

import { useState } from "react";
import { addMember } from "./actions";

export function AddMember() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("staff");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; error?: string; tempPassword?: string; email?: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setRes(null);
    const r = await addMember({ email, full_name: name, role });
    setBusy(false); setRes(r);
    if (r.ok) { setEmail(""); setName(""); setRole("staff"); }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-slate-500">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="prenom@abacus-rh.com" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">Nom complet</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Prénom Nom" />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-slate-500">Rôle</label>
        <select value={role} onChange={(e) => setRole(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="staff">Staff</option>
          <option value="admin">Admin (peut ajouter des membres)</option>
        </select>
      </div>
      <button disabled={busy} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? "…" : "Ajouter le membre"}
      </button>

      {res && !res.ok && <p className="text-sm text-rose-600">{res.error}</p>}
      {res && res.ok && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <b>Membre ajouté</b> ({res.email}).<br />
          {res.tempPassword
            ? <>Mot de passe temporaire : <code className="rounded bg-white px-1.5 py-0.5 font-mono text-emerald-900">{res.tempPassword}</code> — transmets-le-lui, il pourra le changer dans « Paramètres ».</>
            : <>Le compte existait déjà — il a été ajouté à l'accès CRM (mot de passe inchangé).</>}
        </div>
      )}
    </form>
  );
}
