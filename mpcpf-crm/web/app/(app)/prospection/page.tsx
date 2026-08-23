"use client";

import { useEffect, useMemo, useState } from "react";

// Endpoints publics du service prospection (VPS, nginx financements.abacus-rh.com).
// CORS autorisé pour https://crm.monpermiscpf.com sur /stats et /stats/list.
const BASE =
  process.env.NEXT_PUBLIC_FINANCEMENTS_BASE ?? "https://financements.abacus-rh.com";
const STATS_URL = `${BASE}/stats`;
const LIST_URL = `${BASE}/stats/list`;
const COMPANY_URL = `${BASE}/stats/company`;

type CompanyDetail = {
  found: boolean;
  siren?: string;
  company?: Record<string, string>;
  signals?: string[];
  contacts?: { kind: string; value: string; generique?: boolean; confidence?: number; mx_valid?: boolean; source?: string; url?: string }[];
  aids?: { opco_code?: string; dispositif?: string; taux_ou_montant?: string; plafond?: string; cible_effectif?: string; conditions?: string; annee?: string }[];
};

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

type ListResp = {
  filter: string; label: string; count: number;
  columns: [string, string][];
  rows: Record<string, string>[];
};

const PAGE_SIZE = 50;

function Kpi({
  label, value, sub, tone = "slate", filter, active, onPick,
}: {
  label: string; value: string; sub?: string;
  tone?: "slate" | "green" | "amber" | "blue";
  filter?: string; active?: boolean; onPick?: (f: string) => void;
}) {
  const toneCls = {
    slate: "text-slate-900", green: "text-emerald-600", amber: "text-amber-600", blue: "text-blue-600",
  }[tone];
  const clickable = !!filter;
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => filter && onPick?.(filter)}
      className={`rounded-xl border p-4 text-left transition ${
        active ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-200"
      } ${clickable ? "cursor-pointer bg-white hover:border-blue-300 hover:shadow-sm" : "cursor-default bg-white"}`}
    >
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${toneCls}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
      {clickable && <div className="mt-1 text-[11px] text-blue-500">Voir la liste →</div>}
    </button>
  );
}

