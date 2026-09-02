"use client";

import { useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// Type partagé (fourni par la page serveur) — miroir de ref.abacus_academy_sends
// ---------------------------------------------------------------------------
export type Send = {
  id: string;
  structure: string | null;
  email: string | null;
  type: string | null; // universite | partenaire
  pays: string | null;
  dirigeant: string | null;
  statut: string | null; // a_envoyer | envoye | delivre | bounce | erreur | ouvert | repondu
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  replied_at: string | null;
  bounce_raison: string | null;
  created_at: string | null;
};

type Filter =
  | { type: "all" }
  | { type: "statut"; value: string }
  | { type: "pays"; value: string }
  | { type: "structtype"; value: string };

const STATUT_LABEL: Record<string, string> = {
  a_envoyer: "À envoyer",
  envoye: "Envoyé",
  delivre: "Délivré",
  bounce: "Bounce",
  erreur: "Erreur",
  ouvert: "Ouvert",
  repondu: "Répondu",
};
const STATUT_COLOR: Record<string, string> = {
  a_envoyer: "bg-slate-100 text-slate-600",
  envoye: "bg-blue-50 text-blue-700",
  delivre: "bg-indigo-50 text-indigo-700",
  bounce: "bg-red-50 text-red-700",
  erreur: "bg-red-50 text-red-700",
  ouvert: "bg-amber-50 text-amber-700",
  repondu: "bg-emerald-50 text-emerald-700",
};
const TYPE_LABEL: Record<string, string> = {
  universite: "Université / École",
  partenaire: "Partenaire",
};

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function statutBadge(s: string | null) {
  const key = s ?? "a_envoyer";
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUT_COLOR[key] ?? "bg-slate-100 text-slate-600"}`}>
      {STATUT_LABEL[key] ?? key}
    </span>
  );
}

// ---------------------------------------------------------------------------
export default function Dashboard({
  sends,
  tableExists,
  err,
}: {
  sends: Send[];
  tableExists: boolean;
  err: string | null;
}) {
  const [filter, setFilter] = useState<Filter>({ type: "all" });
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"structure" | "pays" | "statut" | "created">("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Send | null>(null);

  // KPIs par statut
  const total = sends.length;
  const cnt = (st: string) => sends.filter((s) => (s.statut ?? "a_envoyer") === st).length;
  const nAEnvoyer = cnt("a_envoyer");
  const nEnvoye = cnt("envoye");
  const nDelivre = cnt("delivre");
  const nBounce = sends.filter((s) => s.statut === "bounce" || s.statut === "erreur").length;
  const nOuvert = cnt("ouvert");
  const nRepondu = cnt("repondu");

  const byPays = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sends) if (s.pays) m.set(s.pays, (m.get(s.pays) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [sends]);
  const byType = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sends) if (s.type) m.set(s.type, (m.get(s.type) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [sends]);

  const filtered = useMemo(() => {
    let rows = sends;
    if (filter.type === "statut") {
      rows =
        filter.value === "bounce"
          ? rows.filter((s) => s.statut === "bounce" || s.statut === "erreur")
          : rows.filter((s) => (s.statut ?? "a_envoyer") === filter.value);
    } else if (filter.type === "pays") rows = rows.filter((s) => s.pays === filter.value);
    else if (filter.type === "structtype") rows = rows.filter((s) => s.type === filter.value);
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (s) =>
          (s.structure ?? "").toLowerCase().includes(q) ||
          (s.email ?? "").toLowerCase().includes(q) ||
          (s.dirigeant ?? "").toLowerCase().includes(q) ||
          (s.pays ?? "").toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === "structure") return dir * (a.structure ?? "").localeCompare(b.structure ?? "");
      if (sortKey === "pays") return dir * (a.pays ?? "").localeCompare(b.pays ?? "");
      if (sortKey === "statut") return dir * (a.statut ?? "").localeCompare(b.statut ?? "");
      return dir * ((a.created_at ?? "") < (b.created_at ?? "") ? -1 : 1);
    });
  }, [sends, filter, search, sortKey, sortDir]);

  function toggleSort(k: "structure" | "pays" | "statut" | "created") {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "structure" || k === "pays" ? "asc" : "desc");
    }
  }
  const caret = (k: string) => (sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  function exportCsv() {
    const cols: [string, (s: Send) => string][] = [
      ["structure", (s) => s.structure ?? ""],
      ["email", (s) => s.email ?? ""],
      ["type", (s) => s.type ?? ""],
      ["pays", (s) => s.pays ?? ""],
      ["dirigeant", (s) => s.dirigeant ?? ""],
      ["statut", (s) => s.statut ?? ""],
      ["sent_at", (s) => s.sent_at ?? ""],
      ["delivered_at", (s) => s.delivered_at ?? ""],
      ["opened_at", (s) => s.opened_at ?? ""],
      ["replied_at", (s) => s.replied_at ?? ""],
      ["bounce_raison", (s) => s.bounce_raison ?? ""],
    ];
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv =
      "﻿" +
      [cols.map((c) => c[0]).join(";"), ...filtered.map((s) => cols.map((c) => esc(c[1](s))).join(";"))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `abacus_academy_${filtered.length}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filterLabel =
    filter.type === "all"
      ? "tous les destinataires"
      : filter.type === "statut"
        ? `statut : ${STATUT_LABEL[filter.value] ?? filter.value}`
        : filter.type === "pays"
          ? `pays : ${filter.value}`
          : `type : ${TYPE_LABEL[filter.value] ?? filter.value}`;

  const maxPays = byPays.length ? byPays[0][1] : 1;
  const maxType = byType.length ? byType[0][1] : 1;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">🎓 ABACUS Academy — suivi de campagne</h1>
        <p className="text-sm text-slate-500">
          Évaluation de compétences offerte (phase pilote) — universités, écoles et partenaires
          d&apos;Afrique francophone. Cliquez sur un indicateur, un pays ou un type pour filtrer ;
          cliquez une ligne pour le détail.
        </p>
      </div>

      {!tableExists ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Le suivi s&apos;activera avec la table{" "}
          <code className="rounded bg-amber-100 px-1">ref.abacus_academy_sends</code> (exécuter{" "}
          <code className="rounded bg-amber-100 px-1">web/sql/abacus_academy_sends.sql</code> puis le seed
          dans le SQL editor oezaby). {err ? <span className="text-amber-700">Détail : {err}</span> : null}
        </div>
      ) : null}

      {/* KPI cliquables par statut */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-7">
        <KpiBtn label="Total" value={total} sub="destinataires" active={filter.type === "all"} onClick={() => setFilter({ type: "all" })} />
        <KpiBtn label="À envoyer" value={nAEnvoyer} sub="en attente" active={filter.type === "statut" && filter.value === "a_envoyer"} onClick={() => setFilter({ type: "statut", value: "a_envoyer" })} />
        <KpiBtn label="Envoyé" value={nEnvoye} sub="partis" active={filter.type === "statut" && filter.value === "envoye"} onClick={() => setFilter({ type: "statut", value: "envoye" })} />
        <KpiBtn label="Délivré" value={nDelivre} sub="reçus" active={filter.type === "statut" && filter.value === "delivre"} onClick={() => setFilter({ type: "statut", value: "delivre" })} />
        <KpiBtn label="Bounce" value={nBounce} sub="échecs / erreurs" active={filter.type === "statut" && filter.value === "bounce"} onClick={() => setFilter({ type: "statut", value: "bounce" })} />
        <KpiBtn label="Ouvert" value={nOuvert} sub="ont ouvert" active={filter.type === "statut" && filter.value === "ouvert"} onClick={() => setFilter({ type: "statut", value: "ouvert" })} />
        <KpiBtn label="Répondu" value={nRepondu} sub="ont répondu" active={filter.type === "statut" && filter.value === "repondu"} onClick={() => setFilter({ type: "statut", value: "repondu" })} />
      </div>

      {/* Répartition pays + type (cliquables) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 text-sm font-semibold text-slate-800">Répartition par pays — cliquez pour filtrer</div>
          <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
            {byPays.map(([label, n]) => {
              const isSel = filter.type === "pays" && filter.value === label;
              return (
                <button key={label} type="button" onClick={() => setFilter(isSel ? { type: "all" } : { type: "pays", value: label })} className="flex items-center gap-3 text-left text-sm">
                  <div className={`w-44 shrink-0 truncate ${isSel ? "font-semibold text-brand" : "text-slate-600"}`} title={label}>{label}</div>
                  <div className="h-4 flex-1 rounded bg-slate-100">
                    <div className={`h-4 rounded ${isSel ? "bg-brand-dark" : "bg-brand"}`} style={{ width: `${Math.round((n / maxPays) * 100)}%` }} />
                  </div>
                  <div className="w-10 shrink-0 text-right tabular-nums text-slate-700">{n}</div>
                </button>
              );
            })}
            {byPays.length === 0 ? <div className="text-sm text-slate-400">—</div> : null}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 text-sm font-semibold text-slate-800">Répartition par type — cliquez pour filtrer</div>
          <div className="flex flex-col gap-2">
            {byType.map(([label, n]) => {
              const isSel = filter.type === "structtype" && filter.value === label;
              return (
                <button key={label} type="button" onClick={() => setFilter(isSel ? { type: "all" } : { type: "structtype", value: label })} className="flex items-center gap-3 text-left text-sm">
                  <div className={`w-44 shrink-0 truncate ${isSel ? "font-semibold text-brand" : "text-slate-600"}`} title={label}>{TYPE_LABEL[label] ?? label}</div>
                  <div className="h-4 flex-1 rounded bg-slate-100">
                    <div className={`h-4 rounded ${isSel ? "bg-brand-dark" : "bg-brand"}`} style={{ width: `${Math.round((n / maxType) * 100)}%` }} />
                  </div>
                  <div className="w-10 shrink-0 text-right tabular-nums text-slate-700">{n}</div>
                </button>
              );
            })}
            {byType.length === 0 ? <div className="text-sm text-slate-400">—</div> : null}
          </div>
        </div>
      </div>

      {/* Entonnoir de campagne */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-3 text-sm font-semibold text-slate-800">Entonnoir de campagne</div>
        <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["À envoyer", nAEnvoyer],
            ["Envoyé", nEnvoye],
            ["Délivré", nDelivre],
            ["Ouvert", nOuvert],
            ["Répondu", nRepondu],
            ["Bounce", nBounce],
          ].map(([label, n]) => (
            <div key={label as string}>
              <div className="text-2xl font-bold text-slate-900">{n as number}</div>
              <div className="text-xs text-slate-500">{label as string}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Table filtrée */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-800">
            Destinataires — {filtered.length} ({filterLabel})
            {filter.type !== "all" ? (
              <button type="button" onClick={() => setFilter({ type: "all" })} className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-200">✕ réinitialiser</button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher structure / email / dirigeant / pays…" className="w-72 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
            <button type="button" onClick={exportCsv} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark">⬇ Exporter CSV</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="cursor-pointer py-2 pr-3 hover:text-slate-800" onClick={() => toggleSort("structure")}>Structure{caret("structure")}</th>
                <th className="cursor-pointer py-2 pr-3 hover:text-slate-800" onClick={() => toggleSort("pays")}>Pays{caret("pays")}</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Dirigeant</th>
                <th className="py-2 pr-3">Email</th>
                <th className="cursor-pointer py-2 pr-3 hover:text-slate-800" onClick={() => toggleSort("statut")}>Statut{caret("statut")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map((s) => (
                <tr key={s.id} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50" onClick={() => setSelected(s)}>
                  <td className="py-2 pr-3 font-medium text-slate-800">{s.structure ?? "—"}</td>
                  <td className="py-2 pr-3 text-slate-600">{s.pays ?? "—"}</td>
                  <td className="py-2 pr-3 text-slate-500">{TYPE_LABEL[s.type ?? ""] ?? s.type ?? "—"}</td>
                  <td className="py-2 pr-3 text-slate-600">{s.dirigeant ?? "—"}</td>
                  <td className="py-2 pr-3 text-slate-600">{s.email ?? "—"}</td>
                  <td className="py-2 pr-3">{statutBadge(s.statut)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 200 ? <div className="mt-2 text-xs text-slate-400">200 premiers affichés sur {filtered.length}.</div> : null}
          {filtered.length === 0 ? <div className="mt-2 text-sm text-slate-400">Aucun destinataire pour ce filtre.</div> : null}
        </div>
      </div>

      {/* Drawer détail structure */}
      {selected ? (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-slate-900/30" />
          <div className="relative z-10 h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <h2 className="text-lg font-bold text-slate-900">{selected.structure ?? "—"}</h2>
              <button type="button" onClick={() => setSelected(null)} className="rounded bg-slate-100 px-2 py-1 text-sm text-slate-600 hover:bg-slate-200">✕</button>
            </div>
            <div className="mb-4">{statutBadge(selected.statut)}</div>
            <dl className="flex flex-col gap-3 text-sm">
              <Row k="Pays" v={selected.pays ?? "—"} />
              <Row k="Type" v={TYPE_LABEL[selected.type ?? ""] ?? selected.type ?? "—"} />
              <Row k="Dirigeant" v={selected.dirigeant ?? "—"} />
              <div>
                <dt className="text-xs uppercase text-slate-400">Email</dt>
                <dd className="mt-1">
                  {selected.email ? <a href={`mailto:${selected.email}`} className="text-brand hover:underline">{selected.email}</a> : <span className="text-slate-400">—</span>}
                </dd>
              </div>
              <Row k="Envoyé le" v={fmtDate(selected.sent_at)} />
              <Row k="Délivré le" v={fmtDate(selected.delivered_at)} />
              <Row k="Ouvert le" v={fmtDate(selected.opened_at)} />
              <Row k="Répondu le" v={fmtDate(selected.replied_at)} />
              {selected.bounce_raison ? <Row k="Raison du bounce" v={selected.bounce_raison} /> : null}
              <Row k="Ajouté le" v={fmtDate(selected.created_at)} />
              {selected.email ? (
                <a href={`mailto:${selected.email}`} className="mt-2 inline-block rounded-lg bg-brand px-3 py-2 text-center text-sm font-medium text-white hover:bg-brand-dark">Écrire un email</a>
              ) : null}
            </dl>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
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
