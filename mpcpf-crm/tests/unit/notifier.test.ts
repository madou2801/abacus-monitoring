// notifier.test.ts — port Notifier + adaptateurs + helper notify.

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMigrations } from "../helpers/migrate.ts";
import { PgliteCrmStore } from "../helpers/pglite-store.ts";
import {
  MpcpfNotifier,
  notify,
  QueueNotifier,
} from "../../supabase/functions/_shared/notifier.ts";
import type { FetchLike } from "../../supabase/functions/_shared/recording.ts";

test("QueueNotifier met en file sans envoi externe", async () => {
  const r = await new QueueNotifier().send({ channel: "sms", to: "+33612345678", body: "hello" });
  assert.equal(r.status, "queued");
  assert.equal(r.provider, "queue");
});

test("MpcpfNotifier envoie l'email au webhook n8n (Gmail) et remonte l'id", async () => {
  const seen: { url: string; body: string }[] = [];
  const fetchFn: FetchLike = (url, init) => {
    seen.push({ url, body: (init?.body as string) ?? "" });
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      arrayBuffer: () =>
        Promise.resolve(new TextEncoder().encode(JSON.stringify({ id: "gm-123" })).buffer),
    });
  };
  const notifier = new MpcpfNotifier({
    fetchFn,
    emailWebhookUrl: "https://n8n.example.com/webhook/email",
    clickSendUser: "user",
    clickSendKey: "key",
  });
  const r = await notifier.send({ channel: "email", to: "a@b.com", subject: "Hi", body: "corps" });
  assert.equal(r.status, "sent");
  assert.equal(r.provider, "n8n-gmail");
  assert.equal(r.providerMessageId, "gm-123");
  assert.equal(seen[0].url, "https://n8n.example.com/webhook/email");
  assert.match(seen[0].body, /"to":"a@b\.com"/);
});

test("MpcpfNotifier route les SMS sur ClickSend avec l'expéditeur MonPermis", async () => {
  let calledUrl = "";
  let sentBody = "";
  const fetchFn: FetchLike = (url, init) => {
    calledUrl = url;
    sentBody = (init?.body as string) ?? "";
    return Promise.resolve({
      ok: true, status: 200,
      headers: { get: () => "application/json" },
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode(
        JSON.stringify({ data: { messages: [{ message_id: "cs-42" }] } })).buffer),
    });
  };
  const notifier = new MpcpfNotifier({
    fetchFn,
    emailWebhookUrl: "https://n8n.example.com/webhook/email",
    clickSendUser: "user",
    clickSendKey: "key",
  });
  const r = await notifier.send({ channel: "sms", to: "+33612345678", body: "code 1234" });
  assert.equal(r.status, "sent");
  assert.equal(r.provider, "clicksend");
  assert.equal(r.providerMessageId, "cs-42");
  assert.ok(calledUrl.includes("rest.clicksend.com/v3/sms/send"));
  assert.match(sentBody, /"from":"MonPermis"/);
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
