// pglite-store.ts — implémentation du port CrmStore sur PGlite pour les tests.
// Exécute le VRAI SQL des migrations (set_stage, schedule_follow_up, vues...)
// afin de tester les handlers de bout en bout sans Supabase ni réseau.

import type { PGlite } from "@electric-sql/pglite";
import type {
  AcceptedQuote,
  AutoEcoleInput,
  AutoEcoleMatch,
  CrmStore,
  DossierFormation,
  EmailInput,
  IntakeInput,
  InvoiceInput,
  NotificationLog,
  ProfileFields,
  QuoteInput,
  RecordingRef,
  StoragePort,
  WebhookEventInput,
  WedofEventInput,
} from "../../supabase/functions/_shared/crm-store.ts";

// Littéral de tableau Postgres (text[]) — fiable pour le binding PGlite.
function pgTextArray(a: string[] | undefined): string {
  return "{" + (a || []).map((x) => '"' + String(x).replace(/(["\\])/g, "\\$1") + '"').join(",") + "}";
}
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

  async updateProfile(beneficiaryId: string, fields: ProfileFields): Promise<void> {
    await this.db.query(
      `update crm.beneficiaries set
         first_name        = coalesce($2, first_name),
         last_name         = coalesce($3, last_name),
         email             = coalesce($4, email),
         financeur         = coalesce($5, financeur),
         is_france_travail = coalesce($6, is_france_travail),
         source            = coalesce($7, source)
       where id=$1`,
      [
        beneficiaryId, fields.first_name ?? null, fields.last_name ?? null,
        fields.email ?? null, fields.financeur ?? null,
        fields.is_france_travail ?? null, fields.source ?? null,
      ],
    );
  }

  async getBeneficiaryContact(
    beneficiaryId: string,
  ): Promise<{ email: string | null; phone: string | null } | null> {
    return this.one<{ email: string | null; phone: string | null }>(
      `select email, coalesce(phone_e164, phone) as phone from crm.beneficiaries where id=$1`,
      [beneficiaryId],
    );
  }

  async insertIntake(e: IntakeInput): Promise<string> {
    const r = await this.one<{ id: string }>(
      `insert into crm.intake_submissions (beneficiary_id, form_type, source, payload, completed)
       values ($1,$2,$3,$4::jsonb,$5) returning id`,
      [e.beneficiary_id, e.form_type, e.source ?? "portail", j(e.payload ?? {}), e.completed ?? true],
    );
    return r!.id;
  }

  async recordDocument(
    beneficiaryId: string,
    docType: string,
    ref: RecordingRef | null,
  ): Promise<string> {
    const r = await this.one<{ id: string }>(
      `select crm.record_document($1,$2,$3,$4,$5) as id`,
      [beneficiaryId, docType, ref?.bucket ?? null, ref?.path ?? null, ref?.bytes ?? null],
    );
    return r!.id;
  }

  async validateDocument(documentId: string): Promise<void> {
    await this.db.query(`select crm.validate_document($1)`, [documentId]);
  }

  async advanceJourney(beneficiaryId: string, actor = "parcours"): Promise<string | null> {
    const r = await this.one<{ s: string | null }>(`select crm.advance_journey($1,$2) as s`, [
      beneficiaryId, actor,
    ]);
    return r?.s ?? null;
  }

  async nextStep(beneficiaryId: string): Promise<string | null> {
    const r = await this.one<{ s: string | null }>(`select crm.beneficiary_next_step($1) as s`, [
      beneficiaryId,
    ]);
    return r?.s ?? null;
  }

  async createQuote(q: QuoteInput): Promise<string> {
    const r = await this.one<{ id: string }>(
      `insert into crm.quotes (beneficiary_id, financeur, formation_label, amount_cents, external_ref, valid_until, metadata)
       values ($1,$2,$3,$4,$5,$6::date,$7::jsonb) returning id`,
      [
        q.beneficiary_id, q.financeur, q.formation_label ?? null, q.amount_cents ?? null,
        q.external_ref ?? null, q.valid_until ?? null, j(q.metadata ?? {}),
      ],
    );
    return r!.id;
  }

  async transmitQuote(quoteId: string): Promise<boolean> {
    const r = await this.one<{ ok: boolean }>(`select crm.transmit_quote($1) as ok`, [quoteId]);
    return r?.ok === true;
  }

  async setQuoteStatus(quoteId: string, status: string, beneficiaryId?: string): Promise<void> {
    const r = await this.one<{ id: string }>(
      `update crm.quotes set status=$2, decided_at = case when $2 in ('accepted','refused','expired') then now() else decided_at end
         where id=$1 and ($3::uuid is null or beneficiary_id=$3) returning id`,
      [quoteId, status, beneficiaryId ?? null],
    );
    if (beneficiaryId && !r) throw new Error("devis introuvable pour ce bénéficiaire");
  }

  async latestAcceptedQuote(beneficiaryId: string): Promise<AcceptedQuote | null> {
    return this.one<AcceptedQuote>(
      `select id, financeur, amount_cents, formation_label
         from crm.quotes
        where beneficiary_id=$1 and status='accepted'
        order by decided_at desc nulls last
        limit 1`,
      [beneficiaryId],
    );
  }

  async upsertAutoEcole(ae: AutoEcoleInput): Promise<string> {
    const r = await this.one<{ id: string }>(
      `insert into crm.auto_ecoles
         (id,nom,raison_sociale,siret,codes_actions,ville,code_postal,email,contact_email,
          telephone,active,statut,tarif_horaire,user_id,is_siege,sites_formation,metadata)
       values ($1,$2,$3,$4,$5::text[],$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb)
       on conflict (id) do update set
         nom=excluded.nom, raison_sociale=excluded.raison_sociale, siret=excluded.siret,
         codes_actions=excluded.codes_actions, ville=excluded.ville, code_postal=excluded.code_postal,
         email=excluded.email, contact_email=excluded.contact_email, telephone=excluded.telephone,
         active=excluded.active, statut=excluded.statut, tarif_horaire=excluded.tarif_horaire,
         user_id=excluded.user_id, is_siege=excluded.is_siege,
         sites_formation=excluded.sites_formation, metadata=excluded.metadata
       returning id`,
      [
        ae.id, ae.nom ?? null, ae.raison_sociale ?? null, ae.siret ?? null,
        pgTextArray(ae.codes_actions), ae.ville ?? null, ae.code_postal ?? null,
        ae.email ?? null, ae.contact_email ?? null, ae.telephone ?? null,
        ae.active ?? true, ae.statut ?? null, ae.tarif_horaire ?? null,
        ae.user_id ?? null, ae.is_siege ?? false, j(ae.sites_formation ?? []), j(ae.metadata ?? {}),
      ],
    );
    return r!.id;
  }

  async setDossierFormation(beneficiaryId: string, info: DossierFormation): Promise<void> {
    await this.db.query(
      `update crm.beneficiaries set
         wedof_codes_possibles = coalesce($2::text[], wedof_codes_possibles),
         siret_formation       = coalesce($3, siret_formation),
         ville_formation       = coalesce($4, ville_formation)
       where id=$1`,
      [
        beneficiaryId,
        info.codesPossibles !== undefined ? pgTextArray(info.codesPossibles) : null,
        info.siretFormation ?? null,
        info.villeFormation ?? null,
      ],
    );
  }

  async matchAutoEcole(beneficiaryId: string): Promise<AutoEcoleMatch> {
    const r = await this.one<{ ae: string | null }>(`select crm.match_auto_ecole($1) as ae`, [beneficiaryId]);
    const m = await this.one<{
      ae_match_method: string; ae_match_confidence: string;
      ae_match_needs_review: boolean; ae_match_candidates: number;
    }>(
      `select ae_match_method, ae_match_confidence, ae_match_needs_review, ae_match_candidates
         from crm.beneficiaries where id=$1`, [beneficiaryId],
    );
    return {
      aeId: r?.ae ?? null,
      method: m?.ae_match_method ?? "none",
      confidence: m?.ae_match_confidence ?? "none",
      needsReview: m?.ae_match_needs_review === true,
      candidates: Number(m?.ae_match_candidates ?? 0),
    };
  }

  async createInvoice(input: InvoiceInput): Promise<string> {
    const r = await this.one<{ id: string }>(
      `select crm.create_invoice($1,$2,$3,$4,$5,$6,$7) as id`,
      [
        input.beneficiary_id, input.financeur, input.amount_cents ?? null,
        input.formation_label ?? null, input.quote_id ?? null,
        input.external_ref ?? null, input.channel ?? null,
      ],
    );
    return r!.id;
  }

  async setInvoiceStatus(
    invoiceId: string,
    status: string,
    externalRef?: string | null,
    beneficiaryId?: string | null,
  ): Promise<boolean> {
    const r = await this.one<{ ok: boolean }>(
      `select crm.set_invoice_status($1,$2,$3,$4) as ok`,
      [invoiceId, status, externalRef ?? null, beneficiaryId ?? null],
    );
    return r?.ok === true;
  }

  async detectOverdueInvoices(): Promise<number> {
    const r = await this.one<{ n: number }>(
      `select crm.detect_overdue_invoices_and_schedule() as n`,
    );
    return Number(r?.n ?? 0);
  }

  async logNotification(n: NotificationLog): Promise<string> {
    const r = await this.one<{ id: string }>(
      `insert into crm.notifications
         (beneficiary_id, channel, to_addr, template_code, subject, body, status, provider, provider_message_id, error, sent_at, metadata)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb) returning id`,
      [
        n.beneficiary_id, n.channel, n.to_addr ?? null, n.template_code ?? null,
        n.subject ?? null, n.body ?? null, n.status, n.provider ?? null,
        n.provider_message_id ?? null, n.error ?? null,
        n.status === "sent" || n.status === "delivered" ? new Date().toISOString() : null,
        j(n.metadata ?? {}),
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
