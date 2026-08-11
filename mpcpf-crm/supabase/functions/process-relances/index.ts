// Edge function Supabase : moteur de relances (à cadencer via cron).
// Déploiement : supabase functions deploy process-relances
// Cron (pg_cron / Supabase scheduled functions) toutes les 15 min :
//   select net.http_post('https://<project>.supabase.co/functions/v1/process-relances', ...);
//
// Secrets : SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (injectés).
//   Envoi réel (stack prod) : N8N_EMAIL_WEBHOOK + CLICKSEND_USERNAME + CLICKSEND_API_KEY
//   (MpcpfNotifier : email via n8n Gmail, SMS via ClickSend).
//   Sinon QueueNotifier (mise en file traçable, aucun envoi externe).
//   Rappels téléphoniques (canal 'call') : Retell outbound — à brancher.

import { json } from "../_shared/cors.ts";
import { createServiceClient, SupabaseCrmStore } from "../_shared/supabase-store.ts";
import {
  type ChannelDispatcher,
  processRelances,
} from "../_shared/relances-handler.ts";
import {
  MpcpfNotifier,
  notify,
  type Notifier,
  QueueNotifier,
} from "../_shared/notifier.ts";

// deno-lint-ignore no-explicit-any
const env = (globalThis as any).Deno?.env;

function buildNotifier(): Notifier {
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

// Contenu des relances par règle (sujet email + corps). Repli générique.
const TEMPLATES: Record<string, { subject: string; body: string }> = {
  relance_no_answer: {
    subject: "MonPermisCPF — on a essayé de vous joindre",
    body: "Bonjour, nous avons tenté de vous appeler au sujet de votre projet de permis. Rappelez-nous au 09 74 99 15 15 ou répondez à cet email.",
  },
  relance_voicemail: {
    subject: "MonPermisCPF — votre projet de permis",
    body: "Bonjour, suite à notre appel, nous restons disponibles pour finaliser votre dossier permis financé par le CPF. Rappelez-nous au 09 74 99 15 15.",
  },
  relance_wedof_doc: {
    subject: "MonPermisCPF — pièces à compléter",
    body: "Bonjour, il manque des pièces pour valider votre dossier. Merci de les déposer pour poursuivre votre inscription.",
  },
  relance_stale: {
    subject: "MonPermisCPF — on reprend votre dossier ?",
    body: "Bonjour, votre dossier permis est en attente. Souhaitez-vous le poursuivre ? Nous sommes là pour vous accompagner.",
  },
  relance_intake: {
    subject: "MonPermisCPF — finalisez votre demande",
    body: "Bonjour, il ne reste qu'une étape pour lancer votre dossier permis. Complétez votre formulaire de prise de contact.",
  },
  relance_pieces: {
    subject: "MonPermisCPF — pièces justificatives manquantes",
    body: "Bonjour, merci de déposer vos pièces (CNI + justificatif de domicile) pour avancer sur votre dossier.",
  },
  relance_devis: {
    subject: "MonPermisCPF — votre devis vous attend",
    body: "Bonjour, votre devis de formation est disponible. Validez-le pour démarrer votre formation.",
  },
  relance_facture_impayee: {
    subject: "MonPermisCPF — facture en attente de règlement",
    body: "Bonjour, une facture liée à votre dossier reste en attente de règlement. Merci de procéder à sa régularisation.",
  },
};

function templateFor(ruleCode: string): { subject: string; body: string } {
  return TEMPLATES[ruleCode] ?? {
    subject: "MonPermisCPF — relance",
    body: "Bonjour, nous revenons vers vous concernant votre dossier permis. L'équipe MonPermisCPF.",
  };
}

const notifier = buildNotifier();

// Dispatcher email : envoie réellement (MpcpfNotifier) et journalise.
const emailDispatcher: ChannelDispatcher = async (task, store) => {
  const contact = await store.getBeneficiaryContact(task.beneficiary_id);
  if (!contact?.email) throw new Error("email bénéficiaire manquant");
  const tpl = templateFor(task.rule_code);
  const { result } = await notify(store, notifier, task.beneficiary_id, {
    channel: "email",
    to: contact.email,
    subject: tpl.subject,
    body: tpl.body,
    templateCode: task.template_code ?? undefined,
    metadata: { follow_up_task: task.id, rule_code: task.rule_code },
  });
  if (result.status === "failed") throw new Error(result.error ?? "échec envoi email");
  return { result: `email ${result.status} (${result.provider})` };
};

// Dispatcher SMS : envoie via ClickSend (MpcpfNotifier) et journalise.
const smsDispatcher: ChannelDispatcher = async (task, store) => {
  const contact = await store.getBeneficiaryContact(task.beneficiary_id);
  if (!contact?.phone) throw new Error("téléphone bénéficiaire manquant");
  const tpl = templateFor(task.rule_code);
  const { result } = await notify(store, notifier, task.beneficiary_id, {
    channel: "sms",
    to: contact.phone,
    body: tpl.body,
    templateCode: task.template_code ?? undefined,
    metadata: { follow_up_task: task.id, rule_code: task.rule_code },
  });
  if (result.status === "failed") throw new Error(result.error ?? "échec envoi SMS");
  return { result: `sms ${result.status} (${result.provider})` };
};

// Dispatcher appel : rappel sortant Retell — à brancher (RETELL_FROM_NUMBER/AGENT_ID).
const callDispatcher: ChannelDispatcher = (task) => {
  return Promise.resolve({ result: `appel à planifier (tentative ${task.attempt_no})` });
};

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "méthode non autorisée" }, 405);
  }

  const sb = createServiceClient(
    env.get("SUPABASE_URL"),
    env.get("SUPABASE_SERVICE_ROLE_KEY"),
  );

  // detect_stale = OFF par défaut : sur des données mirrorées (anciennes dates)
  // il relancerait en masse les dossiers dormants — comportement qu'Harvey ne fait
  // pas. À activer explicitement (CRM_DETECT_STALE=true) une fois sur dates réelles.
  const detectStale = env.get("CRM_DETECT_STALE") === "true";

  const report = await processRelances({
    store: new SupabaseCrmStore(sb),
    dispatchers: { email: emailDispatcher, sms: smsDispatcher, call: callDispatcher },
    detectStale,
    limit: 200,
  });

  return json(report, 200);
});
