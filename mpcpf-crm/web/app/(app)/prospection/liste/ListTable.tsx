"use client";

import { useMemo, useState } from "react";

type Row = Record<string, string>;

function rowKey(r: Row, i: number) {
  return `${r.siren || ""}|${r.email || ""}|${i}`;
}

export function ListTable({ columns, rows }: { columns: [string, string][]; rows: Row[] }) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => columns.some(([k]) => (r[k] || "").toLowerCase().includes(q)));
  }, [rows, columns, query]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const arr = [...filtered];
    arr.sort((a, b) => {
      const x = a[sortKey] ?? "", y = b[sortKey] ?? "";
      const nx = Number(x.replace(/\s/g, "")), ny = Number(y.replace(/\s/g, ""));
      const num = x !== "" && y !== "" && !Number.isNaN(nx) && !Number.isNaN(ny);
      const cmp = num ? nx - ny : String(x).localeCompare(String(y), "fr");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const keys = sorted.map((r, i) => rowKey(r, i));
  const allSelected = keys.length > 0 && keys.every((k) => selected.has(k));

  function toggleSort(k: string) {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(keys));
  }
  function toggleOne(k: string) {
    const next = new Set(selected);
    next.has(k) ? next.delete(k) : next.add(k);
    setSelected(next);
  }

  const selectedRows = sorted.filter((r, i) => selected.has(rowKey(r, i)));

  function copyEmails() {
    const emails = selectedRows.map((r) => r.email).filter(Boolean).join("\n");
    if (emails) navigator.clipboard?.writeText(emails);
  }
  function exportCsv() {
    const src = selectedRows.length ? selectedRows : sorted;
    const head = columns.map(([, l]) => l).join(";");
    const body = src.map((r) => columns.map(([k]) => `"${(r[k] || "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + head + "\n" + body], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "prospection.csv";
    a.click();
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher…"
          className="w-56 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
        />
        <span className="text-sm text-slate-500">{selected.size} sélectionnée(s)</span>
        <button onClick={copyEmails} disabled={!selected.size}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">
          Copier les emails
        </button>
        <button onClick={exportCsv}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
          Exporter CSV{selected.size ? ` (${selected.size})` : ""}
        </button>
        <span className="ml-auto text-xs text-slate-400">{sorted.length} ligne(s)</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="w-10 px-3 py-2">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Tout sélectionner" />
              </th>
              {columns.map(([key, label]) => (
                <th key={key} className="whitespace-nowrap px-4 py-2">
                  <button onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 font-semibold uppercase hover:text-slate-800">
                    {label}
                    <span className="text-slate-400">{sortKey === key ? (sortDir === "asc" ? "▲" : "▼") : "↕"}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((row, i) => {
              const k = rowKey(row, i);
              const sel = selected.has(k);
              return (
                <tr key={k} className={sel ? "bg-blue-50" : "hover:bg-slate-50"}>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={sel} onChange={() => toggleOne(k)} aria-label="Sélectionner la ligne" />
                  </td>
                  {columns.map(([key]) => (
                    <td key={key} className="whitespace-nowrap px-4 py-2 text-slate-700">
                      {key === "email" && row[key]
                        ? <a href={`mailto:${row[key]}`} className="text-blue-600 hover:underline">{row[key]}</a>
                        : (row[key] || <span className="text-slate-300">—</span>)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
