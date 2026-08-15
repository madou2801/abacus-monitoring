import { pilotkairos } from "./supabase";

// Identifiant France Travail (DE) : 11 chiffres, ou 7 chiffres + 1 lettre.
export function isValidFt(ft?: string | null): boolean {
  return !!ft && /^(\d{11}|\d{7}[A-Za-z])$/.test(ft.trim());
}

// Libellés FR des statuts de dossier Kairos (schéma pilotkairos, enum statut_dossier).
export const KAIROS_STATUT_LABEL: Record<string, { label: string; color: string }> = {
  PROSPECT: { label: "En file (robot)", color: "bg-slate-100 text-slate-600" },
  DEVIS_BROUILLON: { label: "Devis en brouillon", color: "bg-amber-100 text-amber-700" },
  DEVIS_TRANSMIS_DE: { label: "Devis transmis (attente DE)", color: "bg-emerald-100 text-emerald-700" },
  DEVIS_VALIDE_DE: { label: "Devis validé par le DE", color: "bg-emerald-100 text-emerald-700" },
  DEVIS_REFUSE_DE: { label: "Devis refusé par le DE", color: "bg-rose-100 text-rose-700" },
  DEVIS_TRANSMIS_FT: { label: "Transmis France Travail", color: "bg-emerald-100 text-emerald-700" },
  DEVIS_VALIDE_FT: { label: "Validé France Travail", color: "bg-emerald-100 text-emerald-700" },
  DEVIS_REFUSE_FT: { label: "Refusé France Travail", color: "bg-rose-100 text-rose-700" },
  CLOTURE: { label: "Clôturé", color: "bg-slate-100 text-slate-500" },
  ANNULE: { label: "Annulé", color: "bg-slate-100 text-slate-500" },
};

export type KairosDevisInfo = {
  statut: string;
  numero: string | null;
  dateEnvoi: string | null;
  montantTtc: number | null;
  formation: string | null;
  syncStatus: string | null;
  syncError: string | null;
};

// Devis Kairos d'un bénéficiaire, relié par l'identifiant France Travail. Couvre
// TOUS les canaux (formulaires de qualification, mini-form, CRM…) car tous
// aboutissent dans pilotkairos.dossiers_kairos, clé = ft_individu_id.
export async function fetchKairosDevis(ftId?: string | null): Promise<KairosDevisInfo | null> {
  if (!isValidFt(ftId)) return null;
  const k = pilotkairos();
  const { data: doss } = await k
    .from("dossiers_kairos")
    .select("id, statut, kairos_dossier_id, last_sync_at, last_sync_status, sync_error_message, formation_intitule, created_at")
    .eq("ft_individu_id", (ftId as string).trim())
    .order("created_at", { ascending: false })
    .limit(1);
  if (!doss || !doss.length) return null;
  const d = doss[0] as Record<string, any>;

  const { data: devis } = await k
    .from("devis_aif_poei")
    .select("kairos_devis_id, date_transmission_de, montant_ttc, created_at")
    .eq("dossier_id", d.id)
    .order("created_at", { ascending: false })
    .limit(1);
  const dev = devis && devis.length ? (devis[0] as Record<string, any>) : null;

  const transmis = typeof d.statut === "string" && d.statut.startsWith("DEVIS_TRANSMIS");
  return {
    statut: d.statut,
    numero: dev?.kairos_devis_id ?? d.kairos_dossier_id ?? null,
    dateEnvoi: dev?.date_transmission_de ?? (transmis ? d.last_sync_at : null),
    montantTtc: dev?.montant_ttc ?? null,
    formation: d.formation_intitule ?? null,
    syncStatus: d.last_sync_status ?? null,
    syncError: d.sync_error_message ?? null,
  };
}
