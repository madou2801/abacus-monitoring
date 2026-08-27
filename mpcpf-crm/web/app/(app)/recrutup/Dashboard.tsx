"use client";

import { useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// Types partagés (fournis par la page serveur)
// ---------------------------------------------------------------------------
export type Prospect = {
  siren: string | null;
  entreprise: string | null;
  code_postal: string | null;
  commune: string | null;
  departement: string | null;
  nb_offres: number | null;
  score_max: number | null;
  secteurs: string[] | null;
  postes: string[] | null;
  email_principal: string | null;
  tous_emails: string[] | null;
  email_mx_valide: boolean | null;
  has_email: boolean | null;
};
export type Lead = {
  id: number;
  societe: string | null;
  ville: string | null;
  code_postal: string | null;
  nb_profils: number | null;
  dispositif: string | null;
  email: string | null;
  created_at: string | null;
  nom: string | null;
  profils: Array<{ metier?: string; domaine?: string }> | null;
  source: string | null;
  statut: string | null;
};
export type Send = { id: number; email: string | null; statut: string | null; ts: string | null };

type Filter = { type: "all" | "email" | "hot" | "dept" | "secteur"; value?: string };

const DEPT_NAMES: Record<string, string> = {
  "75": "Paris",
  "77": "Seine-et-Marne",
  "78": "Yvelines",
  "91": "Essonne",
  "92": "Hauts-de-Seine",
  "93": "Seine-Saint-Denis",
  "94": "Val-de-Marne",
  "95": "Val-d'Oise",
};
const DEPT_POS: Record<string, { x: number; y: number }> = {
  "95": { x: 2, y: 0 },
  "78": { x: 0, y: 1.5 },
  "93": { x: 3, y: 0.95 },
  "92": { x: 1.25, y: 2 },
  "75": { x: 2.15, y: 2 },
  "77": { x: 4, y: 1.4 },
  "94": { x: 3.05, y: 2.75 },
  "91": { x: 2, y: 3.4 },
};

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ---------------------------------------------------------------------------
export default function Dashboard({
  prospects,
  leads,
  sends,
  sendsTableExists,
  err,
}: {
  prospects: Prospect[];
  leads: Lead[];
  sends: Send[];
  sendsTableExists: boolean;
  err: string | null;
}) {
  const [filter, setFilter] = useState<Filter>({ type: "all" });
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"score" | "offres" | "entreprise">("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Prospect | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  function exportCsv() {
    const cols: [string, (p: Prospect) => string][] = [
      ["entreprise", (p) => p.entreprise ?? ""],
      ["departement", (p) => p.departement ?? ""],
      ["code_postal", (p) => p.code_postal ?? ""],
      ["commune", (p) => p.commune ?? ""],
      ["score", (p) => String(p.score_max ?? "")],
      ["nb_offres", (p) => String(p.nb_offres ?? "")],
      ["secteur", (p) => p.secteurs?.[0] ?? ""],
      ["email", (p) => p.email_principal ?? ""],
      ["tous_emails", (p) => (p.tous_emails ?? []).join(" | ")],
      ["siren", (p) => p.siren ?? ""],
    ];
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv =
      "﻿" +
      [cols.map((c) => c[0]).join(";"), ...filtered.map((p) => cols.map((c) => esc(c[1](p))).join(";"))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recrutup_prospects_${filtered.length}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const total = prospects.length;
  const withEmail = prospects.filter((p) => p.has_email).length;
  const mxValid = prospects.filter((p) => p.email_mx_valide).length;
  const totalOffres = prospects.reduce((s, p) => s + (p.nb_offres ?? 0), 0);
  const chaud = prospects.filter((p) => (p.score_max ?? 0) >= 85).length;
  const tiede = prospects.filter((p) => (p.score_max ?? 0) >= 60 && (p.score_max ?? 0) < 85).length;
  const froid = prospects.filter((p) => (p.score_max ?? 0) < 60).length;

  const byDept = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of prospects) if (p.departement) m.set(p.departement, (m.get(p.departement) ?? 0) + 1);
    return m;
  }, [prospects]);
  const bySecteur = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of prospects) for (const s of p.secteurs ?? []) m.set(s, (m.get(s) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [prospects]);

  const filtered = useMemo(() => {
    let rows = prospects;
    if (filter.type === "email") rows = rows.filter((p) => p.has_email);
    else if (filter.type === "hot") rows = rows.filter((p) => (p.score_max ?? 0) >= 85);
    else if (filter.type === "dept") rows = rows.filter((p) => p.departement === filter.value);
    else if (filter.type === "secteur") rows = rows.filter((p) => (p.secteurs ?? []).includes(filter.value ?? ""));
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (p) =>
          (p.entreprise ?? "").toLowerCase().includes(q) ||
          (p.commune ?? "").toLowerCase().includes(q) ||
          (p.email_principal ?? "").toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === "entreprise") return dir * (a.entreprise ?? "").localeCompare(b.entreprise ?? "");
      if (sortKey === "offres") return dir * ((a.nb_offres ?? 0) - (b.nb_offres ?? 0));
      return dir * ((a.score_max ?? 0) - (b.score_max ?? 0));
    });
  }, [prospects, filter, search, sortKey, sortDir]);

  function toggleSort(k: "score" | "offres" | "entreprise") {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  }
  const caret = (k: string) => (sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  const filterLabel =
    filter.type === "all"
      ? "toutes les entreprises"
      : filter.type === "email"
        ? "avec email"
        : filter.type === "hot"
          ? "comptes chauds (score ≥ 85)"
          : filter.type === "dept"
            ? `département ${filter.value} — ${DEPT_NAMES[filter.value ?? ""] ?? ""}`
            : `secteur : ${filter.value}`;

  const sent = sends.length;
  const bounced = sends.filter((s) => s.statut === "bounce" || s.statut === "erreur").length;
  const maxDept = Math.max(1, ...[...byDept.values()]);
  const maxSect = bySecteur.length ? bySecteur[0][1] : 1;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">🚀 Recrut&apos;up — pilotage</h1>
        <p className="text-sm text-slate-500">
          Programme recrutement-par-la-formation (Île-de-France). Cliquez sur un indicateur, un
          département ou un secteur pour filtrer la liste ; cliquez une ligne pour le détail.
        </p>
      </div>

      {err ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Impossible de charger une partie des données Recrut&apos;up : {err}
        </div>
      ) : null}

      {/* KPI cliquables */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <KpiBtn label="Entreprises détectées" value={total} sub="qui recrutent en IDF" active={filter.type === "all"} onClick={() => setFilter({ type: "all" })} />
        <KpiBtn label="Avec email" value={withEmail} sub={`${mxValid} MX-valides`} active={filter.type === "email"} onClick={() => setFilter({ type: "email" })} />
        <KpiBtn label="Offres suivies" value={totalOffres} sub="trier par volume" active={sortKey === "offres"} onClick={() => { setFilter({ type: "all" }); setSortKey("offres"); setSortDir("desc"); }} />
        <KpiBtn label="Comptes chauds" value={chaud} sub="score ≥ 85" active={filter.type === "hot"} onClick={() => setFilter({ type: "hot" })} />
        <Kpi label="Leads entrants" value={leads.length} sub="formulaire landing" />
        <Kpi label="Emails envoyés" value={sent} sub={bounced ? `${bounced} en échec` : "campagne gatée"} />
      </div>

      {/* Carte IDF + secteurs (cliquables) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 text-sm font-semibold text-slate-800">Répartition géographique (IDF) — cliquez un département</div>
          <svg viewBox="0 0 460 405" className="w-full" role="img" aria-label="Carte IDF">
            {Object.entries(DEPT_POS).map(([code, pos]) => {
              const n = byDept.get(code) ?? 0;
              const t = maxDept ? n / maxDept : 0;
              const isSel = filter.type === "dept" && filter.value === code;
              const x = pos.x * 92 + 4;
              const y = pos.y * 92 + 4;
              return (
                <g key={code} style={{ cursor: "pointer" }} onClick={() => setFilter(isSel ? { type: "all" } : { type: "dept", value: code })}>
                  <title>{`${DEPT_NAMES[code]} (${code}) : ${n}`}</title>
                  <rect x={x} y={y} width={84} height={84} rx={12} fill={`rgba(79,70,229,${0.15 + t * 0.8})`} stroke={isSel ? "#4f46e5" : "#e2e8f0"} strokeWidth={isSel ? 3 : 1} />
                  <text x={x + 42} y={y + 36} textAnchor="middle" fontSize="20" fontWeight="700" fill={t > 0.5 ? "#fff" : "#312e81"}>{code}</text>
                  <text x={x + 42} y={y + 58} textAnchor="middle" fontSize="15" fontWeight="700" fill={t > 0.5 ? "#fff" : "#334155"}>{n}</text>
                </g>
              );
            })}
          </svg>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 text-sm font-semibold text-slate-800">Top secteurs — cliquez pour filtrer</div>
          <div className="flex flex-col gap-2">
            {bySecteur.map(([label, n]) => {
              const isSel = filter.type === "secteur" && filter.value === label;
              return (
                <button key={label} type="button" onClick={() => setFilter(isSel ? { type: "all" } : { type: "secteur", value: label })} className="flex items-center gap-3 text-left text-sm">
                  <div className={`w-44 shrink-0 truncate ${isSel ? "font-semibold text-brand" : "text-slate-600"}`} title={label}>{label}</div>
                  <div className="h-4 flex-1 rounded bg-slate-100">
                    <div className={`h-4 rounded ${isSel ? "bg-brand-dark" : "bg-brand"}`} style={{ width: `${Math.round((n / maxSect) * 100)}%` }} />
                  </div>
                  <div className="w-10 shrink-0 text-right tabular-nums text-slate-700">{n}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Chaleur + campagne */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 text-sm font-semibold text-slate-800">Chaleur des comptes</div>
          <div className="flex flex-col gap-2 text-sm">
            {[
              ["Chauds (≥ 85)", chaud, "bg-red-500"],
              ["Tièdes (60–84)", tiede, "bg-amber-400"],
              ["Froids (< 60)", froid, "bg-slate-300"],
            ].map(([label, n, col]) => (
              <div key={label as string} className="flex items-center gap-3">
                <div className="w-28 shrink-0 text-slate-600">{label as string}</div>
                <div className="h-4 flex-1 rounded bg-slate-100">
                  <div className={`h-4 rounded ${col as string}`} style={{ width: `${Math.round(((n as number) / Math.max(1, total)) * 100)}%` }} />
                </div>
                <div className="w-10 shrink-0 text-right tabular-nums text-slate-700">{n as number}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 text-sm font-semibold text-slate-800">Suivi de campagne</div>
          {!sendsTableExists ? (
            <p className="text-sm text-slate-500">Le suivi d&apos;envois s&apos;activera avec la table <code className="rounded bg-slate-100 px-1">ref.recrutup_sends</code> et le lancement de la campagne (aujourd&apos;hui gatée).</p>
          ) : (
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><div className="text-2xl font-bold text-slate-900">{sent}</div><div className="text-xs text-slate-500">envoyés</div></div>
              <div><div className="text-2xl font-bold text-slate-900">{leads.length}</div><div className="text-xs text-slate-500">leads reçus</div></div>
              <div><div className="text-2xl font-bold text-slate-900">{sent ? `${Math.round((leads.length / sent) * 100)}%` : "—"}</div><div className="text-xs text-slate-500">taux réponse</div></div>
            </div>
          )}
        </div>
      </div>

      {/* Table prospects filtrée */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-800">
            Entreprises — {filtered.length} ({filterLabel})
            {filter.type !== "all" ? (
              <button type="button" onClick={() => setFilter({ type: "all" })} className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-200">✕ réinitialiser</button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher entreprise / ville / email…" className="w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
            <button type="button" onClick={exportCsv} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark">⬇ Exporter CSV</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="cursor-pointer py-2 pr-3 hover:text-slate-800" onClick={() => toggleSort("entreprise")}>Entreprise{caret("entreprise")}</th>
                <th className="py-2 pr-3">Dépt</th>
                <th className="cursor-pointer py-2 pr-3 hover:text-slate-800" onClick={() => toggleSort("score")}>Score{caret("score")}</th>
                <th className="cursor-pointer py-2 pr-3 hover:text-slate-800" onClick={() => toggleSort("offres")}>Offres{caret("offres")}</th>
                <th className="py-2 pr-3">Secteur</th>
                <th className="py-2 pr-3">Email</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map((p, i) => (
                <tr key={`${p.siren ?? i}`} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50" onClick={() => setSelected(p)}>
                  <td className="py-2 pr-3 font-medium text-slate-800">{p.entreprise ?? "—"}</td>
                  <td className="py-2 pr-3 text-slate-600">{p.departement ?? "—"}</td>
                  <td className="py-2 pr-3 tabular-nums text-slate-700">{p.score_max ?? "—"}</td>
                  <td className="py-2 pr-3 tabular-nums text-slate-600">{p.nb_offres ?? "—"}</td>
                  <td className="py-2 pr-3 text-slate-500">{p.secteurs?.[0] ?? "—"}</td>
                  <td className="py-2 pr-3 text-slate-600">{p.email_principal ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 100 ? <div className="mt-2 text-xs text-slate-400">100 premiers affichés sur {filtered.length}.</div> : null}
        </div>
      </div>

      {/* Leads */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-3 text-sm font-semibold text-slate-800">Leads entrants (formulaire landing) — {leads.length}</div>
        {leads.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun lead pour l&apos;instant. Ils apparaîtront ici dès que la landing sera diffusée.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Société</th><th className="py-2 pr-3">Ville</th><th className="py-2 pr-3">Profils</th><th className="py-2 pr-3">Dispositif</th><th className="py-2 pr-3">Email</th>
                </tr>
              </thead>
              <tbody>
                {leads.slice(0, 50).map((l) => (
                  <tr key={l.id} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50" onClick={() => setSelectedLead(l)}>
                    <td className="py-2 pr-3 text-slate-500">{fmtDate(l.created_at)}</td>
                    <td className="py-2 pr-3 font-medium text-slate-800">{l.societe ?? "—"}</td>
                    <td className="py-2 pr-3 text-slate-600">{l.ville ?? "—"}</td>
                    <td className="py-2 pr-3 tabular-nums text-slate-600">{l.nb_profils ?? "—"}</td>
                    <td className="py-2 pr-3 text-slate-500">{l.dispositif ?? "—"}</td>
                    <td className="py-2 pr-3 text-slate-600">{l.email ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Drawer détail entreprise */}
      {selected ? (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-slate-900/30" />
          <div className="relative z-10 h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <h2 className="text-lg font-bold text-slate-900">{selected.entreprise ?? "—"}</h2>
              <button type="button" onClick={() => setSelected(null)} className="rounded bg-slate-100 px-2 py-1 text-sm text-slate-600 hover:bg-slate-200">✕</button>
            </div>
            <dl className="flex flex-col gap-3 text-sm">
              <Row k="SIREN" v={selected.siren ?? "—"} />
              <Row k="Localisation" v={`${selected.commune ?? "—"} (${selected.code_postal ?? "—"}) · dépt ${selected.departement ?? "—"}`} />
              <Row k="Score de chaleur" v={String(selected.score_max ?? "—")} />
              <Row k="Nombre d'offres" v={String(selected.nb_offres ?? "—")} />
              <div>
                <dt className="text-xs uppercase text-slate-400">Postes recherchés</dt>
                <dd className="mt-1 flex flex-wrap gap-1">
                  {(selected.postes ?? []).length ? (selected.postes ?? []).map((p) => <span key={p} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{p}</span>) : <span className="text-slate-400">—</span>}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-400">Secteurs</dt>
                <dd className="mt-1 flex flex-wrap gap-1">
                  {(selected.secteurs ?? []).length ? (selected.secteurs ?? []).map((s) => <span key={s} className="rounded bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">{s}</span>) : <span className="text-slate-400">—</span>}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-400">Emails {selected.email_mx_valide ? "(MX-valide)" : ""}</dt>
                <dd className="mt-1 flex flex-col gap-1">
                  {(selected.tous_emails ?? (selected.email_principal ? [selected.email_principal] : [])).map((e) => (
                    <a key={e} href={`mailto:${e}`} className="text-brand hover:underline">{e}</a>
                  ))}
                  {!(selected.tous_emails ?? []).length && !selected.email_principal ? <span className="text-slate-400">—</span> : null}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      ) : null}

      {/* Drawer détail lead */}
      {selectedLead ? (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedLead(null)}>
          <div className="absolute inset-0 bg-slate-900/30" />
          <div className="relative z-10 h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <h2 className="text-lg font-bold text-slate-900">{selectedLead.societe ?? "Lead"}</h2>
              <button type="button" onClick={() => setSelectedLead(null)} className="rounded bg-slate-100 px-2 py-1 text-sm text-slate-600 hover:bg-slate-200">✕</button>
            </div>
            <dl className="flex flex-col gap-3 text-sm">
              <Row k="Reçu le" v={fmtDate(selectedLead.created_at)} />
              <Row k="Contact" v={selectedLead.nom ?? "—"} />
              <Row k="Email" v={selectedLead.email ?? "—"} />
              <Row k="Localisation" v={`${selectedLead.ville ?? "—"} (${selectedLead.code_postal ?? "—"})`} />
              <Row k="Dispositif" v={selectedLead.dispositif ?? "—"} />
              <Row k="Statut" v={selectedLead.statut ?? "—"} />
              <Row k="Source" v={selectedLead.source ?? "—"} />
              <div>
                <dt className="text-xs uppercase text-slate-400">Profils recherchés ({selectedLead.nb_profils ?? 0})</dt>
                <dd className="mt-1 flex flex-col gap-1">
                  {(selectedLead.profils ?? []).length ? (
                    (selectedLead.profils ?? []).map((p, i) => (
                      <span key={i} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
                        {p.metier ?? "—"}{p.domaine ? ` · ${p.domaine}` : ""}
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </dd>
              </div>
              {selectedLead.email ? (
                <a href={`mailto:${selectedLead.email}`} className="mt-2 inline-block rounded-lg bg-brand px-3 py-2 text-center text-sm font-medium text-white hover:bg-brand-dark">Répondre par email</a>
              ) : null}
            </dl>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
function Kpi({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="text-3xl font-bold text-slate-900">{value}</div>
      <div className="mt-1 text-sm font-medium text-slate-700">{label}</div>
      {sub ? <div className="mt-0.5 text-xs text-slate-400">{sub}</div> : null}
    </div>
  );
}
function KpiBtn({ label, value, sub, active, onClick }: { label: string; value: number; sub?: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-2xl border p-5 text-left transition ${active ? "border-brand ring-2 ring-brand/30" : "border-slate-200 hover:border-brand"} bg-white`}>
      <div className="text-3xl font-bold text-slate-900">{value}</div>
      <div className="mt-1 text-sm font-medium text-slate-700">{label}</div>
      {sub ? <div className="mt-0.5 text-xs text-slate-400">{sub}</div> : null}
    </button>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs uppercase text-slate-400">{k}</dt>
      <dd className="text-slate-800">{v}</dd>
    </div>
  );
}
