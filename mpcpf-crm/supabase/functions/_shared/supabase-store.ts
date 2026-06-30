// supabase-store.ts — implémentation prod du port CrmStore sur Supabase.
// Importé uniquement par les edge functions (Deno). Les tests utilisent
// PgliteCrmStore et n'instancient jamais ce module.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
} from "./crm-store.ts";
import type {
  Beneficiary,
  CallInput,
  FollowUpTask,
  TranscriptInput,
  WebhookRecord,
} from "./types.ts";
import { normalizePhone } from "./phone.ts";

const SCHEMA = "crm";

export function createServiceClient(url: string, serviceKey: string): SupabaseClient {
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export class SupabaseCrmStore implements CrmStore {
  constructor(private readonly sb: SupabaseClient) {}

  private db() {
    return this.sb.schema(SCHEMA);
  }

  async recordWebhook(e: WebhookEventInput): Promise<WebhookRecord> {
    const { data, error } = await this.db()
      .from("webhook_events")
      .insert({
        provider: e.provider,
        event_type: e.event_type,
        external_id: e.external_id,
        signature_valid: e.signature_valid,
        payload: e.payload,
      })
      .select("id")
      .single();

    if (!error && data) return { alreadyProcessed: false, id: data.id };

    // Conflit d'unicité -> évènement déjà reçu.
    if (error?.code === "23505") {
      const existing = await this.db()
        .from("webhook_events")
        .select("id, processed")
        .eq("provider", e.provider)
        .eq("event_type", e.event_type)
        .eq("external_id", e.external_id)
        .single();
      return {
        alreadyProcessed: existing.data?.processed ?? true,
        id: existing.data?.id,
      };
    }
    throw error;
  }

  async markWebhookProcessed(id: string, ok: boolean, error?: string | null): Promise<void> {
    await this.db()
      .from("webhook_events")
      .update({ processed: ok, error: error ?? null, processed_at: new Date().toISOString() })
      .eq("id", id);
  }

  async findOrCreateBeneficiaryByPhone(
    phone: string | null,
    seed: Partial<Beneficiary> = {},
  ): Promise<Beneficiary | null> {
    const e164 = normalizePhone(phone);
    if (e164) {
      const found = await this.db()
        .from("beneficiaries")
        .select("*")
        .eq("phone_e164", e164)
        .limit(1)
        .maybeSingle();
      if (found.data) return found.data as Beneficiary;
    }
    const insert = await this.db()
      .from("beneficiaries")
      .insert({ ...seed, phone: phone ?? seed.phone ?? null, source: "retell" })
      .select("*")
      .single();
    if (insert.error) throw insert.error;
    return insert.data as Beneficiary;
  }

  async findBeneficiaryByWedofFolder(folderId: string): Promise<Beneficiary | null> {
    const { data } = await this.db()
      .from("beneficiaries")
      .select("*")
      .eq("wedof_folder_id", folderId)
      .limit(1)
      .maybeSingle();
    return (data as Beneficiary) ?? null;
  }

  async findOrCreateBeneficiaryByEmail(
    email: string,
    seed: Partial<Beneficiary> = {},
  ): Promise<Beneficiary> {
    const found = await this.db()
      .from("beneficiaries")
      .select("*")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    if (found.data) return found.data as Beneficiary;

    const insert = await this.db()
      .from("beneficiaries")
      .insert({ ...seed, email, source: "wedof" })
      .select("*")
      .single();
    if (insert.error) throw insert.error;
    return insert.data as Beneficiary;
  }

  async upsertCall(call: CallInput): Promise<{ id: string; beneficiary_id: string | null }> {
    // On ne réécrit pas beneficiary_id avec null si l'appel est déjà rattaché.
    const payload: Record<string, unknown> = { ...call };
    if (call.beneficiary_id == null) delete payload.beneficiary_id;
    const { data, error } = await this.db()
      .from("calls")
      .upsert(payload, { onConflict: "retell_call_id" })
      .select("id, beneficiary_id")
      .single();
    if (error) throw error;
    return data as { id: string; beneficiary_id: string | null };
  }

  async upsertTranscript(callId: string, t: TranscriptInput): Promise<void> {
    const { error } = await this.db()
      .from("transcripts")
      .upsert(
        {
          call_id: callId,
          full_text: t.full_text,
          utterances: t.utterances,
          word_count: t.word_count,
          language: t.language ?? "fr",
        },
        { onConflict: "call_id" },
      );
    if (error) throw error;
  }

  async attachRecording(callId: string, ref: RecordingRef): Promise<void> {
    const { error } = await this.db()
      .from("calls")
      .update({
        recording_bucket: ref.bucket,
        recording_path: ref.path,
        recording_bytes: ref.bytes,
      })
      .eq("id", callId);
    if (error) throw error;
  }

  async insertWedofEvent(e: WedofEventInput): Promise<void> {
    const { error } = await this.db().from("wedof_events").insert(e);
    if (error) throw error;
  }

  async updateBeneficiaryWedof(
    beneficiaryId: string,
    fields: { wedof_state?: string | null; wedof_folder_id?: string | null },
  ): Promise<void> {
    const { error } = await this.db()
      .from("beneficiaries")
      .update(fields)
      .eq("id", beneficiaryId);
    if (error) throw error;
  }

  async setStage(
    beneficiaryId: string,
    toStage: string,
    actor: string,
    reason?: string | null,
  ): Promise<boolean> {
    const { data, error } = await this.db().rpc("set_stage", {
      p_beneficiary: beneficiaryId,
      p_to_stage: toStage,
      p_actor: actor,
      p_reason: reason ?? null,
    });
    if (error) throw error;
    return data === true;
  }

  async scheduleFollowUp(
    beneficiaryId: string,
    ruleCode: string,
    payload: Record<string, unknown> = {},
  ): Promise<string | null> {
    const { data, error } = await this.db().rpc("schedule_follow_up", {
      p_beneficiary: beneficiaryId,
      p_rule_code: ruleCode,
      p_payload: payload,
    });
    if (error) throw error;
    return (data as string) ?? null;
  }

  async dueFollowUps(limit: number): Promise<FollowUpTask[]> {
    const { data, error } = await this.db().rpc("due_follow_ups", { p_limit: limit });
    if (error) throw error;
    return (data as FollowUpTask[]) ?? [];
  }

  async detectStaleAndSchedule(): Promise<number> {
    const { data, error } = await this.db().rpc("detect_stale_and_schedule");
    if (error) throw error;
    return (data as number) ?? 0;
  }

  async completeFollowUp(
    taskId: string,
    status: "done" | "failed",
    result?: string | null,
    error?: string | null,
  ): Promise<void> {
    const { error: rpcErr } = await this.db().rpc("complete_follow_up", {
      p_task_id: taskId,
      p_status: status,
      p_result: result ?? null,
      p_error: error ?? null,
    });
    if (rpcErr) throw rpcErr;
  }

  async insertEmail(e: EmailInput): Promise<string> {
    const { data, error } = await this.db()
      .from("emails")
      .insert({ ...e, sent_at: e.status === "sent" ? new Date().toISOString() : null })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  async updateProfile(beneficiaryId: string, fields: ProfileFields): Promise<void> {
    // On n'écrase pas avec des valeurs nulles : on ne pousse que les champs fournis.
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v !== null && v !== undefined) patch[k] = v;
    }
    if (Object.keys(patch).length === 0) return;
    const { error } = await this.db().from("beneficiaries").update(patch).eq("id", beneficiaryId);
    if (error) throw error;
  }

  async getBeneficiaryContact(
    beneficiaryId: string,
  ): Promise<{ email: string | null; phone: string | null } | null> {
    const { data, error } = await this.db()
      .from("beneficiaries")
      .select("email, phone, phone_e164")
      .eq("id", beneficiaryId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { email: data.email ?? null, phone: data.phone_e164 ?? data.phone ?? null };
  }

  async insertIntake(e: IntakeInput): Promise<string> {
    const { data, error } = await this.db()
      .from("intake_submissions")
      .insert({
        beneficiary_id: e.beneficiary_id,
        form_type: e.form_type,
        source: e.source ?? "portail",
        payload: e.payload ?? {},
        completed: e.completed ?? true,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  async recordDocument(
    beneficiaryId: string,
    docType: string,
    ref: RecordingRef | null,
  ): Promise<string> {
    const { data, error } = await this.db().rpc("record_document", {
      p_benef: beneficiaryId,
      p_doc_type: docType,
      p_bucket: ref?.bucket ?? null,
      p_path: ref?.path ?? null,
      p_bytes: ref?.bytes ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  async validateDocument(documentId: string): Promise<void> {
    const { error } = await this.db().rpc("validate_document", { p_doc: documentId });
    if (error) throw error;
  }

  async advanceJourney(beneficiaryId: string, actor = "parcours"): Promise<string | null> {
    const { data, error } = await this.db().rpc("advance_journey", {
      p_benef: beneficiaryId,
      p_actor: actor,
    });
    if (error) throw error;
    return (data as string) ?? null;
  }

  async nextStep(beneficiaryId: string): Promise<string | null> {
    const { data, error } = await this.db().rpc("beneficiary_next_step", { p_benef: beneficiaryId });
    if (error) throw error;
    return (data as string) ?? null;
  }

  async createQuote(q: QuoteInput): Promise<string> {
    const { data, error } = await this.db()
      .from("quotes")
      .insert({
        beneficiary_id: q.beneficiary_id,
        financeur: q.financeur,
        formation_label: q.formation_label ?? null,
        amount_cents: q.amount_cents ?? null,
        external_ref: q.external_ref ?? null,
        valid_until: q.valid_until ?? null,
        metadata: q.metadata ?? {},
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  async transmitQuote(quoteId: string): Promise<boolean> {
    const { data, error } = await this.db().rpc("transmit_quote", { p_quote: quoteId });
    if (error) throw error;
    return data === true;
  }

  async setQuoteStatus(quoteId: string, status: string): Promise<void> {
    const decided = ["accepted", "refused", "expired"].includes(status);
    const { error } = await this.db()
      .from("quotes")
      .update({ status, decided_at: decided ? new Date().toISOString() : undefined })
      .eq("id", quoteId);
    if (error) throw error;
  }

  async latestAcceptedQuote(beneficiaryId: string): Promise<AcceptedQuote | null> {
    const { data, error } = await this.db()
      .from("quotes")
      .select("id, financeur, amount_cents, formation_label")
      .eq("beneficiary_id", beneficiaryId)
      .eq("status", "accepted")
      .order("decided_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as AcceptedQuote) ?? null;
  }

  async upsertAutoEcole(ae: AutoEcoleInput): Promise<string> {
    const row = {
      id: ae.id,
      nom: ae.nom ?? null,
      raison_sociale: ae.raison_sociale ?? null,
      siret: ae.siret ?? null,
      codes_actions: ae.codes_actions ?? [],
      ville: ae.ville ?? null,
      code_postal: ae.code_postal ?? null,
      email: ae.email ?? null,
      contact_email: ae.contact_email ?? null,
      telephone: ae.telephone ?? null,
      active: ae.active ?? true,
      statut: ae.statut ?? null,
      tarif_horaire: ae.tarif_horaire ?? null,
      user_id: ae.user_id ?? null,
      sites_formation: ae.sites_formation ?? [],
      metadata: ae.metadata ?? {},
    };
    const { data, error } = await this.db()
      .from("auto_ecoles").upsert(row, { onConflict: "id" }).select("id").single();
    if (error) throw error;
    return data.id;
  }

  async setDossierFormation(beneficiaryId: string, info: DossierFormation): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (info.codesPossibles !== undefined) patch.wedof_codes_possibles = info.codesPossibles;
    if (info.siretFormation !== undefined) patch.siret_formation = info.siretFormation;
    if (info.villeFormation !== undefined) patch.ville_formation = info.villeFormation;
    if (Object.keys(patch).length === 0) return;
    const { error } = await this.db().from("beneficiaries").update(patch).eq("id", beneficiaryId);
    if (error) throw error;
  }

  async matchAutoEcole(beneficiaryId: string): Promise<AutoEcoleMatch> {
    const { data, error } = await this.db().rpc("match_auto_ecole", { p_benef: beneficiaryId });
    if (error) throw error;
    const { data: b } = await this.db()
      .from("beneficiaries").select("ae_match_method").eq("id", beneficiaryId).single();
    return { aeId: (data as string) ?? null, method: (b?.ae_match_method as string) ?? "none" };
  }

  async createInvoice(input: InvoiceInput): Promise<string> {
    const { data, error } = await this.db().rpc("create_invoice", {
      p_benef: input.beneficiary_id,
      p_financeur: input.financeur,
      p_amount_cents: input.amount_cents ?? null,
      p_formation_label: input.formation_label ?? null,
      p_quote_id: input.quote_id ?? null,
      p_external_ref: input.external_ref ?? null,
      p_channel: input.channel ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  async setInvoiceStatus(
    invoiceId: string,
    status: string,
    externalRef?: string | null,
  ): Promise<boolean> {
    const { data, error } = await this.db().rpc("set_invoice_status", {
      p_invoice: invoiceId,
      p_status: status,
      p_external_ref: externalRef ?? null,
    });
    if (error) throw error;
    return data === true;
  }

  async detectOverdueInvoices(): Promise<number> {
    const { data, error } = await this.db().rpc("detect_overdue_invoices_and_schedule");
    if (error) throw error;
    return (data as number) ?? 0;
  }

  async logNotification(n: NotificationLog): Promise<string> {
    const sent = n.status === "sent" || n.status === "delivered";
    const { data, error } = await this.db()
      .from("notifications")
      .insert({ ...n, sent_at: sent ? new Date().toISOString() : null })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }
}

/** Implémentation StoragePort sur Supabase Storage. */
export class SupabaseStorage implements StoragePort {
  constructor(private readonly sb: SupabaseClient) {}

  async upload(
    bucket: string,
    path: string,
    data: Uint8Array,
    contentType: string,
  ): Promise<RecordingRef> {
    const { error } = await this.sb.storage
      .from(bucket)
      .upload(path, data, { contentType, upsert: true });
    if (error) throw error;
    return { bucket, path, bytes: data.byteLength };
  }
}
