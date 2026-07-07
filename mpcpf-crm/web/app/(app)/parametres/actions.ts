"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { getStaffUser } from "@/lib/auth";
import { adminAuth, crm } from "@/lib/supabase";

// Ajoute un membre du staff : crée le compte Supabase Auth (mot de passe temporaire)
// + l'ajoute à l'allowlist crm.app_users. Réservé aux admins.
export async function addMember(input: {
  email: string;
  full_name: string;
  role: string;
}): Promise<{ ok: boolean; error?: string; tempPassword?: string; email?: string }> {
  const me = await getStaffUser();
  if (!me || me.role !== "admin") return { ok: false, error: "Réservé aux administrateurs." };

  const email = (input.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Email invalide." };
  const role = input.role === "admin" ? "admin" : "staff";
  const full_name = (input.full_name || "").trim() || null;

  const tempPassword = "Crm-" + randomUUID().replace(/-/g, "").slice(0, 12) + "!";

  // 1) compte Supabase Auth (email confirmé). Si déjà présent, on continue (on met juste à jour l'allowlist).
  const admin = adminAuth();
  const { error: aerr } = await admin.auth.admin.createUser({
    email, password: tempPassword, email_confirm: true,
  });
  const alreadyExists = aerr && /already|registered|exists/i.test(aerr.message);
  if (aerr && !alreadyExists) return { ok: false, error: aerr.message };

  // 2) allowlist crm.app_users (upsert par email)
  const { error: ierr } = await crm()
    .from("app_users")
    .upsert({ email, full_name, role, active: true }, { onConflict: "email" });
  if (ierr) return { ok: false, error: ierr.message };

  revalidatePath("/parametres");
  return {
    ok: true,
    email,
    tempPassword: alreadyExists ? undefined : tempPassword,
  };
}

// Active / désactive un membre (admin uniquement).
export async function setMemberActive(email: string, active: boolean): Promise<{ ok: boolean; error?: string }> {
  const me = await getStaffUser();
  if (!me || me.role !== "admin") return { ok: false, error: "Réservé aux administrateurs." };
  if (email.toLowerCase() === me.email.toLowerCase()) return { ok: false, error: "Vous ne pouvez pas vous désactiver vous-même." };
  const { error } = await crm().from("app_users").update({ active }).ilike("email", email);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parametres");
  return { ok: true };
}
