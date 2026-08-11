import { NextResponse } from "next/server";
import { getStaffUser } from "@/lib/auth";
import { sendEmail } from "@/lib/gmail";

export const dynamic = "force-dynamic";

// Envoie un email depuis contact@monpermiscpf.com (réponse ou nouveau message). Réservé au staff.
export async function POST(req: Request) {
  const me = await getStaffUser();
  if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: {
    to?: string;
    subject?: string;
    html?: string;
    inReplyTo?: string;
    references?: string;
    threadId?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    /* corps invalide */
  }
  const to = (body.to || "").trim();
  const html = (body.html || "").trim();
  if (!to || !html) return NextResponse.json({ ok: false, error: "to/html requis" }, { status: 400 });

  const r = await sendEmail({
    to,
    subject: body.subject || "MonPermisCPF",
    html,
    inReplyTo: body.inReplyTo,
    references: body.references,
    threadId: body.threadId,
  });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 502 });
  return NextResponse.json({ ok: true, threadId: r.threadId });
}
