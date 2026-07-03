// Référentiels d'affichage : étapes pipeline, statuts facture, confiance matching.

export const STAGES: { code: string; label: string; color: string }[] = [
  { code: "lead", label: "Lead", color: "bg-slate-200 text-slate-700" },
  { code: "contact_etabli", label: "Contact établi", color: "bg-sky-100 text-sky-700" },
  { code: "qualifie", label: "Qualifié", color: "bg-indigo-100 text-indigo-700" },
  { code: "inscrit", label: "Inscrit", color: "bg-violet-100 text-violet-700" },
  { code: "en_formation", label: "En formation", color: "bg-amber-100 text-amber-700" },
  { code: "certifie", label: "Certifié", color: "bg-emerald-100 text-emerald-700" },
  { code: "perdu", label: "Perdu", color: "bg-rose-100 text-rose-700" },
];

export const STAGE_LABEL: Record<string, string> = Object.fromEntries(
  STAGES.map((s) => [s.code, s.label]),
);
export const STAGE_COLOR: Record<string, string> = Object.fromEntries(
  STAGES.map((s) => [s.code, s.color]),
);

export const INVOICE_STATUS: Record<string, { label: string; color: string }> = {
  a_emettre: { label: "À émettre", color: "bg-slate-100 text-slate-700" },
  emise: { label: "Émise", color: "bg-sky-100 text-sky-700" },
  transmise: { label: "Transmise", color: "bg-indigo-100 text-indigo-700" },
  payee: { label: "Payée", color: "bg-amber-100 text-amber-700" },
  encaissee: { label: "Encaissée", color: "bg-emerald-100 text-emerald-700" },
  annulee: { label: "Annulée", color: "bg-rose-100 text-rose-700" },
};

export const CONFIDENCE: Record<string, { label: string; color: string }> = {
  high: { label: "Fiable", color: "bg-emerald-100 text-emerald-700" },
  medium: { label: "À confirmer", color: "bg-amber-100 text-amber-700" },
  low: { label: "Faible", color: "bg-rose-100 text-rose-700" },
  none: { label: "—", color: "bg-slate-100 text-slate-500" },
};

export const FINANCEUR_LABEL: Record<string, string> = {
  edof: "CPF (EDOF)",
  kairos: "France Travail",
  opco: "OPCO",
  entreprise: "Entreprise",
  autofinancement: "Autofinancement",
};

// Canaux d'acquisition (cf. crm.intake_channel). Ordre = affichage dashboard.
export const CHANNELS: { code: string; label: string; icon: string; color: string }[] = [
  { code: "retell", label: "Appels (Retell)", icon: "📞", color: "text-sky-600" },
  { code: "formulaire", label: "Formulaires site", icon: "📝", color: "text-indigo-600" },
  { code: "ft", label: "Emails France Travail", icon: "🏛️", color: "text-emerald-600" },
  { code: "email", label: "Emails directs", icon: "✉️", color: "text-amber-600" },
  { code: "edof", label: "EDOF direct", icon: "🎓", color: "text-violet-600" },
  { code: "autre", label: "Autre", icon: "•", color: "text-slate-500" },
];
export const CHANNEL_LABEL: Record<string, string> = Object.fromEntries(CHANNELS.map((c) => [c.code, c.label]));

export const LEAD_STATUS: Record<string, { label: string; color: string }> = {
  nouveau: { label: "Nouveau", color: "bg-slate-100 text-slate-700" },
  en_cours: { label: "En cours", color: "bg-sky-100 text-sky-700" },
  client: { label: "Client", color: "bg-emerald-100 text-emerald-700" },
  perdu: { label: "Perdu", color: "bg-rose-100 text-rose-700" },
};
