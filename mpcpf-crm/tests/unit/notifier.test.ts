// notifier.test.ts — port Notifier + adaptateurs + helper notify.

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMigrations } from "../helpers/migrate.ts";
import { PgliteCrmStore } from "../helpers/pglite-store.ts";
import {
  BrevoNotifier,
  notify,
  QueueNotifier,
} from "../../supabase/functions/_shared/notifier.ts";
import type { FetchLike } from "../../supabase/functions/_shared/recording.ts";

test("QueueNotifier met en file sans envoi externe", async () => {
  const r = await new QueueNotifier().send({ channel: "sms", to: "+33612345678", body: "hello" });
  assert.equal(r.status, "queued");
  assert.equal(r.provider, "queue");
});

test("BrevoNotifier envoie un email et remonte le messageId", async () => {
  const seen: { url: string; body: string }[] = [];
  const fetchFn: FetchLike = (url, init) => {
    seen.push({ url, body: init?.body ?? "" });
    return Promise.resolve({
      ok: true,
      status: 201,
      headers: { get: () => "application/json" },
      arrayBuffer: () =>
        Promise.resolve(new TextEncoder().encode(JSON.stringify({ messageId: "msg-123" })).buffer),
    });
  };
  const brevo = new BrevoNotifier({
    apiKey: "key",
    fetchFn,
    emailSender: { name: "MPCPF", email: "c@monpermiscpf.com" },
    smsSender: "MonPermis",
  });
  const r = await brevo.send({ channel: "email", to: "a@b.com", subject: "Hi", body: "corps" });
  assert.equal(r.status, "sent");
  assert.equal(r.providerMessageId, "msg-123");
  assert.ok(seen[0].url.includes("/v3/smtp/email"));
});

test("BrevoNotifier route les SMS sur l'endpoint transactionalSMS", async () => {
  let calledUrl = "";
  const fetchFn: FetchLike = (url) => {
    calledUrl = url;
    return Promise.resolve({
      ok: true, status: 201,
      headers: { get: () => "application/json" },
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode("{}").buffer),
    });
  };
  const brevo = new BrevoNotifier({
    apiKey: "key", fetchFn,
    emailSender: { name: "MPCPF", email: "c@monpermiscpf.com" }, smsSender: "MonPermis",
  });
  const r = await brevo.send({ channel: "sms", to: "+33612345678", body: "code 1234" });
  assert.equal(r.status, "sent");
  assert.ok(calledUrl.includes("/v3/transactionalSMS/sms"));
});

test("notify journalise même en cas d'échec d'envoi", async () => {
  const db = await applyMigrations();
  const store = new PgliteCrmStore(db);
  const b = await store.findOrCreateBeneficiaryByEmail("z@example.com", {});

  const failing = { send: () => Promise.reject(new Error("API down")) };
  const { result } = await notify(store, failing, b.id, {
    channel: "email", to: "z@example.com", body: "test",
  });
  assert.equal(result.status, "failed");

  const n = await db.query(`select status, error from crm.notifications where beneficiary_id=$1`, [b.id]);
  assert.equal((n.rows[0] as any).status, "failed");
  assert.equal((n.rows[0] as any).error, "API down");
});
