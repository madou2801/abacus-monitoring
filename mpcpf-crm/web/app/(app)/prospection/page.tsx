export const dynamic = "force-dynamic";

const STATS_URL = process.env.FINANCEMENTS_STATS_URL ?? "https://financements.abacus-rh.com/stats";

type Stats = {
  generated_at: string;
  base: {
    companies: number; with_contact: number; with_contact_pct: number;
    domain_pct: number; exploitable_pct: number; generic_pct: number;
    contacts: number; hot_prospects: number; poei: number; decp: number;
    dod: { domain_ok: boolean; exploitable_ok: boolean; generic_ok: boolean };
  };
  campaign: {
    targets: number; sent: number; remaining: number; optout: number;
    safe_emails: number; with_aids: number; by_opco: Record<string, number>; schedule: string;
  };
};

async function getStats(): Promise<Stats | null> {
  try {
    const r = await fetch(STATS_URL, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as Stats;
  } catch {
    return null;
  }
}

function Kpi({ label, value, sub, tone = "slate" }: {
  label: string; value: string; sub?: string; tone?: "slate" | "green" | "amber" | "blue";
}) {
  const toneCls = {
    slate: "text-slate-900", green: "text-emerald-600", amber: "text-amber-600", blue: "text-blue-600",
  }[tone];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${toneCls}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function Dod({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
      ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
    }`}>
      {ok ? "✓" : "•"} {label}
    </span>
  );
}

export default async function Page() {
  const s = await getStats();

  if (!s) {
    return (
      <div className="p-6 lg:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Prospection Financements</h1>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Impossible de charger les statistiques (endpoint <code>{STATS_URL}</code> injoignable).
        </div>
      </div>
    );
  }

  const { base, campaign } = s;
  const sentPct = campaign.targets ? Math.round((100 * campaign.sent) / campaign.targets) : 0;

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Prospection Financements</h1>
          <p className="text-sm text-slate-500">
            Acquisition entreprises — base T1 & campagne d'approche. En amont de l'onglet Entreprises
            (un prospect converti y devient client).
          </p>
        </div>
        <div className="text-xs text-slate-400">
          MàJ {new Date(s.generated_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}
        </div>
      </div>

      {/* --- Base de prospection --- */}
      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">Base de prospection</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Entreprises" value={base.companies.toLocaleString("fr-FR")} sub={`${base.contacts.toLocaleString("fr-FR")} contacts`} />
        <Kpi label="Avec contact" value={`${base.with_contact_pct}%`} sub={`${base.with_contact} entreprises`} tone="blue" />
        <Kpi label="Exploitable" value={`${base.exploitable_pct}%`} sub="≥ 70% cible" tone={base.dod.exploitable_ok ? "green" : "amber"} />
        <Kpi label="Domaine résolu" value={`${base.domain_pct}%`} sub="≥ 60% cible" tone={base.dod.domain_ok ? "green" : "amber"} />
        <Kpi label="Prospects chauds" value={base.hot_prospects.toLocaleString("fr-FR")} sub="v_hot_prospects" tone="blue" />
        <Kpi label="Génériques (VERT)" value={`${base.generic_pct}%`} sub="distribuables RGPD" tone={base.dod.generic_ok ? "green" : "amber"} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Dod ok={base.dod.exploitable_ok} label="DoD exploitable ≥ 70%" />
        <Dod ok={base.dod.generic_ok} label="DoD génériques ≥ 45%" />
        <Dod ok={base.dod.domain_ok} label="DoD domaine ≥ 60%" />
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">POEI (recrutent) : {base.poei}</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">Marchés publics (DECP) : {base.decp}</span>
      </div>

      {/* --- Campagne email --- */}
      <h2 className="mb-2 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">Campagne email « diagnostic financement »</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Cible" value={String(campaign.targets)} sub="email sûr + aides" />
        <Kpi label="Envoyés" value={String(campaign.sent)} sub={`${sentPct}%`} tone="green" />
        <Kpi label="Restants" value={String(campaign.remaining)} tone="blue" />
        <Kpi label="Désabonnés" value={String(campaign.optout)} tone={campaign.optout > 0 ? "amber" : "slate"} />
        <Kpi label="Emails sûrs (base)" value={String(campaign.safe_emails)} sub="domaine = nom" />
        <Kpi label="Avec aides éligibles" value={String(campaign.with_aids)} />
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700">Avancement de l'envoi</span>
          <span className="text-slate-500">{campaign.sent} / {campaign.targets}</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${sentPct}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>⏱️ {campaign.schedule}</span>
          {Object.entries(campaign.by_opco).map(([k, v]) => (
            <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5">{k} : {v}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
