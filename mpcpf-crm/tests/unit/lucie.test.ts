// lucie.test.ts — extraction d'infos Lucie + capture post-appel.

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMigrations } from "../helpers/migrate.ts";
import { PgliteCrmStore } from "../helpers/pglite-store.ts";
import { captureLucieCall, extractLucieInfo } from "../../supabase/functions/_shared/lucie.ts";
import { QueueNotifier } from "../../supabase/functions/_shared/notifier.ts";
import type { RetellCall } from "../../supabase/functions/_shared/types.ts";

test("extractLucieInfo mappe le financement et France Travail", () => {
  const call: RetellCall = {
    call_id: "c1",
    call_analysis: {
      custom_analysis_data: {
        prenom: "Sophie", nom: "Martin", email: "sophie@example.com",
        financement: "France Travail", permis: "Permis B",
      },
    },
  };
  const info = extractLucieInfo(call);
  assert.equal(info.profile.first_name, "Sophie");
  assert.equal(info.profile.last_name, "Martin");
  assert.equal(info.email, "sophie@example.com");
  assert.equal(info.profile.financeur, "kairos");
  assert.equal(info.profile.is_france_travail, true);
  assert.equal(info.formation, "Permis B");
});

test("extractLucieInfo reconnaît le CPF/EDOF", () => {
  const info = extractLucieInfo({
    call_id: "c2",
    retell_llm_dynamic_variables: { financement: "CPF" },
  });
  assert.equal(info.profile.financeur, "edof");
  assert.equal(info.profile.is_france_travail, null);
});

test("captureLucieCall met à jour le profil, notifie et amorce le parcours", async () => {
  const db = await applyMigrations();
  const store = new PgliteCrmStore(db);
  const benef = await store.findOrCreateBeneficiaryByPhone("+33612345678", {});

  const res = await captureLucieCall(store, new QueueNotifier(), {
    beneficiaryId: benef!.id,
    phone: "+33612345678",
    call: {
      call_id: "c3",
      call_analysis: {
        custom_analysis_data: { prenom: "Léa", email: "lea@example.com", financement: "CPF" },
      },
    },
  });

  assert.equal(res.profileUpdated, true);
  assert.equal(res.notified, true);
  assert.equal(res.relanceScheduled, true);

  const b = await db.query(`select first_name, email, financeur from crm.beneficiaries where id=$1`, [benef!.id]);
  assert.equal((b.rows[0] as any).first_name, "Léa");
  assert.equal((b.rows[0] as any).financeur, "edof");

  // Notification email (préférée si email présent) + relance intake.
  const n = await db.query(`select channel from crm.notifications where beneficiary_id=$1`, [benef!.id]);
  assert.equal((n.rows[0] as any).channel, "email");
  const fu = await db.query(`select rule_code from crm.follow_up_tasks where beneficiary_id=$1`, [benef!.id]);
  assert.equal((fu.rows[0] as any).rule_code, "relance_intake");
});
