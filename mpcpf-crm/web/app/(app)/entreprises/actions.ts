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

// Recherche des coordonnées d'une entreprise par SIRET via l'API publique
// recherche-entreprises.api.gouv.fr (INSEE/DINUM, sans clé). Pré-remplit le formulaire.
export async function lookupSiret(siretRaw: string): Promise<{
  ok: boolean;
  error?: string;
  company?: { raison_sociale: string; siret: string; adresse: string; code_postal: string; ville: string };
}> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Non autorisé" };

  const siret = (siretRaw ?? "").replace(/\s+/g, "");
  if (!/^\d{14}$/.test(siret)) return { ok: false, error: "SIRET invalide (14 chiffres attendus)." };

  try {
    const url = `https://recherche-entreprises.api.gouv.fr/search?q=${siret}&per_page=1&page=1`;
    const r = await fetch(url, { headers: { "User-Agent": "MPCPF-CRM" }, cache: "no-store" });
    if (!r.ok) return { ok: false, error: `Annuaire entreprises indisponible (HTTP ${r.status}).` };
    const j: any = await r.json();
    const res = j?.results?.[0];
    if (!res) return { ok: false, error: "Aucune entreprise trouvée pour ce SIRET." };

    const s = res.siege ?? {};
    const adresse = [s.numero_voie, s.type_voie, s.libelle_voie].filter(Boolean).join(" ").trim() || s.adresse || "";
    return {
      ok: true,
      company: {
        raison_sociale: res.nom_complet ?? res.nom_raison_sociale ?? "",
        siret: s.siret ?? siret,
        adresse,
        code_postal: s.code_postal ?? "",
        ville: s.libelle_commune ?? s.commune ?? "",
      },
    };
  } catch {
    return { ok: false, error: "Erreur réseau lors de la recherche SIRET." };
  }
}
