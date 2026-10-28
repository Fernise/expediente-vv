import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the daily reminder engine persists, deduplicates and resolves candidates", async () => {
  const [schema, reminders] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/reminders.ts", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /export const reminders = sqliteTable/);
  assert.match(schema, /reminders_dedupe_uidx/);
  assert.match(schema, /reminder_sync_runs_org_date_uidx/);
  assert.match(reminders, /date\('now', '\+30 days'\)/);
  assert.match(reminders, /ON CONFLICT \(deduplication_key\) DO UPDATE/);
  assert.match(reminders, /SET status = 'resolved'/);
  assert.match(reminders, /last_seen_at < \?/);
  assert.match(reminders, /const batchSize = 50/);
  assert.match(reminders, /reminders\.synchronized/);
  assert.match(reminders, /synchronizeAllOperationalReminders/);
  assert.match(reminders, /FROM organizations WHERE status = 'active'/);
});

test("daily runs are permission-aware, retryable and prepare safe email payloads", async () => {
  const [reminders, page] = await Promise.all([
    readFile(new URL("../db/reminders.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/app/alerts/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(reminders, /"property\.update"/);
  assert.match(reminders, /reminder_sync_runs\.status = 'failed'/);
  assert.match(reminders, /datetime\('now', '-15 minutes'\)/);
  assert.match(reminders, /'operational_reminder'/);
  assert.match(reminders, /internalReference: candidate\.internalReference/);
  assert.match(reminders, /propertyAlias: candidate\.propertyAlias/);
  assert.doesNotMatch(
    reminders,
    /JSON\.stringify\(\{[\s\S]{0,260}(?:address|document|downloadUrl)/i,
  );
  assert.match(page, /synchronizeOperationalReminders/);
  assert.match(page, /sincronización pendiente/i);
});
