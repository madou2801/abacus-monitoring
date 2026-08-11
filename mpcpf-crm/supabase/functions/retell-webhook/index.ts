// Edge function Supabase : réception des webhooks Retell.
// Déploiement : supabase functions deploy retell-webhook --no-verify-jwt
//
// Secrets requis :
//   RETELL_API_KEY            clé Retell (signature des webhooks)
//   SUPABASE_URL              injecté automatiquement
//   SUPABASE_SERVICE_ROLE_KEY injecté automatiquement
//
// Retell doit pointer son webhook sur :
//   https://<project>.supabase.co/functions/v1/retell-webhook

import { corsHeaders, json } from "../_shared/cors.ts";
import { handleRetellWebhook } from "../_shared/retell-handler.ts";
import {
  createServiceClient,
  SupabaseCrmStore,
  SupabaseStorage,
} from "../_shared/supabase-store.ts";

// deno-lint-ignore no-explicit-any
const env = (globalThis as any).Deno?.env;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);

  const rawBody = await req.text();
  const signature = req.headers.get("x-retell-signature");

  const sb = createServiceClient(
    env.get("SUPABASE_URL"),
    env.get("SUPABASE_SERVICE_ROLE_KEY"),
  );

  const res = await handleRetellWebhook(rawBody, signature, {
    store: new SupabaseCrmStore(sb),
    storage: new SupabaseStorage(sb),
    fetchFn: fetch as never,
    apiKey: env.get("RETELL_API_KEY"),
    verifySignature: env.get("RETELL_VERIFY_SIGNATURE") !== "false",
  });

  return json(res.body, res.status);
});
