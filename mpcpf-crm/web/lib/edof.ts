// Brique « lien d'inscription CPF » (moncompteformation.gouv.fr) — recréée après la
// régression V4 (spec-crm-tiers-payeur §3) : la feature du 25/07 avait été supprimée
// lors d'un remaniement, sans qu'aucun test ne le signale. Logique PURE (aucune
// dépendance réseau / Next) pour être couverte par le harnais de test racine.
//
// Source des liens : public.urls_cpf (489 liens profonds, 31 formations permis × villes).
// Les codes catalogue MPCPF (B_30H, A2, BE_10H…) ≠ codes EDOF (PCB, PCA1, PCBE…) : il
// faut cette table de correspondance explicite (pas d'auto-match).

// Correspondance code catalogue MPCPF -> formation_numero EDOF.
// Codes SANS lien EDOF exact (A2_25H, A2_HC10, BE 5h, EVAL, formations non-permis) :
// volontairement ABSENTS -> pas de résolution automatique (l'agent choisit le bon lien
// via la recherche du bouton CRM).
export const CATALOGUE_EDOF_MAP: Record<string, string> = {
  // Permis B — boîte automatique (BVA)
  B: "Bauto13", B_18H: "PCB2_18HBA", B_20H: "PCB2", B_30H: "PCB",
  // Permis B — boîte manuelle
  B_MAN20: "PCB2", B_MAN25: "PCB2_25HMAN", B_MAN30: "PCB", B_MAN40: "PCB1",
  // Moto A2
  A2: "PCA1",
  // Permis BE (remorque)
  BE_10H: "PCBE", BE_20H: "PCBE2",
  // Permis poids-lourd / transport
  C: "MPL_C", C1: "MPL_C1", CE: "MPL_CE", D: "MPL_D", D1: "MPL_D1", DE: "MPL_DE",
  PL_C1E: "MPL_C1E", PL_D1E: "MPL_D1E",
  // Code de la route
  CODE_ETG: "PDR1", CODE_ETM: "PDR3",
};

export type EdofUrlRow = {
  id: number;
  formation_numero: string;
  code_cpf: string | null;
  intitule: string;
  code_postal: string | null;
  ville: string | null;
  url: string;
  actif: boolean;
};

export function resolveEdofFormationNumero(code: string | null | undefined): string | null {
  if (!code) return null;
  return CATALOGUE_EDOF_MAP[String(code).trim()] ?? null;
}

// Choix de la ville pour un ensemble de liens d'une même formation :
//   1. le département du bénéficiaire (2 premiers chiffres du CP),
//   2. sinon Chessy 77700 (le siège — décision client 17/08),
//   3. sinon la 1re ville active.
export function pickCityRow<T extends { code_postal?: string | null }>(
  rows: T[],
  cp?: string | null,
): T | null {
  if (!rows || rows.length === 0) return null;
  const dept = String(cp ?? "").replace(/\D/g, "").slice(0, 2);
  let row = dept ? rows.find((r) => String(r.code_postal ?? "").slice(0, 2) === dept) : undefined;
  if (!row) row = rows.find((r) => String(r.code_postal ?? "") === "77700");
  if (!row) row = rows[0];
  return row ?? null;
}

// URL de suivi de clic : redirige via campaign-tracker (route /t/cpf/:ref/:enc), qui
// journalise l'événement puis renvoie vers moncompteformation. Base configurable.
const TRACKER_BASE = process.env.PUBLIC_TRACKER_BASE || "https://api.monpermiscpf.com";
export function cpfTrackedUrl(ref: string, targetUrl: string): string {
  const enc = Buffer.from(targetUrl, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${TRACKER_BASE}/t/cpf/${encodeURIComponent(ref)}/${enc}`;
}

const esc = (s: string): string =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Email HTML « lien d'inscription CPF » (identique en esprit à l'email auto du formulaire).
export function cpfLinkEmailHtml(
  prenom: string,
  detail: string,
  intitule: string,
  ville: string,
  trackedUrl: string,
  message?: string,
): string {
  const perso = (message ?? "").trim()
    ? `<p style="background:#f0f7ff;border-left:3px solid #1A6BB5;padding:10px 14px;border-radius:4px">${esc(message!.trim())}</p>`
    : "";
  return (
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:auto;color:#2e3d49">' +
    '<h2 style="color:#1A6BB5">Votre inscription CPF en 1 clic</h2>' +
    `<p>Bonjour ${esc(prenom)},</p>` +
    perso +
    `<p>Votre formation <strong>${esc(detail)}</strong> est éligible au <strong>CPF (Compte Personnel de Formation)</strong>. ` +
    "Vous pouvez vous inscrire directement, en toute autonomie, sur le site officiel <strong>moncompteformation.gouv.fr</strong> :</p>" +
    `<p style="text-align:center;margin:24px 0"><a href="${trackedUrl}" style="background:#00A86B;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold;display:inline-block;font-size:16px">Je m'inscris avec mon CPF</a></p>` +
    '<table cellpadding="8" style="width:100%;border-collapse:collapse;background:#f8f9fa;border-radius:8px">' +
    `<tr><td>Formation</td><td style="text-align:right"><strong>${esc(intitule || detail)}</strong></td></tr>` +
    `<tr><td>Lieu</td><td style="text-align:right">${esc(ville)}</td></tr></table>` +
    '<p style="margin-top:16px"><strong>Comment ça marche ?</strong></p>' +
    '<ol style="color:#2e3d49;font-size:14px;line-height:1.6"><li>Cliquez sur le bouton ci-dessus (connexion via FranceConnect+).</li>' +
    "<li>Vérifiez le montant de vos droits CPF disponibles.</li>" +
    "<li>Validez votre inscription : la formation peut être financée jusqu'à 100%.</li></ol>" +
    `<p style="font-size:13px;color:#6c757d">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><span style="word-break:break-all">${trackedUrl}</span></p>` +
    '<p>Une question ou besoin d\'aide pour l\'inscription ? Lucie vous accompagne : <a href="tel:+33974991515">09 74 99 15 15</a>.</p>' +
    '<p style="color:#6c757d;font-size:13px">MonPermisCPF — certifié Qualiopi</p></div>'
  );
}
