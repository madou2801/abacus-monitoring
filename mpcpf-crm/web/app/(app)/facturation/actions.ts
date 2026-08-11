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

// Création manuelle d'une facture via crm.create_invoice (statut « à émettre »,
// canal dérivé du financeur, idempotente par dossier+financeur non annulé).
export async function createInvoice(input: {
  beneficiary_id: string;
  financeur: string;
  amount_euros?: string;
  formation_label?: string;
  external_ref?: string;
  due_days?: string;
}): Promise<{ ok: boolean; error?: string; id?: string }> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Non autorisé" };
  if (!input.beneficiary_id) return { ok: false, error: "Sélectionnez un bénéficiaire." };

  const euros = (input.amount_euros ?? "").replace(",", ".").trim();
  const cents = euros ? Math.round(parseFloat(euros) * 100) : null;
  if (euros && (!Number.isFinite(cents) || (cents as number) < 0)) {
    return { ok: false, error: "Montant invalide" };
  }
  const dueDays = parseInt(input.due_days ?? "30", 10);

  const { data, error } = await crm().rpc("create_invoice", {
    p_benef: input.beneficiary_id,
    p_financeur: input.financeur,
    p_amount_cents: cents,
    p_formation_label: input.formation_label?.trim() || null,
    p_external_ref: input.external_ref?.trim() || null,
    p_due_days: Number.isFinite(dueDays) && dueDays > 0 ? dueDays : 30,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/facturation");
  revalidatePath("/");
  return { ok: true, id: data as string };
}
