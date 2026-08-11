import { NextResponse } from "next/server";
import { supabaseServer } from "@/utils/supabase/server";

export async function POST(req: Request) {
  const sb = supabaseServer();
  await sb.auth.signOut();
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
}
