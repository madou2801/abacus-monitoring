// retell.ts — vérification de signature + interprétation des payloads Retell.
// Runtime-agnostic : utilise Web Crypto (présent sous Node 20+ et Deno).

import type { CallOutcome, RetellCall, RetellWebhookPayload } from "./types.ts";

const encoder = new TextEncoder();

/**
 * Comparaison à temps constant pour éviter les attaques temporelles.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Calcule la signature HMAC-SHA256 (hex) d'un corps brut avec la clé Retell.
 * Reproduit le schéma de `Retell.verify`.
 */
export async function computeRetellSignature(
  rawBody: string,
  apiKey: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(apiKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  return toHex(sig);
}

/**
 * Vérifie la signature d'un webhook Retell.
 * Le header `x-retell-signature` peut être préfixé par "v=" selon les versions.
 */
export async function verifyRetellSignature(
  rawBody: string,
  signature: string | null | undefined,
  apiKey: string | null | undefined,
): Promise<boolean> {
  if (!signature || !apiKey) return false;
  const provided = signature.startsWith("v=") ? signature.slice(2) : signature;
  const expected = await computeRetellSignature(rawBody, apiKey);
  return timingSafeEqual(provided.toLowerCase(), expected.toLowerCase());
}

/**
 * Déduit le résultat métier d'un appel à partir de l'état Retell.
 * Sert à brancher les automatisations de relance.
 */
export function deriveOutcome(call: RetellCall): CallOutcome {
  const reason = (call.disconnection_reason ?? "").toLowerCase();
  const inVoicemail = call.call_analysis?.in_voicemail === true;

  if (inVoicemail || reason.includes("voicemail")) return "voicemail";
  if (
    reason.includes("no_answer") ||
    reason.includes("dial_no_answer") ||
    reason.includes("dial_busy") ||
    reason.includes("dial_failed")
  ) {
    return "no_answer";
  }

  const custom = call.call_analysis?.custom_analysis_data ?? {};
  const wantsCallback = custom["callback_requested"] === true ||
    custom["rappel"] === true;
  if (wantsCallback) return "callback";

  const notInterested = call.call_analysis?.call_successful === false &&
    (custom["not_interested"] === true || custom["interesse"] === false);
  if (notInterested) return "not_interested";

  // Appel décroché avec échange réel.
  if (reason.includes("user_hangup") || reason.includes("agent_hangup") ||
      (call.duration_ms ?? 0) > 5000) {
    return "answered";
  }
  return "no_answer";
}

function msToIso(ms: number | undefined): string | null {
  return typeof ms === "number" && ms > 0 ? new Date(ms).toISOString() : null;
}

/**
 * Transforme un payload Retell brut en données normalisées prêtes à persister.
 */
export function normalizeRetellCall(payload: RetellWebhookPayload) {
  const c = payload.call;
  const duration = c.duration_ms ??
    (c.start_timestamp && c.end_timestamp
      ? c.end_timestamp - c.start_timestamp
      : null);

  return {
    event: payload.event,
    retell_call_id: c.call_id,
    agent_id: c.agent_id ?? null,
    direction: c.direction ?? null,
    from_number: c.from_number ?? null,
    to_number: c.to_number ?? null,
    call_status: c.call_status ?? null,
    disconnection_reason: c.disconnection_reason ?? null,
    started_at: msToIso(c.start_timestamp),
    ended_at: msToIso(c.end_timestamp),
    duration_ms: duration,
    recording_source_url: c.recording_url ?? null,
    call_successful: c.call_analysis?.call_successful ?? null,
    sentiment: c.call_analysis?.user_sentiment?.toLowerCase() ?? null,
    summary: c.call_analysis?.call_summary ?? null,
    outcome: deriveOutcome(c),
    transcript: c.transcript ?? null,
    transcript_object: c.transcript_object ?? null,
    metadata: c.metadata ?? {},
    dynamic_variables: c.retell_llm_dynamic_variables ?? {},
  };
}

/** Numéro du bénéficiaire selon le sens de l'appel. */
export function beneficiaryPhone(call: RetellCall): string | null {
  if (call.direction === "inbound") return call.from_number ?? null;
  return call.to_number ?? call.from_number ?? null;
}
