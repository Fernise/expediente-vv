import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the worker schedules the daily reminder engine independently of visits", async () => {
  const [worker, scheduled, viteConfig, alertsPage] = await Promise.all([
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/scheduled-operations.ts", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/app/alerts/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(worker, /scheduled\(/);
  assert.match(worker, /ctx\.waitUntil\(runClaimedScheduledCycle\(controller\.cron\)\)/);
  assert.match(worker, /runDueFallbackCycles/);
  assert.match(scheduled, /processPendingNotificationDeliveries/);
  assert.match(
    viteConfig,
    /triggers: \{ crons: \["\*\/15 \* \* \* \*", "0 8 \* \* \*"\] \}/,
  );
  assert.match(alertsPage, /synchronizeOperationalReminders/);
  assert.match(alertsPage, /Ejecución diaria programada/);
});

test("the deployment artifact includes the daily cron trigger", async () => {
  const raw = await readFile(
    new URL("../dist/server/wrangler.json", import.meta.url),
    "utf8",
  );
  const config = JSON.parse(raw);

  assert.deepEqual(config.triggers?.crons, ["*/15 * * * *", "0 8 * * *"]);
});
