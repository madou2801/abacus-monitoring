import { createClient } from "@supabase/supabase-js";

// Client CRM — SERVEUR UNIQUEMENT (service_role). Ne jamais importer côté client.
// Le schéma crm reste verrouillé service_role : la clé ne touche jamais le navigateur.
export function crm() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants (voir .env.local)");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "crm" },
  });
}

// Client service_role pour l'admin Auth (créer un compte). SERVEUR UNIQUEMENT.
export function adminAuth() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function euros(cents?: number | null): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

export function dateFr(v?: string | null): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export function dateTimeFr(v?: string | null): string {
  if (!v) return "—";
  return new Date(v).toLocaleString("fr-FR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

// Titre d'affichage d'un bénéficiaire : nom si présent, sinon tél/email
// (les appels entrants Retell n'ont souvent qu'un numéro).
export function benefTitle(b: {
  first_name?: string | null; last_name?: string | null;
  phone?: string | null; email?: string | null;
}): string {
  const name = [b.first_name, b.last_name].filter(Boolean).join(" ").trim();
  if (name) return name;
  if (b.phone) return `📞 ${b.phone}`;
  if (b.email) return b.email;
  return "Sans nom";
}
