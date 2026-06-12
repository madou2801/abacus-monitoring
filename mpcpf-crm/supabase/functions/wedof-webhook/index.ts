// Edge function Supabase : réception des webhooks Wedof (statuts CPF).
// Déploiement : supabase functions deploy wedof-webhook --no-verify-jwt
//
// Secrets requis :
//   WEDOF_WEBHOOK_SECRET      secret partagé (header x-wedof-signature)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (injectés)

import { corsHeaders, json } from "../_shared/cors.ts";
import { handleWedofWebhook } from "../_shared/wedof-handler.ts";
import { createServiceClient, SupabaseCrmStore } from "../_shared/supabase-store.ts";

// deno-lint-ignore no-explicit-any
const env = (globalThis as any).Deno?.env;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);

  const rawBody = await req.text();
  const secret = req.headers.get("x-wedof-signature") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  const sb = createServiceClient(
    env.get("SUPABASE_URL"),
    env.get("SUPABASE_SERVICE_ROLE_KEY"),
  );

  const res = await handleWedofWebhook(rawBody, secret, {
    store: new SupabaseCrmStore(sb),
    secret: env.get("WEDOF_WEBHOOK_SECRET"),
    verifySignature: env.get("WEDOF_VERIFY_SIGNATURE") !== "false",
  });

  return json(res.body, res.status);
});
