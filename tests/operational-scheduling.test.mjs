import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import {
  claimScheduledCycleIn,
  OPERATIONAL_SCHEDULE_CLAIMS_INDEX_SQL,
  OPERATIONAL_SCHEDULE_CLAIMS_TABLE_SQL,
  releaseScheduledCycleIn,
  scheduledBucketFor,
} from "../db/scheduling-core.ts";

test("schedule buckets are deterministic and fifteen minutes wide", () => {
  const now = new Date("2026-09-17T18:37:42.000Z");
  assert.equal(scheduledBucketFor("daily", now), "2026-09-17");
  assert.equal(scheduledBucketFor("notifications", now), "2026-09-17T18:30");
});

test("D1 claims let only one worker run each operational cycle", async () => {
  const miniflare = new Miniflare(
    convertV4MiniflareOptions({
      compatibilityDate: "2026-09-04",
      d1Databases: ["DB"],
      modules: true,
      script: "export default { fetch() { return new Response('ok') } }",
    }),
  );
  try {
    const database = await miniflare.getD1Database("DB");
    await database.prepare(OPERATIONAL_SCHEDULE_CLAIMS_TABLE_SQL).run();
    await database.prepare(OPERATIONAL_SCHEDULE_CLAIMS_INDEX_SQL).run();
    assert.equal(await claimScheduledCycleIn(database, "notifications", "2026-09-17T18:30"), true);
    assert.equal(await claimScheduledCycleIn(database, "notifications", "2026-09-17T18:30"), false);
    await releaseScheduledCycleIn(database, "notifications", "2026-09-17T18:30");
    assert.equal(await claimScheduledCycleIn(database, "notifications", "2026-09-17T18:30"), true);
  } finally {
    await miniflare.dispose();
  }
});

test("manual operations are guarded and restricted to administrators", async () => {
  const [route, controls, permissions] = await Promise.all([
    readFile(new URL("../app/api/operations/run/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/OperationsRunControls.tsx", import.meta.url), "utf8"),
    import("../lib/permissions.ts"),
  ]);
  assert.match(route, /guardMutationRequest/);
  assert.match(route, /operations\.run/);
  assert.match(controls, /Comprobar ahora/);
  assert.equal(permissions.can("organization_admin", "operations.run"), true);
  assert.equal(permissions.can("manager", "operations.run"), false);
});
