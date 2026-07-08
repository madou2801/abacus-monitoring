// Edge function Supabase : API du parcours bénéficiaire, appelée par le portail.
// Déploiement : supabase functions deploy intake-api --no-verify-jwt
//
// Auth : header Authorization: Bearer <INTAKE_API_SECRET>.
// Secrets : INTAKE_API_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
//   Envoi réel (stack prod) : N8N_EMAIL_WEBHOOK + CLICKSEND_USERNAME + CLICKSEND_API_KEY.
//   Sinon notifications mises en file (QueueNotifier), aucun envoi externe.

import { corsHeaders, json } from "../_shared/cors.ts";
import { handleIntakeRequest } from "../_shared/intake-handler.ts";
import { createServiceClient, SupabaseCrmStore } from "../_shared/supabase-store.ts";
import {
  MpcpfNotifier,
  QueueNotifier,
  type Notifier,
} from "../_shared/notifier.ts";

// deno-lint-ignore no-explicit-any
const env = (globalThis as any).Deno?.env;

function buildNotifier(): Notifier {
  // Stack PROD réelle : email via webhook n8n (Gmail OAuth2) + SMS ClickSend.
  const emailWebhookUrl = env.get("N8N_EMAIL_WEBHOOK");
  const clickSendUser = env.get("CLICKSEND_USERNAME");
  const clickSendKey = env.get("CLICKSEND_API_KEY");
  if (emailWebhookUrl && clickSendUser && clickSendKey) {
    return new MpcpfNotifier({
      fetchFn: fetch as never,
      emailWebhookUrl,
      clickSendUser,
      clickSendKey,
      smsSender: env.get("CLICKSEND_SENDER") ?? "MonPermis",
    });
  }
  // Stack prod non configurée : file traçable, aucun envoi externe.
  return new QueueNotifier();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);

  // Auth par secret partagé.
  const secret = env.get("INTAKE_API_SECRET");
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  // Fail-closed : pas de secret configuré ⇒ on refuse (jamais d'accès libre).
  if (!secret) return json({ error: "config: INTAKE_API_SECRET manquant" }, 503);
  if (provided !== secret) return json({ error: "non autorisé" }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON invalide" }, 400);
  }

  const sb = createServiceClient(
    env.get("SUPABASE_URL"),
    env.get("SUPABASE_SERVICE_ROLE_KEY"),
  );

  // deno-lint-ignore no-explicit-any
  const res = await handleIntakeRequest(body as any, {
    store: new SupabaseCrmStore(sb),
    notifier: buildNotifier(),
  });
  return json(res.body, res.status);
});
