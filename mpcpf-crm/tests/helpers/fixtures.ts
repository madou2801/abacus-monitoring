// fixtures.ts — payloads d'exemple Retell/Wedof, signature et fetch simulé.

import { computeRetellSignature } from "../../supabase/functions/_shared/retell.ts";
import type { FetchLike } from "../../supabase/functions/_shared/recording.ts";
import type {
  RetellWebhookPayload,
  WedofWebhookPayload,
} from "../../supabase/functions/_shared/types.ts";

export const TEST_RETELL_KEY = "key_test_retell_secret";
export const TEST_WEDOF_SECRET = "wedof_shared_secret";

/** Signe un corps brut comme le ferait Retell. */
export async function signRetell(rawBody: string): Promise<string> {
  return computeRetellSignature(rawBody, TEST_RETELL_KEY);
}

export function retellAnsweredCall(over: Partial<RetellWebhookPayload["call"]> = {}): RetellWebhookPayload {
  return {
    event: "call_analyzed",
    call: {
      call_id: "call_answered_001",
      agent_id: "agent_123",
      direction: "outbound",
      from_number: "+33180001122",
      to_number: "+33612345678",
      call_status: "ended",
      disconnection_reason: "user_hangup",
      start_timestamp: 1_700_000_000_000,
      end_timestamp: 1_700_000_120_000,
      duration_ms: 120_000,
      recording_url: "https://retell.example/recordings/call_answered_001.wav",
      transcript: "Agent: Bonjour. User: Oui bonjour, je suis interesse par le permis.",
      transcript_object: [
        { role: "agent", content: "Bonjour." },
        { role: "user", content: "Oui bonjour, je suis interesse." },
      ],
      call_analysis: {
        call_summary: "Le bénéficiaire est intéressé par une formation au permis.",
        user_sentiment: "Positive",
        call_successful: true,
        in_voicemail: false,
      },
      ...over,
    },
  };
}

export function retellNoAnswerCall(): RetellWebhookPayload {
  return {
    event: "call_analyzed",
    call: {
      call_id: "call_no_answer_002",
      agent_id: "agent_123",
      direction: "outbound",
      from_number: "+33180001122",
      to_number: "+33655443322",
      call_status: "ended",
      disconnection_reason: "dial_no_answer",
      start_timestamp: 1_700_000_000_000,
      end_timestamp: 1_700_000_000_500,
      duration_ms: 500,
      call_analysis: { in_voicemail: false, call_successful: false },
    },
  };
}

export function retellVoicemailCall(): RetellWebhookPayload {
  return {
    event: "call_analyzed",
    call: {
      call_id: "call_voicemail_003",
      direction: "outbound",
      from_number: "+33180001122",
      to_number: "+33677889900",
      call_status: "ended",
      disconnection_reason: "user_hangup",
      start_timestamp: 1_700_000_000_000,
      end_timestamp: 1_700_000_030_000,
      duration_ms: 30_000,
      call_analysis: { in_voicemail: true, call_successful: false },
    },
  };
}

export function wedofEvent(
  type: string,
  data: Partial<NonNullable<WedofWebhookPayload["data"]>> = {},
): WedofWebhookPayload {
  return {
    type,
    data: {
      id: "WF-1000",
      state: type.split(".").pop(),
      firstName: "Camille",
      lastName: "Durand",
      email: "camille.durand@example.com",
      phoneNumber: "+33612345678",
      ...data,
    },
  };
}

/** fetch simulé qui renvoie un petit fichier audio WAV factice. */
export function fakeAudioFetch(bytes = 2048): { fn: FetchLike; calls: string[] } {
  const calls: string[] = [];
  const fn: FetchLike = (url) => {
    calls.push(url);
    const data = new Uint8Array(bytes).fill(7);
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: (n: string) => (n.toLowerCase() === "content-type" ? "audio/wav" : null) },
      arrayBuffer: () => Promise.resolve(data.buffer),
    });
  };
  return { fn, calls };
}

/** fetch simulé en échec (téléchargement enregistrement KO). */
export function failingFetch(): FetchLike {
  return () =>
    Promise.resolve({
      ok: false,
      status: 404,
      headers: { get: () => null },
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });
}
