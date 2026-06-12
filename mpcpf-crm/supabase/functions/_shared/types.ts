// types.ts — types de domaine partagés entre edge functions et tests.

export type PipelineStage =
  | "lead"
  | "contact_etabli"
  | "qualifie"
  | "inscrit"
  | "en_formation"
  | "certifie"
  | "perdu";

export type CallOutcome =
  | "answered"
  | "no_answer"
  | "voicemail"
  | "callback"
  | "not_interested";

export interface Beneficiary {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  phone_e164: string | null;
  wedof_folder_id: string | null;
  pipeline_stage: PipelineStage;
  wedof_state: string | null;
}

export interface CallInput {
  retell_call_id: string;
  beneficiary_id: string | null;
  agent_id?: string | null;
  direction?: string | null;
  from_number?: string | null;
  to_number?: string | null;
  call_status?: string | null;
  disconnection_reason?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  duration_ms?: number | null;
  recording_source_url?: string | null;
  call_successful?: boolean | null;
  sentiment?: string | null;
  summary?: string | null;
  outcome?: CallOutcome | null;
  metadata?: Record<string, unknown>;
}

export interface TranscriptInput {
  full_text: string | null;
  utterances: unknown;
  word_count: number | null;
  language?: string;
}

export interface FollowUpTask {
  id: string;
  beneficiary_id: string;
  rule_code: string;
  channel: string;
  status: string;
  attempt_no: number;
  due_at: string;
  template_code: string | null;
  payload: Record<string, unknown>;
}

export interface WebhookRecord {
  alreadyProcessed: boolean;
  id: string;
}

// ---- Payloads Retell ----------------------------------------------------
// Forme simplifiée du webhook Retell (call_started / call_ended / call_analyzed).
export interface RetellWebhookPayload {
  event: "call_started" | "call_ended" | "call_analyzed";
  call: RetellCall;
}

export interface RetellCall {
  call_id: string;
  agent_id?: string;
  call_type?: string;
  direction?: "inbound" | "outbound";
  from_number?: string;
  to_number?: string;
  call_status?: string;
  disconnection_reason?: string;
  start_timestamp?: number; // ms epoch
  end_timestamp?: number; // ms epoch
  duration_ms?: number;
  recording_url?: string;
  transcript?: string;
  transcript_object?: unknown;
  call_analysis?: {
    call_summary?: string;
    user_sentiment?: string;
    call_successful?: boolean;
    in_voicemail?: boolean;
    custom_analysis_data?: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;
  retell_llm_dynamic_variables?: Record<string, unknown>;
}

// ---- Payloads Wedof -----------------------------------------------------
export interface WedofWebhookPayload {
  type?: string; // ex: registrationFolder.toComplete
  event?: string;
  data?: {
    id?: string | number;
    externalId?: string;
    state?: string;
    previousState?: string;
    email?: string;
    phoneNumber?: string;
    firstName?: string;
    lastName?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
