"use server";

import { revalidatePath } from "next/cache";
import { crm } from "@/lib/supabase";
import { getStaffUser } from "@/lib/auth";

type Result = { ok: boolean; error?: string; id?: string };

// Champs éditables depuis la fiche (doit rester aligné avec l'allowlist SQL
// de crm.update_beneficiary_fields — migration 0022).
const EDITABLE_FIELDS = [
  "first_name", "last_name", "email", "phone", "financeur",
  "intitule_formation", "code_postal", "ville_formation", "motif", "owner_email",
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

function revalidateBenef(id: string) {
  revalidatePath("/beneficiaires");
  revalidatePath(`/beneficiaires/${id}`);
  revalidatePath("/pipeline");
  revalidatePath("/");
}

// Édition contrôlée des propriétés : passe par crm.update_beneficiary_fields
// (diff + historique field_changes + verrouillage anti-sync).
export async function updateBeneficiary(
  beneficiaryId: string,
  changes: Partial<Record<EditableField, string>>,
): Promise<Result> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Non autorisé" };

  const filtered: Record<string, string> = {};
  for (const [k, v] of Object.entries(changes)) {
    if ((EDITABLE_FIELDS as readonly string[]).includes(k) && typeof v === "string") {
      filtered[k] = v.trim();
    }
  }
  if (Object.keys(filtered).length === 0) return { ok: false, error: "Aucun champ à modifier" };

  const { error } = await crm().rpc("update_beneficiary_fields", {
    p_benef: beneficiaryId,
    p_changes: filtered,
    p_actor: staff.email,
  });
  if (error) return { ok: false, error: error.message };

  revalidateBenef(beneficiaryId);
  return { ok: true };
}

export async function addNote(beneficiaryId: string, content: string): Promise<Result> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Non autorisé" };
  const text = content.trim();
  if (!text) return { ok: false, error: "Note vide" };

  const { error } = await crm().from("notes").insert({
    beneficiary_id: beneficiaryId,
    author_email: staff.email,
    content: text,
  });
  if (error) return { ok: false, error: error.message };

  revalidateBenef(beneficiaryId);
  return { ok: true };
}

export async function addTask(
  beneficiaryId: string,
  input: { title: string; due_at?: string; assignee_email?: string },
): Promise<Result> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Non autorisé" };
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Titre requis" };

  const { error } = await crm().from("tasks").insert({
    beneficiary_id: beneficiaryId,
    title,
    due_at: input.due_at || null,
    assignee_email: input.assignee_email?.trim() || staff.email,
    created_by: staff.email,
  });
  if (error) return { ok: false, error: error.message };

  revalidateBenef(beneficiaryId);
  return { ok: true };
}

export async function setTaskStatus(
  taskId: string,
  beneficiaryId: string,
  status: "open" | "done" | "canceled",
): Promise<Result> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Non autorisé" };

  const { error } = await crm().from("tasks").update({
    status,
    completed_at: status === "done" ? new Date().toISOString() : null,
  }).eq("id", taskId);
  if (error) return { ok: false, error: error.message };

  revalidateBenef(beneficiaryId);
  return { ok: true };
}

// Devis manuel : passe par la primitive crm.create_quote (transmission +
// relance planifiée si demandé) — même chemin que les devis automatisés.
export async function createQuote(
  beneficiaryId: string,
  input: { financeur: string; amount_euros?: string; formation_label?: string; transmit: boolean },
): Promise<Result> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Non autorisé" };

  const euros = (input.amount_euros ?? "").replace(",", ".").trim();
  const cents = euros ? Math.round(parseFloat(euros) * 100) : null;
  if (euros && (!Number.isFinite(cents) || (cents as number) < 0)) {
    return { ok: false, error: "Montant invalide" };
  }

  const { data, error } = await crm().rpc("create_quote", {
    p_benef: beneficiaryId,
    p_financeur: input.financeur,
    p_amount_cents: cents,
    p_formation_label: input.formation_label?.trim() || null,
    p_transmit: input.transmit,
  });
  if (error) return { ok: false, error: error.message };

  revalidateBenef(beneficiaryId);
  return { ok: true, id: data as string };
}

// Création manuelle d'un dossier (prospect appelé en direct, salon, etc.).
export async function createBeneficiary(input: {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  financeur?: string;
  intitule_formation?: string;
  code_postal?: string;
  ville_formation?: string;
  motif?: string;
}): Promise<Result> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Non autorisé" };

  const clean = (v?: string) => (v?.trim() ? v.trim() : null);
  if (!clean(input.first_name) && !clean(input.last_name) && !clean(input.email) && !clean(input.phone)) {
    return { ok: false, error: "Renseignez au moins un nom, un email ou un téléphone." };
  }

  const { data, error } = await crm().from("beneficiaries").insert({
    first_name: clean(input.first_name),
    last_name: clean(input.last_name),
    email: clean(input.email)?.toLowerCase() ?? null,
    phone: clean(input.phone),
    financeur: clean(input.financeur),
    intitule_formation: clean(input.intitule_formation),
    code_postal: clean(input.code_postal),
    ville_formation: clean(input.ville_formation),
    motif: clean(input.motif),
    source: "manuel",
    owner_email: staff.email,
    date_creation: new Date().toISOString(),
  }).select("id").single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/beneficiaires");
  revalidatePath("/pipeline");
  revalidatePath("/");
  return { ok: true, id: data.id as string };
}
