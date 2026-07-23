import { NextResponse } from "next/server";
import { getStaffUser } from "@/lib/auth";
import { markEmailRead } from "@/lib/gmail";

export const dynamic = "force-dynamic";

// Marque un email Gmail comme lu (retire le label UNREAD). Réservé au staff.
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

  const ok = await markEmailRead(id);
  return NextResponse.json({ ok });
}
