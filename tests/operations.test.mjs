import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import {
  listOperationalRunsIn,
  OPERATIONAL_RUNS_INDEX_SQL,
  OPERATIONAL_RUNS_TABLE_SQL,
  recordOperationalRunIn,
} from "../db/operations-core.ts";

test("operational runs persist only bounded technical metadata in D1", async () => {
  const miniflare = new Miniflare(
    convertV4MiniflareOptions({
      compatibilityDate: "2026-08-31",
      d1Databases: ["DB"],
      modules: true,
      script: "export default { fetch() { return new Response('ok') } }",
    }),
  );

  try {
    const database = await miniflare.getD1Database("DB");
    await database.prepare(OPERATIONAL_RUNS_TABLE_SQL).run();
    await database.prepare(OPERATIONAL_RUNS_INDEX_SQL).run();
    await recordOperationalRunIn(database, {
      completedAt: new Date("2026-08-31T10:00:02.000Z"),
      components: [
        { name: "notifications", status: "succeeded" },
        { name: "privacy-deletions", status: "failed" },
      ],
      failureCodes: ["privacy-deletions"],
      id: "run-1",
      startedAt: new Date("2026-08-31T10:00:00.000Z"),
      trigger: "daily",
    });

    const runs = await listOperationalRunsIn(database);
    assert.equal(runs.length, 1);
    assert.equal(runs[0].status, "failed");
    assert.equal(runs[0].durationMs, 2000);
    assert.deepEqual(runs[0].failureCodes, ["privacy-deletions"]);
    assert.deepEqual(runs[0].components, [
      { name: "notifications", status: "succeeded" },
      { name: "privacy-deletions", status: "failed" },
    ]);

    const stored = await database
      .prepare("SELECT components_json AS components FROM operational_runs")
      .first();
    assert.doesNotMatch(String(stored.components), /@|document|recipient/i);
  } finally {
    await miniflare.dispose();
  }
});

test("the operational surface is restricted and wired to safe signals", async () => {
  const [page, shell, operations, worker, scheduled] = await Promise.all([
    readFile(new URL("../app/app/operations/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/WorkspaceShell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/operations.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/scheduled-operations.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /operations\.read/);
  assert.match(page, /sin mostrar destinatarios/);
  assert.match(shell, /Estado operativo/);
  assert.match(operations, /organization_id = \?/);
  assert.match(operations, /gmailProviderStatus/);
  assert.match(scheduled, /scheduled_component_failed/);
  assert.match(worker, /request_failed/);
  assert.match(worker, /requestId/);
  assert.match(worker, /safeRequestPath/);
});
