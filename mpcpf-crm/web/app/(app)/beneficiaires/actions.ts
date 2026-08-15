"use server";

import { revalidatePath } from "next/cache";
import { crm } from "@/lib/supabase";
import { getStaffUser } from "@/lib/auth";

type Result = { ok: boolean; error?: string; id?: string; message?: string };

// Champs éditables depuis la fiche (doit rester aligné avec l'allowlist SQL
// de crm.update_beneficiary_fields — migration 0022).
const EDITABLE_FIELDS = [
  "first_name", "last_name", "email", "phone", "financeur",
  "intitule_formation", "code_postal", "ville_formation", "motif", "owner_email",
  "numero_france_travail",
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

// Décision sur un devis (validation / refus en un clic depuis la fiche).
// Même logique métier que l'action decide_quote de l'intake-api : statut +
// horodatage de décision, puis avancée du parcours (advance_journey → un devis
// accepté fait passer le dossier à « Inscrit » si le reste est satisfait).
export async function decideQuote(
  beneficiaryId: string,
  quoteId: string,
  status: "accepted" | "refused",
): Promise<Result> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Non autorisé" };

  const db = crm();
  const { data, error } = await db
    .from("quotes")
    .update({ status, decided_at: new Date().toISOString() })
    .eq("id", quoteId)
    .eq("beneficiary_id", beneficiaryId)
    .in("status", ["draft", "sent"])
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "Devis introuvable ou déjà décidé." };
  }

  const { error: advErr } = await db.rpc("advance_journey", {
    p_benef: beneficiaryId,
    p_actor: staff.email,
  });
  if (advErr) return { ok: false, error: advErr.message };

  revalidateBenef(beneficiaryId);
  return { ok: true };
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

// Crée & transmet le devis Kairos (AIF France Travail) pour un bénéficiaire.
// Insère un dossier PROSPECT via l'endpoint campaign-tracker (même flux que la
// qualification / le mini-form : une seule source de vérité), que le robot Kairos
// transmet ensuite. Gate : identifiant FT valide + formation renseignée. Le permis
// et les formations non résolvables sont refusés côté endpoint (422).
export async function createKairosDevis(beneficiaryId: string): Promise<Result> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Non autorisé" };

  const { data: b } = await crm()
    .from("vw_beneficiary_enriched")
    .select("numero_france_travail, intitule_formation, code_postal, first_name, last_name, email, phone")
    .eq("id", beneficiaryId)
    .maybeSingle();
  if (!b) return { ok: false, error: "Bénéficiaire introuvable" };

  const ft = String(b.numero_france_travail ?? "").trim();
  if (!/^(\d{11}|\d{7}[A-Za-z])$/.test(ft)) {
    return { ok: false, error: "Identifiant France Travail manquant ou invalide (11 chiffres, ou 7 chiffres + 1 lettre)." };
  }
  const formation = String(b.intitule_formation ?? "").trim();
  if (!formation) return { ok: false, error: "Renseignez la formation avant de créer le devis." };

  const secret = process.env.INTERNAL_MAIL_SECRET;
  if (!secret) return { ok: false, error: "INTERNAL_MAIL_SECRET manquant (config serveur)." };
  const url = process.env.INTERNAL_KAIROS_DEVIS_URL || "https://api.monpermiscpf.com/t/internal-create-kairos-devis";

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-secret": secret },
      body: JSON.stringify({
        ft_individu_id: ft,
        formation_intitule: formation,
        code_postal: b.code_postal ?? "",
        nom: b.last_name ?? "",
        prenom: b.first_name ?? "",
        email: b.email ?? "",
        telephone: b.phone ?? "",
        beneficiary_id: beneficiaryId,
        created_by: "crm-fiche",
      }),
    });
    const j = (await r.json().catch(() => ({}))) as Record<string, any>;
    if (r.status === 422 && j?.error === "permis_non_eligible_kairos") {
      return { ok: false, error: "Le permis n'est pas éligible au dispositif Kairos (AIF France Travail)." };
    }
    if (r.status === 422 && j?.error === "formation_non_resolvable") {
      return { ok: false, error: "Formation non reconnue au catalogue — vérifiez l'intitulé exact." };
    }
    if (!r.ok || j?.ok === false) {
      return { ok: false, error: j?.error || `Erreur endpoint (HTTP ${r.status})` };
    }
    revalidateBenef(beneficiaryId);
    if (j?.dedup) {
      return { ok: true, id: j?.dossier_id, message: "Un dossier Kairos existe déjà pour cet identifiant FT." };
    }
    return { ok: true, id: j?.dossier_id, message: "Dossier créé — le robot transmet le devis à France Travail sous peu." };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Échec de l'appel à l'endpoint Kairos." };
  }
}
