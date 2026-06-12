// pglite-store.ts — implémentation du port CrmStore sur PGlite pour les tests.
// Exécute le VRAI SQL des migrations (set_stage, schedule_follow_up, vues...)
// afin de tester les handlers de bout en bout sans Supabase ni réseau.

import type { PGlite } from "@electric-sql/pglite";
import type {
  CrmStore,
  EmailInput,
  RecordingRef,
  StoragePort,
  WebhookEventInput,
  WedofEventInput,
} from "../../supabase/functions/_shared/crm-store.ts";
import type {
  Beneficiary,
  CallInput,
  FollowUpTask,
  TranscriptInput,
  WebhookRecord,
} from "../../supabase/functions/_shared/types.ts";

const j = (v: unknown) => JSON.stringify(v ?? null);

export class PgliteCrmStore implements CrmStore {
  constructor(private readonly db: PGlite) {}

  private async one<T = any>(sql: string, params: unknown[] = []): Promise<T | null> {
    const r = await this.db.query<T>(sql, params as any[]);
    return r.rows[0] ?? null;
  }

  async recordWebhook(e: WebhookEventInput): Promise<WebhookRecord> {
    const ins = await this.db.query<{ id: string }>(
      `insert into crm.webhook_events (provider, event_type, external_id, signature_valid, payload)
       values ($1,$2,$3,$4,$5::jsonb)
       on conflict (provider, event_type, external_id) do nothing
       returning id`,
      [e.provider, e.event_type, e.external_id, e.signature_valid, j(e.payload)],
    );
    if (ins.rows.length) return { alreadyProcessed: false, id: ins.rows[0].id };

    const ex = await this.one<{ id: string; processed: boolean }>(
      `select id, processed from crm.webhook_events
        where provider=$1 and event_type=$2 and external_id=$3`,
      [e.provider, e.event_type, e.external_id],
    );
    return { alreadyProcessed: ex?.processed ?? true, id: ex!.id };
  }

  async markWebhookProcessed(id: string, ok: boolean, error?: string | null): Promise<void> {
    await this.db.query(
      `update crm.webhook_events set processed=$2, error=$3, processed_at=now() where id=$1`,
      [id, ok, error ?? null],
    );
  }

  async findOrCreateBeneficiaryByPhone(
    phone: string | null,
    seed: Partial<Beneficiary> = {},
  ): Promise<Beneficiary | null> {
    const e = await this.one<{ e: string | null }>(`select crm.normalize_phone($1) as e`, [phone]);
    const e164 = e?.e ?? null;
    if (e164) {
      const found = await this.one<Beneficiary>(
        `select * from crm.beneficiaries where phone_e164=$1 limit 1`,
        [e164],
      );
      if (found) return found;
    }
    return this.one<Beneficiary>(
      `insert into crm.beneficiaries (phone, first_name, last_name, email, wedof_folder_id, source)
       values ($1,$2,$3,$4,$5,coalesce($6,'retell')) returning *`,
      [
        phone ?? seed.phone ?? null,
        seed.first_name ?? null,
        seed.last_name ?? null,
        seed.email ?? null,
        seed.wedof_folder_id ?? null,
        (seed as any).source ?? null,
      ],
    );
  }

  async findBeneficiaryByWedofFolder(folderId: string): Promise<Beneficiary | null> {
    return this.one<Beneficiary>(
      `select * from crm.beneficiaries where wedof_folder_id=$1 limit 1`,
      [folderId],
    );
  }

  async findOrCreateBeneficiaryByEmail(
    email: string,
    seed: Partial<Beneficiary> = {},
  ): Promise<Beneficiary> {
    const found = await this.one<Beneficiary>(
      `select * from crm.beneficiaries where lower(email)=lower($1) limit 1`,
      [email],
    );
    if (found) return found;
    return (await this.one<Beneficiary>(
      `insert into crm.beneficiaries (email, first_name, last_name, phone, wedof_folder_id, source)
       values ($1,$2,$3,$4,$5,'wedof') returning *`,
      [
        email,
        seed.first_name ?? null,
        seed.last_name ?? null,
        seed.phone ?? null,
        seed.wedof_folder_id ?? null,
      ],
    ))!;
  }

  async upsertCall(call: CallInput): Promise<{ id: string; beneficiary_id: string | null }> {
    return (await this.one<{ id: string; beneficiary_id: string | null }>(
      `insert into crm.calls (
         retell_call_id, beneficiary_id, agent_id, direction, from_number, to_number,
         call_status, disconnection_reason, started_at, ended_at, duration_ms,
         recording_source_url, call_successful, sentiment, summary, outcome, metadata)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10::timestamptz,$11,$12,$13,$14,$15,$16,$17::jsonb)
       on conflict (retell_call_id) do update set
         beneficiary_id      = coalesce(excluded.beneficiary_id, crm.calls.beneficiary_id),
         agent_id            = coalesce(excluded.agent_id, crm.calls.agent_id),
         direction           = coalesce(excluded.direction, crm.calls.direction),
         from_number         = coalesce(excluded.from_number, crm.calls.from_number),
         to_number           = coalesce(excluded.to_number, crm.calls.to_number),
         call_status         = coalesce(excluded.call_status, crm.calls.call_status),
         disconnection_reason= coalesce(excluded.disconnection_reason, crm.calls.disconnection_reason),
         started_at          = coalesce(excluded.started_at, crm.calls.started_at),
         ended_at            = coalesce(excluded.ended_at, crm.calls.ended_at),
         duration_ms         = coalesce(excluded.duration_ms, crm.calls.duration_ms),
         recording_source_url= coalesce(excluded.recording_source_url, crm.calls.recording_source_url),
         call_successful     = coalesce(excluded.call_successful, crm.calls.call_successful),
         sentiment           = coalesce(excluded.sentiment, crm.calls.sentiment),
         summary             = coalesce(excluded.summary, crm.calls.summary),
         outcome             = coalesce(excluded.outcome, crm.calls.outcome)
       returning id, beneficiary_id`,
      [
        call.retell_call_id, call.beneficiary_id ?? null, call.agent_id ?? null,
        call.direction ?? null, call.from_number ?? null, call.to_number ?? null,
        call.call_status ?? null, call.disconnection_reason ?? null,
        call.started_at ?? null, call.ended_at ?? null, call.duration_ms ?? null,
        call.recording_source_url ?? null, call.call_successful ?? null,
        call.sentiment ?? null, call.summary ?? null, call.outcome ?? null,
        j(call.metadata ?? {}),
      ],
    ))!;
  }

