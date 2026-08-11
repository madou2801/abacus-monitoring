"use server";

import { getStaffUser } from "@/lib/auth";
import { adminAuth } from "@/lib/supabase";
import { sendMpcpfEmail } from "@/lib/notify";

type Cible = "eleve" | "autoecole";

const APP_URL: Record<Cible, string> = {
  eleve: "https://app.monpermiscpf.com",
  autoecole: "https://autoecole.monpermiscpf.com",
};
const APP_LABEL: Record<Cible, string> = {
  eleve: "votre espace élève",
  autoecole: "votre espace auto-école",
};

// Mot de passe provisoire au format MPCPFMMJJ (mois + jour, fuseau Europe/Paris).
function provisionalPassword(): string {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const mm = parts.find((p) => p.type === "month")?.value ?? "00";
  const jj = parts.find((p) => p.type === "day")?.value ?? "00";
  return `MPCPF${mm}${jj}`;
}

// Retrouve l'id de l'utilisateur Supabase Auth par email (l'API admin ne filtre
// pas par email → on pagine listUsers). Renvoie null si aucun compte.
async function findUserIdByEmail(
  admin: ReturnType<typeof adminAuth>,
  email: string
): Promise<string | null> {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    const found = users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (found) return found.id;
    if (users.length < 200) break; // dernière page
  }
  return null;
}

export async function resetUserPassword(input: {
  email: string;
  cible: Cible;
  prenom?: string | null;
}): Promise<{ ok: boolean; error?: string; password?: string; created?: boolean }> {
  const me = await getStaffUser();
  if (!me || me.role !== "admin") {
    return { ok: false, error: "Réservé aux administrateurs." };
  }
  const email = (input.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Email invalide." };
  }
  const cible: Cible = input.cible === "autoecole" ? "autoecole" : "eleve";
  const pwd = provisionalPassword();
  const admin = adminAuth();

  try {
    let created = false;
    const userId = await findUserIdByEmail(admin, email);
    if (userId) {
      const { error } = await admin.auth.admin.updateUserById(userId, { password: pwd });
      if (error) return { ok: false, error: error.message };
    } else {
      // Aucun compte pour cet email → on le crée avec ce mot de passe (email confirmé).
      const { error } = await admin.auth.admin.createUser({
        email,
        password: pwd,
        email_confirm: true,
      });
      if (error) return { ok: false, error: error.message };
      created = true;
    }

    const url = APP_URL[cible];
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;line-height:1.55;max-width:600px">
<p>Bonjour${input.prenom ? " " + input.prenom : ""},</p>
<p>Le mot de passe de <b>${APP_LABEL[cible]} MonPermisCPF</b> a été réinitialisé. Voici vos identifiants de connexion :</p>
<table style="border-collapse:collapse;margin:14px 0">
<tr><td style="padding:4px 10px;color:#667">Adresse</td><td style="padding:4px 10px"><a href="${url}" style="color:#0d47a1">${url}</a></td></tr>
<tr><td style="padding:4px 10px;color:#667">Identifiant</td><td style="padding:4px 10px">${email}</td></tr>
<tr><td style="padding:4px 10px;color:#667">Mot de passe provisoire</td><td style="padding:4px 10px"><b style="font-family:monospace;background:#f1f5f9;padding:2px 8px;border-radius:4px">${pwd}</b></td></tr>
</table>
<p><b>Pour votre sécurité, changez ce mot de passe dès votre première connexion.</b></p>
<p>Cordialement,<br>L'équipe MonPermisCPF</p></div>`;

    let emailSent = true;
    try {
      await sendMpcpfEmail(email, "Réinitialisation de votre mot de passe — MonPermisCPF", html);
    } catch {
      emailSent = false;
    }

    return {
      ok: true,
      password: pwd,
      created,
      error: emailSent ? undefined : "Mot de passe défini mais l'email n'a pas pu être envoyé — communiquez-le manuellement.",
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Erreur inconnue." };
  }
}
