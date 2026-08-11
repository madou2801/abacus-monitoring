// mpcpf-notifier.test.ts — adaptateur PROD : email via webhook n8n, SMS ClickSend.

import { test } from "node:test";
import assert from "node:assert/strict";
import { MpcpfNotifier } from "../../supabase/functions/_shared/notifier.ts";
import type { FetchLike } from "../../supabase/functions/_shared/recording.ts";

function stub(captured: { url: string; init: any }[], payload: unknown = {}): FetchLike {
  return (url, init) => {
    captured.push({ url, init });
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      arrayBuffer: () =>
        Promise.resolve(new TextEncoder().encode(JSON.stringify(payload)).buffer),
    });
  };
}

function notifier(fetchFn: FetchLike): MpcpfNotifier {
  return new MpcpfNotifier({
    fetchFn,
    emailWebhookUrl: "https://n8n.monpermiscpf.com/webhook/email",
    clickSendUser: "user@mpcpf",
    clickSendKey: "ck-key",
    smsSender: "MonPermis",
  });
}

test("email part sur le webhook n8n et remonte l'id", async () => {
  const seen: { url: string; init: any }[] = [];
  const r = await notifier(stub(seen, { message_id: "n8n-9" })).send({
    channel: "email", to: "a@b.com", subject: "Devis", body: "corps",
  });
  assert.equal(r.status, "sent");
  assert.equal(r.provider, "n8n-gmail");
  assert.equal(r.providerMessageId, "n8n-9");
  assert.equal(seen[0].url, "https://n8n.monpermiscpf.com/webhook/email");
  assert.equal(JSON.parse(seen[0].init.body).to, "a@b.com");
});

test("SMS part sur ClickSend avec Basic auth + expéditeur MonPermis", async () => {
  const seen: { url: string; init: any }[] = [];
  const r = await notifier(stub(seen, { data: { messages: [{ message_id: "cs-7" }] } })).send({
    channel: "sms", to: "+33 6 12 34 56 78", body: "code 1234",
  });
  assert.equal(r.status, "sent");
  assert.equal(r.provider, "clicksend");
  assert.equal(r.providerMessageId, "cs-7");
  assert.ok(seen[0].url.includes("rest.clicksend.com/v3/sms/send"));
  assert.ok(String(seen[0].init.headers.authorization).startsWith("Basic "));
  const body = JSON.parse(seen[0].init.body);
  assert.equal(body.messages[0].from, "MonPermis");
  assert.equal(body.messages[0].to, "+33612345678"); // espaces retirés
});

test("HTTP non-ok -> failed sans jeter", async () => {
  const fetchFn: FetchLike = () =>
    Promise.resolve({
      ok: false, status: 500,
      headers: { get: () => "application/json" },
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode("{}").buffer),
    });
  const r = await notifier(fetchFn).send({ channel: "email", to: "a@b.com", body: "x" });
  assert.equal(r.status, "failed");
  assert.equal(r.error, "HTTP 500");
});
