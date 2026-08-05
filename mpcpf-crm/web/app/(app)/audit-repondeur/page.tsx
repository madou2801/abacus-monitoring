import { pub } from "@/lib/supabase";
import { ReviewControls } from "./ReviewControls";

export const dynamic = "force-dynamic";

type Decision = {
  id: string;
  from_email: string | null;
  subject: string | null;
  action: string | null;
  reason: string | null;
  financement: string | null;
  source: string | null;
  verdict: string | null;
  correct_action: string | null;
  created_at: string | null;
};

function parisDT(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" }) +
    " " +
    d.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" })
  );
}

function ActionBadge({ action }: { action: string | null }) {
  const map: Record<string, { cls: string; label: string }> = {
    skip: { cls: "bg-slate-100 text-slate-600 ring-slate-200", label: "skip" },
    escalate: { cls: "bg-amber-50 text-amber-700 ring-amber-200", label: "escalade" },
    draft: { cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", label: "réponse" },
  };
  const m = map[action || ""] || { cls: "bg-slate-100 text-slate-500 ring-slate-200", label: action || "—" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${m.cls}`}>
      {m.label}
    </span>
  );
}

export default async function Page() {
  const { data, error } = await pub()
    .from("email_decisions_log")
    .select("id, from_email, subject, action, reason, financement, source, verdict, correct_action, created_at")
    .order("created_at", { ascending: false })
    .limit(300);

  const rows = (data || []) as Decision[];
  const reviewed = rows.filter((r) => r.verdict);
  const correct = reviewed.filter((r) => r.verdict === "correct").length;
  const incorrect = reviewed.filter((r) => r.verdict === "incorrect").length;
  const accuracy = reviewed.length ? Math.round((correct / reviewed.length) * 100) : null;
  const toReview = rows.length - reviewed.length;

  const tableMissing = error && /relation|does not exist|email_decisions_log/i.test(error.message || "");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">🛡️ Audit auto-répondeur</h1>
          <p className="max-w-2xl text-sm text-slate-500">
            Chaque décision de l'auto-répondeur email (répondre / escalader / ignorer). Marquez si elle
            est correcte : les erreurs pilotent l'amélioration des règles (objectif « ne pas répondre à
            tort »).
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Stat label="À revoir" value={toReview} tone="amber" />
          <Stat label="Vérifiées" value={reviewed.length} />
          <Stat label="Justesse" value={accuracy == null ? "—" : `${accuracy}%`} tone={accuracy != null && accuracy >= 90 ? "good" : accuracy != null ? "warn" : undefined} />
        </div>
      </header>

      {tableMissing && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          La table <code>email_decisions_log</code> n'existe pas encore. Créez-la (script SQL fourni) pour
          activer le journal — les décisions s'y accumuleront automatiquement.
        </div>
      )}
      {error && !tableMissing && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Erreur : {error.message}
        </div>
      )}

      {reviewed.length > 0 && (
        <p className="text-sm text-slate-500">
          {correct} correctes · {incorrect} à revoir sur {reviewed.length} vérifiées.
          {accuracy != null && ` Taux de justesse : ${accuracy}%.`}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Expéditeur</th>
              <th className="px-4 py-3">Objet</th>
              <th className="px-4 py-3">Décision</th>
              <th className="px-4 py-3">Motif</th>
              <th className="px-4 py-3">Vérification</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`border-b border-slate-100 last:border-0 ${r.verdict ? "bg-slate-50/40" : "hover:bg-slate-50/60"}`}>
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">{parisDT(r.created_at)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">{r.source === "ft" ? "France Travail" : "Contact"}</td>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">{r.from_email || "—"}</td>
                <td className="max-w-xs px-4 py-3 text-slate-600"><span className="line-clamp-1">{r.subject || "—"}</span></td>
                <td className="whitespace-nowrap px-4 py-3">
                  <ActionBadge action={r.action} />
                  {r.financement && <span className="ml-1 text-[11px] text-slate-400">{r.financement}</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">{r.reason || "—"}</td>
                <td className="px-4 py-3">
                  <ReviewControls id={r.id} verdict={r.verdict} correctAction={r.correct_action} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && !tableMissing && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  Aucune décision journalisée pour le moment (elles s'accumulent à chaque email entrant).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "amber" | "good" | "warn" }) {
  const color =
    tone === "amber" ? "text-amber-600" : tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-rose-600" : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-center shadow-sm">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}
