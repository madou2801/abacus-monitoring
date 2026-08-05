"use server";

import { revalidatePath } from "next/cache";
import { pub } from "@/lib/supabase";

// Marque une décision de l'auto-répondeur comme correcte ou à revoir (audit hebdo).
export async function reviewDecision(
  id: string,
  verdict: "correct" | "incorrect",
  correctAction?: string,
  note?: string
): Promise<{ ok: boolean; error?: string }> {
  const patch: Record<string, unknown> = {
    verdict,
    reviewed_at: new Date().toISOString(),
    reviewer_note: note || null,
    correct_action: verdict === "incorrect" ? correctAction || null : null,
  };
  const { error } = await pub().from("email_decisions_log").update(patch).eq("id", id);
  revalidatePath("/audit-repondeur");
  return { ok: !error, error: error?.message };
}

// Annule un verdict (repasse la ligne en « non revu »).
export async function resetDecision(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await pub()
    .from("email_decisions_log")
    .update({ verdict: null, correct_action: null, reviewer_note: null, reviewed_at: null })
    .eq("id", id);
  revalidatePath("/audit-repondeur");
  return { ok: !error, error: error?.message };
}
