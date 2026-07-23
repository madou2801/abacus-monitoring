import { NextResponse } from "next/server";
import { getStaffUser } from "@/lib/auth";
import { fetchBeneficiaryEmails } from "@/lib/gmail";

export const dynamic = "force-dynamic";

// Renvoie les emails Gmail (boîte contact@monpermiscpf.com) impliquant l'adresse
// d'un bénéficiaire. Réservé au staff authentifié.
export async function POST(req: Request) {
  const me = await getStaffUser();
  if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let email = "";
  let max = 25;
  try {
    const body = (await req.json()) as { email?: string; max?: number };
    email = (body?.email || "").trim();
    if (body?.max) max = Math.min(Math.max(Number(body.max) || 25, 1), 100);
  } catch {
    /* corps invalide */
  }
  if (!email) return NextResponse.json({ ok: false, error: "email requis" }, { status: 400 });

  const messages = await fetchBeneficiaryEmails(email, max);
  return NextResponse.json({ ok: true, count: messages.length, messages });
}
