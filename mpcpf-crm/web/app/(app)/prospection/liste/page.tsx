import Link from "next/link";

export const dynamic = "force-dynamic";

const BASE = process.env.FINANCEMENTS_STATS_URL ?? "https://financements.abacus-rh.com/stats";
const LIST_URL = `${BASE}/list`;

type ListData = {
  filter: string; label: string; count: number;
  columns: [string, string][]; rows: Record<string, string>[];
};

async function getList(f: string): Promise<ListData | null> {
  try {
    const r = await fetch(`${LIST_URL}?f=${encodeURIComponent(f)}`, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as ListData;
  } catch {
    return null;
  }
}

export default async function Page({ searchParams }: { searchParams: { f?: string } }) {
  const f = searchParams.f ?? "";
  const data = f ? await getList(f) : null;

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-4">
        <Link href="/prospection" className="text-sm text-blue-600 hover:underline">← Retour au dashboard</Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{data?.label ?? "Liste"}</h1>
          {data && <span className="text-sm text-slate-500">{data.count.toLocaleString("fr-FR")} résultat(s)</span>}
        </div>
      </div>

      {!data ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Liste indisponible {f ? `pour le filtre « ${f} »` : "(filtre manquant)"}.
        </div>
      ) : data.rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          Aucun résultat pour le moment.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                {data.columns.map(([key, label]) => (
                  <th key={key} className="whitespace-nowrap px-4 py-2">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.rows.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  {data.columns.map(([key]) => (
                    <td key={key} className="whitespace-nowrap px-4 py-2 text-slate-700">
                      {key === "email" && row[key]
                        ? <a href={`mailto:${row[key]}`} className="text-blue-600 hover:underline">{row[key]}</a>
                        : (row[key] || <span className="text-slate-300">—</span>)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
