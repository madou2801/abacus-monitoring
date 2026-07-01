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

export function euros(cents?: number | null): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

export function dateFr(v?: string | null): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}
