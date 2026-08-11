// migrations.test.ts — applique les migrations réelles dans PGlite et vérifie
// le schéma, les seeds, les fonctions DMAIC, les relances et les vues.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { applyMigrations } from "../helpers/migrate.ts";

async function freshDb(): Promise<PGlite> {
  return applyMigrations();
}

async function newBeneficiary(db: PGlite, phone = "0612345678"): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into crm.beneficiaries (first_name, phone) values ('Test', $1) returning id`,
    [phone],
  );
  return r.rows[0].id;
}

test("les migrations s'appliquent et créent le schéma crm", async () => {
  const db = await freshDb();
  const tables = await db.query<{ table_name: string }>(
    `select table_name from information_schema.tables where table_schema='crm' and table_type='BASE TABLE' order by 1`,
  );
  const names = tables.rows.map((r) => r.table_name);
  for (const t of [
    "beneficiaries", "calls", "transcripts", "emails", "wedof_events",
    "webhook_events", "pipeline_stages", "control_points",
    "pipeline_transitions", "follow_up_rules", "follow_up_tasks",
  ]) {
    assert.ok(names.includes(t), `table crm.${t} manquante`);
  }
});

test("les référentiels pipeline / control points / règles sont seedés", async () => {
  const db = await freshDb();
  const st = await db.query(`select count(*)::int as n from crm.pipeline_stages`);
  assert.equal((st.rows[0] as any).n, 7);
  const cp = await db.query(`select count(*)::int as n from crm.control_points`);
  assert.equal((cp.rows[0] as any).n, 5);
  const rl = await db.query(`select count(*)::int as n from crm.follow_up_rules`);
  assert.ok((rl.rows[0] as any).n >= 4);
});

test("normalize_phone produit du E.164", async () => {
  const db = await freshDb();
  const cases: [string, string][] = [
    ["0612345678", "+33612345678"],
    ["+33612345678", "+33612345678"],
    ["0033612345678", "+33612345678"],
    ["06 12 34 56 78", "+33612345678"],
  ];
  for (const [input, expected] of cases) {
    const r = await db.query<{ e: string }>(`select crm.normalize_phone($1) as e`, [input]);
    assert.equal(r.rows[0].e, expected, `normalize(${input})`);
  }
});

test("phone_e164 est calculé automatiquement", async () => {
  const db = await freshDb();
  const id = await newBeneficiary(db, "06 12 34 56 78");
  const r = await db.query<{ phone_e164: string }>(
    `select phone_e164 from crm.beneficiaries where id=$1`, [id],
  );
  assert.equal(r.rows[0].phone_e164, "+33612345678");
});

test("set_stage journalise une transition avec son point de contrôle", async () => {
  const db = await freshDb();
  const id = await newBeneficiary(db);

  const ok = await db.query<{ ok: boolean }>(
    `select crm.set_stage($1,'contact_etabli','test','appel') as ok`, [id],
  );
  assert.equal(ok.rows[0].ok, true);

  const b = await db.query<{ pipeline_stage: string }>(
    `select pipeline_stage from crm.beneficiaries where id=$1`, [id],
  );
  assert.equal(b.rows[0].pipeline_stage, "contact_etabli");

  const tr = await db.query<{ control_point: string; from_stage: string }>(
    `select control_point, from_stage from crm.pipeline_transitions where beneficiary_id=$1`, [id],
  );
  assert.equal(tr.rows.length, 1);
  assert.equal(tr.rows[0].control_point, "cp_contact");
  assert.equal(tr.rows[0].from_stage, "lead");
});

test("set_stage refuse les régressions (sauf perdu)", async () => {
  const db = await freshDb();
  const id = await newBeneficiary(db);
  await db.query(`select crm.set_stage($1,'qualifie','test')`, [id]);

  const back = await db.query<{ ok: boolean }>(`select crm.set_stage($1,'lead','test') as ok`, [id]);
  assert.equal(back.rows[0].ok, false, "régression interdite");

  const lost = await db.query<{ ok: boolean }>(`select crm.set_stage($1,'perdu','test') as ok`, [id]);
  assert.equal(lost.rows[0].ok, true, "perdu toujours autorisé");
});

test("schedule_follow_up déduplique les pending et respecte max_attempts", async () => {
  const db = await freshDb();
  const id = await newBeneficiary(db);

  const first = await db.query<{ id: string | null }>(
    `select crm.schedule_follow_up($1,'relance_no_answer') as id`, [id],
  );
  assert.ok(first.rows[0].id, "1re relance planifiée");

  const dup = await db.query<{ id: string | null }>(
    `select crm.schedule_follow_up($1,'relance_no_answer') as id`, [id],
  );
  assert.equal(dup.rows[0].id, null, "pas de doublon pending");

  // On épuise le quota (max_attempts = 3 pour relance_no_answer).
  await db.query(`update crm.follow_up_tasks set status='done', completed_at=now() where beneficiary_id=$1`, [id]);
  await db.query(`select crm.schedule_follow_up($1,'relance_no_answer')`, [id]);
  await db.query(`update crm.follow_up_tasks set status='done', completed_at=now() where beneficiary_id=$1`, [id]);
  await db.query(`select crm.schedule_follow_up($1,'relance_no_answer')`, [id]);
  await db.query(`update crm.follow_up_tasks set status='done', completed_at=now() where beneficiary_id=$1`, [id]);

  const overQuota = await db.query<{ id: string | null }>(
    `select crm.schedule_follow_up($1,'relance_no_answer') as id`, [id],
  );
  assert.equal(overQuota.rows[0].id, null, "quota max_attempts atteint");
});

test("due_follow_ups ne renvoie que les relances échues", async () => {
  const db = await freshDb();
  const id = await newBeneficiary(db);
  // relance_no_answer a un délai de 1440 min -> pas due immédiatement.
  await db.query(`select crm.schedule_follow_up($1,'relance_no_answer')`, [id]);

  const dueNow = await db.query(`select * from crm.due_follow_ups(10)`);
  assert.equal(dueNow.rows.length, 0);

  await db.query(`update crm.follow_up_tasks set due_at=now()-interval '1 minute' where beneficiary_id=$1`, [id]);
  const dueLater = await db.query(`select * from crm.due_follow_ups(10)`);
  assert.equal(dueLater.rows.length, 1);
});

test("detect_stale_and_schedule planifie les dossiers dormants", async () => {
  const db = await freshDb();
  const id = await newBeneficiary(db);
  // lead depuis longtemps -> dépasse target_hours de cp_contact (48h).
  await db.query(`update crm.beneficiaries set stage_changed_at = now() - interval '10 days' where id=$1`, [id]);

  const n = await db.query<{ n: number }>(`select crm.detect_stale_and_schedule() as n`);
  assert.equal(Number(n.rows[0].n), 1);

  const tasks = await db.query(
    `select * from crm.follow_up_tasks where beneficiary_id=$1 and rule_code='relance_stale'`, [id],
  );
  assert.equal(tasks.rows.length, 1);
});

test("les vues unifiées sont interrogeables", async () => {
  const db = await freshDb();
  const id = await newBeneficiary(db);
  await db.query(`select crm.set_stage($1,'contact_etabli','test')`, [id]);

  const overview = await db.query(`select * from crm.vw_beneficiary_overview where id=$1`, [id]);
  assert.equal(overview.rows.length, 1);
  assert.equal((overview.rows[0] as any).stage_label, "Contact établi");

  const timeline = await db.query(`select * from crm.vw_beneficiary_timeline where beneficiary_id=$1`, [id]);
  assert.ok(timeline.rows.length >= 1, "la transition apparaît dans la timeline");

  const metrics = await db.query(`select * from crm.vw_pipeline_metrics`);
  assert.ok(metrics.rows.length >= 5);

  const funnel = await db.query(`select * from crm.vw_funnel`);
  assert.equal(funnel.rows.length, 7);
});
