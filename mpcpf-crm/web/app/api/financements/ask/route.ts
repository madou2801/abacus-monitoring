import { NextResponse } from "next/server";
import { getStaffUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Proxy serveur vers l'assistant RAG financements (VPS, financements.abacus-rh.com/api/ask).
// Le token RAG est injecté ICI (côté serveur) et n'est JAMAIS exposé au navigateur.
// Réservé au staff authentifié (usage interne : qualification de financement en prospection).
const RAG_URL =
  process.env.FINANCEMENTS_RAG_URL ?? "https://financements.abacus-rh.com/api/ask";
const RAG_TOKEN = process.env.FINANCEMENTS_RAG_TOKEN ?? "";

export async function POST(req: Request) {
  const me = await getStaffUser();
  if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  if (!RAG_TOKEN) {
    return NextResponse.json(
      { ok: false, error: "assistant_non_configure", detail: "FINANCEMENTS_RAG_TOKEN manquant côté serveur." },
      { status: 503 },
    );
  }

  let question = "";
  let k = 5;
  try {
    const body = (await req.json()) as { question?: string; k?: number };
    question = (body?.question || "").trim();
    if (body?.k) k = Math.min(Math.max(Number(body.k) || 5, 1), 10);
  } catch {
    /* corps invalide */
  }
  if (question.length < 3) {
    return NextResponse.json({ ok: false, error: "question requise (min 3 caractères)" }, { status: 400 });
  }

  try {
    const r = await fetch(RAG_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RAG_TOKEN}`,
      },
      body: JSON.stringify({ question, k }),
      // évite qu'une lenteur du RAG bloque indéfiniment la requête staff
      signal: AbortSignal.timeout(90_000),
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: "rag_error", status: r.status, detail: detail.slice(0, 300) },
        { status: 502 },
      );
    }

    const data = (await r.json()) as { answer?: string; sources?: unknown[] };
    return NextResponse.json({ ok: true, answer: data.answer ?? "", sources: data.sources ?? [] });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "rag_unreachable", detail: String((e as Error)?.message || e).slice(0, 200) },
      { status: 502 },
    );
  }
}
