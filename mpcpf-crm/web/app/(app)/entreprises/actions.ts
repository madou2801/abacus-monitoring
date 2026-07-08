"use server";

import { revalidatePath } from "next/cache";
import { crm } from "@/lib/supabase";
import { getStaffUser } from "@/lib/auth";

// Création manuelle d'une entreprise (financement OPCO / employeur).
export async function createCompany(input: {
  raison_sociale: string;
  siret?: string;
  email?: string;
  telephone?: string;
  contact_prenom?: string;
  contact_nom?: string;
  contact_fonction?: string;
  opco?: string;
  adresse?: string;
  code_postal?: string;
  ville?: string;
}): Promise<{ ok: boolean; error?: string; id?: string }> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Non autorisé" };

  const clean = (v?: string) => (v?.trim() ? v.trim() : null);
  const raison_sociale = clean(input.raison_sociale);
  if (!raison_sociale) return { ok: false, error: "La raison sociale est requise." };

  const siret = clean(input.siret)?.replace(/\s+/g, "") ?? null;
  if (siret && !/^\d{14}$/.test(siret)) {
    return { ok: false, error: "SIRET invalide (14 chiffres attendus)." };
  }

  const { data, error } = await crm().from("companies").insert({
    raison_sociale,
    siret,
    siren: siret ? siret.slice(0, 9) : null,
    email: clean(input.email)?.toLowerCase() ?? null,
    telephone: clean(input.telephone),
    contact_prenom: clean(input.contact_prenom),
    contact_nom: clean(input.contact_nom),
    contact_fonction: clean(input.contact_fonction),
    opco: clean(input.opco),
    adresse: clean(input.adresse),
    code_postal: clean(input.code_postal),
    ville: clean(input.ville),
    metadata: { created_by: staff.email, created_via: "crm-web" },
  }).select("id").single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/entreprises");
  revalidatePath("/");
  return { ok: true, id: data.id as string };
}