function Chip({ label, filter, onPick }: { label: string; filter: string; onPick: (f: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(filter)}
      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 hover:bg-blue-50 hover:text-blue-700"
    >
      {label} <span className="text-blue-400">→</span>
    </button>
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

export default function Page() {
  const [s, setS] = useState<Stats | null>(null);
  const [statsErr, setStatsErr] = useState(false);

  const [filter, setFilter] = useState<string | null>(null);
  const [list, setList] = useState<ListResp | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listErr, setListErr] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(0);
  const [copied, setCopied] = useState(false);

  // Fiche société (drill-down au clic sur une ligne)
  const [detail, setDetail] = useState<CompanyDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState<string | null>(null);

  function openCompany(siren: string) {
    if (!siren) return;
    setDetail(null); setDetailErr(null); setDetailLoading(true);
    fetch(`${COMPANY_URL}?siren=${encodeURIComponent(siren)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: CompanyDetail) => setDetail(d))
      .catch((e) => setDetailErr(String(e?.message || e)))
      .finally(() => setDetailLoading(false));
  }

  useEffect(() => {
    fetch(STATS_URL, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setS)
      .catch(() => setStatsErr(true));
  }, []);

  function pick(f: string) {
    if (filter === f) { setFilter(null); setList(null); return; }
    setFilter(f);
    setList(null);
    setListErr(null);
    setListLoading(true);
    setSearch(""); setSortCol(null); setSelected(new Set()); setPage(0);
    fetch(`${LIST_URL}?f=${encodeURIComponent(f)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: ListResp) => setList(d))
      .catch((e) => setListErr(String(e?.message || e)))
      .finally(() => setListLoading(false));
  }

  const columns = list?.columns ?? [];

  const filteredRows = useMemo(() => {
    if (!list) return [];
    let rows = list.rows;
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((r) => Object.values(r).some((v) => (v || "").toLowerCase().includes(q)));
    if (sortCol) {
      rows = [...rows].sort((a, b) => {
        const av = (a[sortCol] || "").toLowerCase();
        const bv = (b[sortCol] || "").toLowerCase();
        return av < bv ? -sortDir : av > bv ? sortDir : 0;
      });
    }
    return rows;
  }, [list, search, sortCol, sortDir]);

  const pageRows = filteredRows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortCol(col); setSortDir(1); }
  }

  function toggleRow(globalIdx: number) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(globalIdx)) n.delete(globalIdx); else n.add(globalIdx);
      return n;
    });
  }

  function copyEmails() {
    const base = selected.size ? [...selected].map((i) => filteredRows[i]) : filteredRows;
    const emails = [...new Set(base.map((r) => (r.email || "").trim()).filter(Boolean))];
    navigator.clipboard?.writeText(emails.join("; "));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function exportCsv() {
    if (!list) return;
    const rows = selected.size ? [...selected].map((i) => filteredRows[i]) : filteredRows;
    const head = columns.map(([, l]) => l).join(";");
    const esc = (v: string) => `"${(v || "").replace(/"/g, '""')}"`;
    const body = rows.map((r) => columns.map(([k]) => esc(r[k])).join(";")).join("\n");
    const blob = new Blob(["﻿" + head + "\n" + body], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `prospection_${list.filter}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (statsErr) {
    return (
      <div className="p-6 lg:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Prospection Financements</h1>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Impossible de charger les statistiques (endpoint <code>{STATS_URL}</code> injoignable).
        </div>
      </div>
    );
  }

  if (!s) {
    return (
      <div className="p-6 lg:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Prospection Financements</h1>
        <div className="mt-4 text-sm text-slate-500">Chargement…</div>
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
            Acquisition entreprises — base T1 &amp; campagne d&apos;approche. Cliquez une tuile pour ouvrir la liste.
          </p>
        </div>
        <div className="text-xs text-slate-400">
          MàJ {new Date(s.generated_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}
        </div>
      </div>

      {/* --- Base de prospection --- */}
      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">Base de prospection</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Entreprises" value={base.companies.toLocaleString("fr-FR")} sub={`${base.contacts.toLocaleString("fr-FR")} contacts`} filter="companies" active={filter === "companies"} onPick={pick} />
        <Kpi label="Avec contact" value={`${base.with_contact_pct}%`} sub={`${base.with_contact} entreprises`} tone="blue" filter="with_contact" active={filter === "with_contact"} onPick={pick} />
        <Kpi label="Exploitable" value={`${base.exploitable_pct}%`} sub="≥ 70% cible" tone={base.dod.exploitable_ok ? "green" : "amber"} filter="exploitable" active={filter === "exploitable"} onPick={pick} />
        <Kpi label="Domaine résolu" value={`${base.domain_pct}%`} sub="≥ 60% cible" tone={base.dod.domain_ok ? "green" : "amber"} filter="domain" active={filter === "domain"} onPick={pick} />
        <Kpi label="Prospects chauds" value={base.hot_prospects.toLocaleString("fr-FR")} sub="v_hot_prospects" tone="blue" filter="hot_prospects" active={filter === "hot_prospects"} onPick={pick} />
        <Kpi label="Génériques (VERT)" value={`${base.generic_pct}%`} sub="distribuables RGPD" tone={base.dod.generic_ok ? "green" : "amber"} filter="generic" active={filter === "generic"} onPick={pick} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Dod ok={base.dod.exploitable_ok} label="DoD exploitable ≥ 70%" />
        <Dod ok={base.dod.generic_ok} label="DoD génériques ≥ 45%" />
        <Dod ok={base.dod.domain_ok} label="DoD domaine ≥ 60%" />
        <Chip label={`Contacts : ${base.contacts.toLocaleString("fr-FR")}`} filter="contacts" onPick={pick} />
        <Chip label={`POEI (recrutent) : ${base.poei}`} filter="poei" onPick={pick} />
        <Chip label={`Marchés publics (DECP) : ${base.decp}`} filter="decp" onPick={pick} />
      </div>

      {/* --- Campagne email --- */}
      <h2 className="mb-2 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">Campagne email « diagnostic financement »</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Cible" value={String(campaign.targets)} sub="email sûr + aides" filter="cible" active={filter === "cible"} onPick={pick} />
        <Kpi label="Envoyés" value={String(campaign.sent)} sub={`${sentPct}%`} tone="green" filter="envoyes" active={filter === "envoyes"} onPick={pick} />
        <Kpi label="Restants" value={String(campaign.remaining)} tone="blue" filter="restants" active={filter === "restants"} onPick={pick} />
        <Kpi label="Désabonnés" value={String(campaign.optout)} tone={campaign.optout > 0 ? "amber" : "slate"} filter="desabonnes" active={filter === "desabonnes"} onPick={pick} />
        <Kpi label="Emails sûrs (base)" value={String(campaign.safe_emails)} sub="domaine = nom" filter="safe_emails" active={filter === "safe_emails"} onPick={pick} />
        <Kpi label="Avec aides éligibles" value={String(campaign.with_aids)} filter="with_aids" active={filter === "with_aids"} onPick={pick} />
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700">Avancement de l&apos;envoi</span>
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

      {/* --- Liste (drill-down) --- */}
      {filter && (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
            <div>
              <div className="text-sm font-semibold text-slate-800">{list?.label ?? filter}</div>
              <div className="text-xs text-slate-400">
                {listLoading ? "Chargement…" : `${filteredRows.length.toLocaleString("fr-FR")} ligne(s)${selected.size ? ` · ${selected.size} sélectionnée(s)` : ""}`}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                placeholder="Rechercher…"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
              />
              <button onClick={copyEmails} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200">
                {copied ? "Copié ✓" : "Copier emails"}
              </button>
              <button onClick={exportCsv} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
                Export CSV
              </button>
              <button onClick={() => { setFilter(null); setList(null); }} className="rounded-lg px-2 py-1.5 text-sm text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>
          </div>

          {listErr && (
            <div className="p-4 text-sm text-amber-700">Erreur de chargement : {listErr}</div>
          )}

          {!listErr && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-8 px-3 py-2" />
                    {columns.map(([key, label]) => (
                      <th
                        key={key}
                        onClick={() => toggleSort(key)}
                        className="cursor-pointer select-none px-3 py-2 hover:text-slate-800"
                      >
                        {label}{sortCol === key ? (sortDir === 1 ? " ▲" : " ▼") : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r, i) => {
                    const globalIdx = filteredRows.indexOf(r);
                    const hasSiren = !!(r.siren && r.siren.trim());
                    return (
                      <tr
                        key={page * PAGE_SIZE + i}
                        onClick={() => hasSiren && openCompany(r.siren)}
                        className={`border-t border-slate-50 hover:bg-blue-50/50 ${hasSiren ? "cursor-pointer" : ""}`}
                        title={hasSiren ? "Voir la fiche société" : undefined}
                      >
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.has(globalIdx)}
                            onChange={() => toggleRow(globalIdx)}
                          />
                        </td>
                        {columns.map(([key]) => (
                          <td key={key} className="px-3 py-2 text-slate-700">{r[key]}</td>
                        ))}
                      </tr>
                    );
                  })}
                  {!listLoading && pageRows.length === 0 && (
                    <tr><td colSpan={columns.length + 1} className="px-3 py-6 text-center text-slate-400">Aucune ligne.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {filteredRows.length > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-slate-100 p-3 text-sm text-slate-500">
              <span>Page {page + 1} / {pageCount}</span>
              <div className="flex gap-2">
                <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40">Précédent</button>
                <button disabled={page + 1 >= pageCount} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40">Suivant</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- Fiche société (drawer) --- */}
      {(detailLoading || detail || detailErr) && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => { setDetail(null); setDetailErr(null); }}>
          <div className="absolute inset-0 bg-slate-900/30" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-start justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                {detail?.company?.raison_sociale || (detailLoading ? "Chargement…" : "Fiche société")}
              </h3>
              <button onClick={() => { setDetail(null); setDetailErr(null); }} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {detailErr && <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">Erreur : {detailErr}</div>}
            {detailLoading && <div className="text-sm text-slate-400">Chargement de la fiche…</div>}
            {detail && !detail.found && !detailLoading && (
              <div className="text-sm text-slate-500">Aucune fiche trouvée pour ce SIREN.</div>
            )}

            {detail?.found && detail.company && (
              <div className="space-y-5 text-sm">
                {/* Signaux */}
                {detail.signals && detail.signals.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {detail.signals.map((s) => (
                      <span key={s} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{s}</span>
                    ))}
                  </div>
                )}

                {/* Identité */}
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Identité</div>
                  <dl className="grid grid-cols-3 gap-x-3 gap-y-1.5">
                    {[
                      ["SIREN", detail.company.siren],
                      ["SIRET siège", detail.company.siret_siege],
                      ["NAF", detail.company.naf],
                      ["Effectif", detail.company.effectif],
                      ["Adresse", detail.company.adresse],
                      ["Département", detail.company.departement],
                      ["OPCO", detail.company.opco],
                      ["IDCC", detail.company.idcc],
                      ["Domaine web", detail.company.domain],
                      ["Source", detail.company.source],
                      ["Collecté le", detail.company.fetched_at],
                    ].filter(([, v]) => v).map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-slate-400">{k}</dt>
                        <dd className="col-span-2 text-slate-800">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                {/* Contacts */}
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Contacts ({detail.contacts?.length ?? 0})
                  </div>
                  {(!detail.contacts || detail.contacts.length === 0) && <div className="text-slate-400">Aucun contact.</div>}
                  <div className="space-y-2">
                    {detail.contacts?.map((ct, j) => (
                      <div key={j} className="rounded-lg border border-slate-100 p-2.5">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-800">{ct.value}</span>
                          <span className="text-[11px] text-slate-400">{ct.kind}{ct.generique ? " · générique" : ""}</span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-slate-400">
                          {ct.confidence != null && <span>confiance {Math.round((ct.confidence || 0) * 100)}%</span>}
                          {ct.mx_valid != null && <span>{ct.mx_valid ? "MX ✓" : "MX ✗"}</span>}
                          {ct.source && <span>{ct.source}</span>}
                          {ct.url && <a href={ct.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">source</a>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Aides éligibles */}
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Aides / barèmes OPCO ({detail.aids?.length ?? 0})
                  </div>
                  {(!detail.aids || detail.aids.length === 0) && (
                    <div className="text-slate-400">
                      Aucun barème OPCO rattaché{detail.company.opco ? "" : " (OPCO inconnu)"}.
                    </div>
                  )}
                  <div className="space-y-2">
                    {detail.aids?.map((a, j) => (
                      <div key={j} className="rounded-lg border border-slate-100 p-2.5">
                        <div className="font-medium text-slate-800">{a.dispositif}</div>
                        <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-slate-500">
                          {a.taux_ou_montant && <span>💶 {a.taux_ou_montant}</span>}
                          {a.plafond && <span>plafond {a.plafond}</span>}
                          {a.cible_effectif && <span>{a.cible_effectif}</span>}
                          {a.annee && <span>({a.annee})</span>}
                        </div>
                        {a.conditions && <div className="mt-1 text-[11px] text-slate-400">{a.conditions}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
