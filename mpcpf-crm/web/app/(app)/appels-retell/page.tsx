import { crm } from "@/lib/supabase";

// Toujours frais : on veut voir les appels du jour dès la synchro Retell.
export const dynamic = "force-dynamic";

type CallRow = {
  id: string;
  from_number: string | null;
  to_number: string | null;
  direction: string | null;
  started_at: string | null;
  disconnection_reason: string | null;
  duration_ms: number | null;
  outcome: string | null;
  call_successful: boolean | null;
  summary: string | null;
  beneficiary_id: string | null;
};

function formatPhoneFr(p?: string | null): string {
  if (!p) return "—";
  const d = p.replace(/\D/g, "");
  // +33 6 xx xx xx xx -> 06 xx xx xx xx
  let local = d;
  if (d.startsWith("33") && d.length >= 11) local = "0" + d.slice(2);
  if (local.length === 10) return local.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  return p;
}

function parisDateTime(iso?: string | null): { day: string; time: string; ts: number } {
  if (!iso) return { day: "—", time: "", ts: 0 };
  const dte = new Date(iso);
  const day = dte.toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
  const time = dte.toLocaleTimeString("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  });
  return { day, time, ts: dte.getTime() };
}

function durationLabel(ms?: number | null): string {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m${String(s % 60).padStart(2, "0")}` : `${s}s`;
}

// Statut de transfert vers un conseiller.
// 'call_transfer' = transfert réellement abouti. Sinon on détecte une DEMANDE dans le résumé.
function transferStatus(c: CallRow): { label: string; tone: "done" | "asked" | "none" } {
  if ((c.disconnection_reason || "").toLowerCase().includes("transfer")) {
    return { label: "Transféré", tone: "done" };
  }
  const s = (c.summary || "").toLowerCase();
  if (/conseiller|advisor|human advisor|humain|parler à quelqu|agent humain/.test(s)) {
    return { label: "Demandé", tone: "asked" };
  }
  return { label: "—", tone: "none" };
}

function isToday(ts: number): boolean {
  if (!ts) return false;
  const now = new Date();
  const p = (d: Date) => d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
  return p(new Date(ts)) === p(now);
}

export default async function Page() {
  const db = crm();

  const { data: rawCalls, error } = await db
    .from("calls")
    .select(
      "id,from_number,to_number,direction,started_at,disconnection_reason,duration_ms,outcome,call_successful,summary,beneficiary_id"
    )
    .order("started_at", { ascending: false })
    .limit(400);

  const calls = (rawCalls || []) as CallRow[];

  // Noms des bénéficiaires rattachés (via beneficiary_id).
  const ids = Array.from(new Set(calls.map((c) => c.beneficiary_id).filter(Boolean))) as string[];
  const id2name = new Map<string, string>();
  if (ids.length) {
    const { data: benefs } = await db
      .from("beneficiaries")
      .select("id,first_name,last_name")
      .in("id", ids);
    for (const b of benefs || []) {
      const nm = [b.first_name, b.last_name].filter(Boolean).join(" ").trim();
      if (nm) id2name.set(b.id as string, nm);
    }
  }

  const enriched = calls.map((c) => {
    const dt = parisDateTime(c.started_at);
    return { c, dt, transfer: transferStatus(c), name: c.beneficiary_id ? id2name.get(c.beneficiary_id) || "" : "" };
  });

  const todays = enriched.filter((e) => isToday(e.dt.ts));
  const todaysTransfers = todays.filter((e) => e.transfer.tone === "done").length;
  const todaysAsked = todays.filter((e) => e.transfer.tone !== "none").length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">📞 Appels Retell</h1>
          <p className="text-sm text-slate-500">
            Appels reçus par les agents vocaux (Lucie). Numéro, heure, demande de transfert vers un
            conseiller, et bénéficiaire si présent dans la base.
          </p>
        </div>
        <div className="flex gap-3">
          <Stat label="Appels aujourd'hui" value={todays.length} />
          <Stat label="Transferts aboutis (jour)" value={todaysTransfers} tone="done" />
          <Stat label="Demandes conseiller (jour)" value={todaysAsked} tone="asked" />
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Erreur de chargement : {error.message}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Date / heure</th>
              <th className="px-4 py-3">Numéro</th>
              <th className="px-4 py-3">Sens</th>
              <th className="px-4 py-3">Transfert conseiller</th>
              <th className="px-4 py-3">Bénéficiaire</th>
              <th className="px-4 py-3">Durée</th>
              <th className="px-4 py-3">Résumé</th>
            </tr>
          </thead>
          <tbody>
            {enriched.map(({ c, dt, transfer, name }) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="whitespace-nowrap px-4 py-3">
                  <span className="font-medium text-slate-800">{dt.time}</span>{" "}
                  <span className="text-slate-400">{dt.day}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums text-slate-800">
                  {formatPhoneFr(c.from_number)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                  {c.direction === "inbound" ? "↘ entrant" : c.direction === "outbound" ? "↗ sortant" : "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <TransferBadge tone={transfer.tone} label={transfer.label} />
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {name ? (
                    <span className="font-medium text-slate-800">{name}</span>
                  ) : (
                    <span className="text-slate-400">hors base</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-500">
                  {durationLabel(c.duration_ms)}
                </td>
                <td className="max-w-md px-4 py-3 text-slate-500">
                  <span className="line-clamp-2">{c.summary || "—"}</span>
                </td>
              </tr>
            ))}
            {enriched.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  Aucun appel synchronisé pour le moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Source : Retell → table <code>crm.calls</code> (synchro automatique). « Transféré » = mise en
        relation aboutie avec un conseiller ; « Demandé » = l'appelant a demandé un humain sans
        transfert abouti.
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "done" | "asked" }) {
  const color =
    tone === "done" ? "text-emerald-600" : tone === "asked" ? "text-amber-600" : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-center shadow-sm">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}

function TransferBadge({ tone, label }: { tone: "done" | "asked" | "none"; label: string }) {
  if (tone === "none") return <span className="text-slate-300">—</span>;
  const cls =
    tone === "done"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : "bg-amber-50 text-amber-700 ring-amber-200";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}`}>
      {tone === "done" ? "✅ " : "⏳ "}
      {label}
    </span>
  );
}
