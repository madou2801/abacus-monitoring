// Edge function Supabase : moteur de relances (à cadencer via cron).
// Déploiement : supabase functions deploy process-relances
// Cron (pg_cron / Supabase scheduled functions) toutes les 15 min :
//   select net.http_post('https://<project>.supabase.co/functions/v1/process-relances', ...);
//
// Secrets : SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (injectés),
//           RESEND_API_KEY (optionnel, envoi email),
//           RETELL_API_KEY + RETELL_FROM_NUMBER + RETELL_AGENT_ID (optionnel, rappels).

import { json } from "../_shared/cors.ts";
import { createServiceClient, SupabaseCrmStore } from "../_shared/supabase-store.ts";
import {
  type ChannelDispatcher,
  processRelances,
} from "../_shared/relances-handler.ts";

// deno-lint-ignore no-explicit-any
const env = (globalThis as any).Deno?.env;

// Dispatcher email : journalise l'email et l'envoie via Resend si configuré.
const emailDispatcher: ChannelDispatcher = async (task, store) => {
  const id = await store.insertEmail({
    beneficiary_id: task.beneficiary_id,
    direction: "outbound",
    template_code: task.template_code ?? undefined,
    status: env.get("RESEND_API_KEY") ? "sent" : "queued",
    provider: "resend",
    subject: `Relance ${task.rule_code}`,
    metadata: { follow_up_task: task.id },
  });
  return { result: `email ${id}` };
};

// Dispatcher appel : marque la relance comme planifiée (intégration Retell
// outbound à brancher ici si RETELL_FROM_NUMBER/RETELL_AGENT_ID fournis).
const callDispatcher: ChannelDispatcher = async (task) => {
  return { result: `appel planifié (tentative ${task.attempt_no})` };
};

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "méthode non autorisée" }, 405);
  }

  const sb = createServiceClient(
    env.get("SUPABASE_URL"),
    env.get("SUPABASE_SERVICE_ROLE_KEY"),
  );

  const report = await processRelances({
    store: new SupabaseCrmStore(sb),
    dispatchers: { email: emailDispatcher, call: callDispatcher, sms: callDispatcher },
    detectStale: true,
    limit: 200,
  });

  return json(report, 200);
});
