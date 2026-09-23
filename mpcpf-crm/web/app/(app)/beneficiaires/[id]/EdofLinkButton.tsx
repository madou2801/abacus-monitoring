"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getEdofOptions, sendEdofByCode, type EdofGroupe, type EdofFormationChoice } from "../actions";

// Sélecteur guidé du lien d'inscription CPF : on part de la formation DÉJÀ indiquée sur
// la fiche (pré-sélectionnée ; menu déroulant si plusieurs), on en déduit la famille
// permis + le forfait par défaut (le plus courant), modifiables. Plus de recherche texte
// libre → fin des soucis d'accent / de troncature.
export function EdofLinkButton({
  beneficiaryId,
  hasEmail,
}: {
  beneficiaryId: string;
  hasEmail: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formations, setFormations] = useState<EdofFormationChoice[]>([]);
  const [groupes, setGroupes] = useState<EdofGroupe[]>([]);
  const [selFormation, setSelFormation] = useState("");
  const [selGroupe, setSelGroupe] = useState("");
  const [selCode, setSelCode] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  function applyGroupe(groupeKey: string, presetCode: string | null, gs: EdofGroupe[]) {
    setSelGroupe(groupeKey);
    const g = gs.find((x) => x.key === groupeKey) ?? null;
    const preset = presetCode && g?.forfaits.some((f) => f.code === presetCode) ? presetCode : null;
    setSelCode(preset ?? g?.defaut ?? "");
  }

  async function openModal() {
    setOpen(true);
    setMsg(null);
    setLoading(true);
    try {
      const res = await getEdofOptions(beneficiaryId);
      if (!res.ok) {
        setMsg({ type: "err", text: res.error ?? "Chargement impossible." });
        return;
      }
      setFormations(res.formations);
      setGroupes(res.groupes);
      // Pré-sélection : la 1re formation reconnue comme permis, sinon la 1re formation.
      const first = res.formations.find((f) => f.groupeKey) ?? res.formations[0] ?? null;
      setSelFormation(first?.key ?? "");
      if (first?.groupeKey) {
        applyGroupe(first.groupeKey, first.presetCode, res.groupes);
      } else {
        setSelGroupe("");
        setSelCode("");
      }
    } finally {
      setLoading(false);
    }
  }

  function onSelectFormation(key: string) {
    setSelFormation(key);
    const f = formations.find((x) => x.key === key) ?? null;
    if (f?.groupeKey) {
      applyGroupe(f.groupeKey, f.presetCode, groupes);
    } else {
      setSelGroupe("");
      setSelCode("");
    }
  }

  function onSelectGroupe(key: string) {
    if (!key) {
      setSelGroupe("");
      setSelCode("");
      return;
    }
    applyGroupe(key, null, groupes);
  }

  const groupe = groupes.find((g) => g.key === selGroupe) ?? null;

  function send() {
    if (!selCode) {
      setMsg({ type: "err", text: "Choisissez la formation et le forfait." });
      return;
    }
    setMsg(null);
    startTransition(async () => {
      const res = await sendEdofByCode(beneficiaryId, selCode, message.trim() || undefined);
      if (!res.ok) {
        setMsg({ type: "err", text: res.error ?? "Erreur" });
        return;
      }
      setMsg({ type: "ok", text: res.message ?? "Lien envoyé." });
      router.refresh();
      setTimeout(() => setOpen(false), 1200);
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Lien d'inscription CPF (moncompteformation)</h2>

      {!hasEmail ? (
        <p className="text-xs text-slate-400">Renseignez l'email du bénéficiaire pour pouvoir envoyer le lien.</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-slate-500">
            Envoie au bénéficiaire le lien officiel moncompteformation.gouv.fr pour s'inscrire en autonomie (suivi du clic inclus).
          </p>
          <button
            onClick={openModal}
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Envoyer le lien d'inscription CPF
          </button>
        </>
      )}

      {msg && !open && (
        <p className={`mt-2 text-xs ${msg.type === "ok" ? "text-emerald-600" : "text-rose-600"}`}>{msg.text}</p>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-base font-semibold text-slate-800">Envoyer le lien d'inscription CPF</h3>

            {loading ? (
              <p className="py-6 text-center text-sm text-slate-400">Chargement des formations…</p>
            ) : (
              <>
                {formations.length > 0 && (
                  <label className="mb-3 block">
                    <span className="mb-1 block text-xs font-medium text-slate-600">
                      Formation {formations.length > 1 ? "(plusieurs sur la fiche)" : "du bénéficiaire"}
                    </span>
                    <select
                      value={selFormation}
                      onChange={(e) => onSelectFormation(e.target.value)}
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    >
                      {formations.map((f) => (
                        <option key={f.key} value={f.key}>{f.rawLabel}</option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="mb-3 block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Type de permis</span>
                  <select
                    value={selGroupe}
                    onChange={(e) => onSelectGroupe(e.target.value)}
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="">— choisir —</option>
                    {groupes.map((g) => (
                      <option key={g.key} value={g.key}>{g.label}</option>
                    ))}
                  </select>
                </label>

                {!selGroupe && (
                  <p className="mb-3 text-xs text-amber-600">
                    Formation non reconnue automatiquement — choisissez le type de permis ci-dessus.
                  </p>
                )}

                {groupe && groupe.forfaits.length > 1 && (
                  <label className="mb-3 block">
                    <span className="mb-1 block text-xs font-medium text-slate-600">Forfait</span>
                    <select
                      value={selCode}
                      onChange={(e) => setSelCode(e.target.value)}
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    >
                      {groupe.forfaits.map((f) => (
                        <option key={f.code} value={f.code}>{f.label}</option>
                      ))}
                    </select>
                  </label>
                )}

                {groupe && groupe.forfaits.length === 1 && (
                  <p className="mb-3 text-xs text-slate-500">Forfait : <span className="font-medium text-slate-700">{groupe.forfaits[0].label}</span></p>
                )}

                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Message personnalisé (optionnel) — ajouté en tête de l'email."
                  rows={2}
                  className="mb-3 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />

                {msg && (
                  <p className={`mb-2 text-xs ${msg.type === "ok" ? "text-emerald-600" : "text-rose-600"}`}>{msg.text}</p>
                )}

                <div className="flex justify-end gap-2">
                  <button onClick={() => setOpen(false)} className="rounded px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100">
                    Annuler
                  </button>
                  <button
                    onClick={send}
                    disabled={pending || !selCode}
                    className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {pending ? "Envoi…" : "Envoyer le lien"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
