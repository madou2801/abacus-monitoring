import { supabaseServer } from "@/utils/supabase/server";
import { crm } from "@/lib/supabase";

export type StaffUser = { email: string; full_name: string | null; role: string };

// Renvoie l'utilisateur staff connecté (authentifié + présent/actif dans crm.app_users),
// sinon null. C'est la barrière qui empêche les comptes bénéficiaires d'entrer.
export async function getStaffUser(): Promise<StaffUser | null> {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email) return null;
  const { data } = await crm()
    .from("app_users")
    .select("email, full_name, role, active")
    .ilike("email", user.email)
    .maybeSingle();
  if (!data || data.active !== true) return null;
  return { email: user.email, full_name: data.full_name ?? null, role: data.role };
}
