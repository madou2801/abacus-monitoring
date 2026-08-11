"use server";

import { revalidatePath } from "next/cache";
import { crm } from "@/lib/supabase";
import { getStaffUser } from "@/lib/auth";

// Déplace un dossier vers une étape (drag & drop Kanban).
// Passe par crm.set_stage → journalise la transition + point de contrôle DMAIC.
// force=true : déplacement manuel staff autorisé dans les deux sens (le garde-fou
// anti-régression de set_stage ne s'applique qu'aux automatismes).
export async function moveStage(
  beneficiaryId: string,
  toStage: string,
): Promise<{ ok: boolean; error?: string }> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Non autorisé" };

  const { data, error } = await crm().rpc("set_stage", {
    p_beneficiary: beneficiaryId,
    p_to_stage: toStage,
    p_actor: staff.email,
    p_reason: "Déplacement manuel (Kanban)",
    p_force: true,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/pipeline");
  return { ok: data === true };
}