  async upsertTranscript(callId: string, t: TranscriptInput): Promise<void> {
    await this.db.query(
      `insert into crm.transcripts (call_id, full_text, utterances, word_count, language)
       values ($1,$2,$3::jsonb,$4,$5)
       on conflict (call_id) do update set
         full_text=excluded.full_text, utterances=excluded.utterances,
         word_count=excluded.word_count, language=excluded.language`,
      [callId, t.full_text ?? null, j(t.utterances ?? null), t.word_count ?? null, t.language ?? "fr"],
    );
  }

  async attachRecording(callId: string, ref: RecordingRef): Promise<void> {
    await this.db.query(
      `update crm.calls set recording_bucket=$2, recording_path=$3, recording_bytes=$4 where id=$1`,
      [callId, ref.bucket, ref.path, ref.bytes],
    );
  }

  async insertWedofEvent(e: WedofEventInput): Promise<void> {
    await this.db.query(
      `insert into crm.wedof_events
         (beneficiary_id, wedof_folder_id, event_type, state, previous_state, raw)
       values ($1,$2,$3,$4,$5,$6::jsonb)`,
      [e.beneficiary_id, e.wedof_folder_id, e.event_type, e.state, e.previous_state, j(e.raw)],
    );
  }

  async updateBeneficiaryWedof(
    beneficiaryId: string,
    fields: { wedof_state?: string | null; wedof_folder_id?: string | null },
  ): Promise<void> {
    await this.db.query(
      `update crm.beneficiaries
          set wedof_state=$2,
              wedof_folder_id=coalesce($3, wedof_folder_id)
        where id=$1`,
      [beneficiaryId, fields.wedof_state ?? null, fields.wedof_folder_id ?? null],
    );
  }

  async setStage(
    beneficiaryId: string,
    toStage: string,
    actor: string,
    reason?: string | null,
  ): Promise<boolean> {
    const r = await this.one<{ ok: boolean }>(
      `select crm.set_stage($1,$2,$3,$4) as ok`,
      [beneficiaryId, toStage, actor, reason ?? null],
    );
    return r?.ok === true;
  }

  async scheduleFollowUp(
    beneficiaryId: string,
    ruleCode: string,
    payload: Record<string, unknown> = {},
  ): Promise<string | null> {
    const r = await this.one<{ id: string | null }>(
      `select crm.schedule_follow_up($1,$2,$3::jsonb) as id`,
      [beneficiaryId, ruleCode, j(payload)],
    );
    return r?.id ?? null;
  }

  async dueFollowUps(limit: number): Promise<FollowUpTask[]> {
    const r = await this.db.query<FollowUpTask>(`select * from crm.due_follow_ups($1)`, [limit]);
    return r.rows;
  }

  async detectStaleAndSchedule(): Promise<number> {
    const r = await this.one<{ n: number }>(`select crm.detect_stale_and_schedule() as n`);
    return Number(r?.n ?? 0);
  }

  async completeFollowUp(
    taskId: string,
    status: "done" | "failed",
    result?: string | null,
    error?: string | null,
  ): Promise<void> {
    await this.db.query(`select crm.complete_follow_up($1,$2,$3,$4)`, [
      taskId, status, result ?? null, error ?? null,
    ]);
  }

  async insertEmail(e: EmailInput): Promise<string> {
    const r = await this.one<{ id: string }>(
      `insert into crm.emails
         (beneficiary_id, direction, subject, body, from_addr, to_addr, status, provider, template_code, sent_at, metadata)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb) returning id`,
      [
        e.beneficiary_id, e.direction ?? "outbound", e.subject ?? null, e.body ?? null,
        e.from_addr ?? null, e.to_addr ?? null, e.status ?? "queued", e.provider ?? null,
        e.template_code ?? null, e.status === "sent" ? new Date().toISOString() : null,
        j(e.metadata ?? {}),
      ],
    );
    return r!.id;
  }
}

/** StoragePort en mémoire pour les tests. */
export class MemoryStorage implements StoragePort {
  public objects = new Map<string, { contentType: string; bytes: number; data: Uint8Array }>();

  upload(
    bucket: string,
    path: string,
    data: Uint8Array,
    contentType: string,
  ): Promise<RecordingRef> {
    this.objects.set(`${bucket}/${path}`, { contentType, bytes: data.byteLength, data });
    return Promise.resolve({ bucket, path, bytes: data.byteLength });
  }
}
