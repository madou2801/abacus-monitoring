// crm-store.ts — port d'accès aux données du CRM.
// Le même contrat est implémenté par SupabaseCrmStore (prod) et par le
// PgliteCrmStore des tests : les handlers ignorent l'implémentation concrète.

import type {
  Beneficiary,
  CallInput,
  FollowUpTask,
  TranscriptInput,
  WebhookRecord,
} from "./types.ts";

export interface WebhookEventInput {
  provider: "retell" | "wedof";
  event_type: string;
  external_id: string;
  signature_valid: boolean;
  payload: unknown;
}

export interface RecordingRef {
  bucket: string;
  path: string;
  bytes: number;
}

export interface WedofEventInput {
  beneficiary_id: string | null;
  wedof_folder_id: string | null;
  event_type: string | null;
  state: string | null;
  previous_state: string | null;
  raw: unknown;
}

export interface EmailInput {
  beneficiary_id: string;
  direction?: string;
  subject?: string;
  body?: string;
  from_addr?: string;
  to_addr?: string;
  status?: string;
  provider?: string;
  template_code?: string;
  metadata?: Record<string, unknown>;
}

/** Port de stockage d'objets (enregistrements audio). */
export interface StoragePort {
  upload(
    bucket: string,
    path: string,
    data: Uint8Array,
    contentType: string,
  ): Promise<RecordingRef>;
}

/** Port d'accès aux données du CRM. */
export interface CrmStore {
  // Idempotence / audit
  recordWebhook(e: WebhookEventInput): Promise<WebhookRecord>;
  markWebhookProcessed(id: string, ok: boolean, error?: string | null): Promise<void>;

  // Rapprochement bénéficiaire
  findOrCreateBeneficiaryByPhone(
    phone: string | null,
    seed?: Partial<Beneficiary>,
  ): Promise<Beneficiary | null>;
  findBeneficiaryByWedofFolder(folderId: string): Promise<Beneficiary | null>;
  findOrCreateBeneficiaryByEmail(
    email: string,
    seed?: Partial<Beneficiary>,
  ): Promise<Beneficiary>;

  // Appels / transcripts / enregistrements
  upsertCall(call: CallInput): Promise<{ id: string; beneficiary_id: string | null }>;
  upsertTranscript(callId: string, t: TranscriptInput): Promise<void>;
  attachRecording(callId: string, ref: RecordingRef): Promise<void>;

  // Wedof
  insertWedofEvent(e: WedofEventInput): Promise<void>;
  updateBeneficiaryWedof(
    beneficiaryId: string,
    fields: { wedof_state?: string | null; wedof_folder_id?: string | null },
  ): Promise<void>;

  // Pipeline DMAIC
  setStage(
    beneficiaryId: string,
    toStage: string,
    actor: string,
    reason?: string | null,
  ): Promise<boolean>;

  // Relances
  scheduleFollowUp(
    beneficiaryId: string,
    ruleCode: string,
    payload?: Record<string, unknown>,
  ): Promise<string | null>;
  dueFollowUps(limit: number): Promise<FollowUpTask[]>;
  detectStaleAndSchedule(): Promise<number>;
  completeFollowUp(
    taskId: string,
    status: "done" | "failed",
    result?: string | null,
    error?: string | null,
  ): Promise<void>;

  // Emails
  insertEmail(e: EmailInput): Promise<string>;
}
