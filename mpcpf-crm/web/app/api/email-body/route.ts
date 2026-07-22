import { NextResponse } from "next/server";
import { getStaffUser } from "@/lib/auth";
import { fetchEmailBody } from "@/lib/gmail";

export const dynamic = "force-dynamic";

// Renvoie le contenu complet d'un message Gmail (corps HTML/texte). Réservé au staff.
export async function POST(req: Request) {
  const me = await getStaffUser();
  if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let id = "";
  try {
    const body = (await req.json()) as { id?: string };
    id = (body?.id || "").trim();
  } catch {
    /* corps invalide */
  }
  if (!id) return NextResponse.json({ ok: false, error: "id requis" }, { status: 400 });

  const message = await fetchEmailBody(id);
  if (!message) return NextResponse.json({ ok: false, error: "message introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true, message });
}
