"use server";

import { revalidatePath } from "next/cache";
import { crm } from "@/lib/supabase";
import { getStaffUser } from "@/lib/auth";

// Fait avancer une facture dans son cycle de vie via crm.set_invoice_status
// (ordre nominal contrôlé côté SQL ; 'annulee' possible sauf si encaissée).
export async function setInvoiceStatus(
  invoiceId: string,
  status: string,
): Promise<{ ok: boolean; error?: string }> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Non autorisé" };

  const { error } = await crm().rpc("set_invoice_status", {
    p_invoice: invoiceId,
    p_status: status,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/facturation");
  revalidatePath("/");
  return { ok: true };
}
