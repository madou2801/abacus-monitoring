import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Client Supabase (auth) côté serveur, lié aux cookies de la requête. Clé ANON.
export function supabaseServer() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // appelé depuis un Server Component : ignoré (le middleware rafraîchit la session)
          }
        },
      },
    },
  );
}
