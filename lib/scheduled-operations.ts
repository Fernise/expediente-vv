import { processPendingNotificationDeliveries } from "@/db/notifications";
import {
  purgeExpiredOperationalRuns,
  recordOperationalRun,
  type OperationalComponent,
} from "@/db/operations";
import { purgeExpiredPilotDemoRequests } from "@/db/pilot-leads";
import { processScheduledOrganizationDeletions } from "@/db/privacy";
import { purgeExpiredRateLimitBuckets } from "@/db/rate-limits";
import { synchronizeAllOperationalReminders } from "@/db/reminders";
import {
  claimScheduledCycle,
  purgeExpiredScheduledClaims,
  releaseScheduledCycle,
} from "@/db/scheduling";
import type { ScheduledCycle } from "@/db/scheduling-core";

export const NOTIFICATION_CRON = "*/15 * * * *";
export const DAILY_CRON = "0 8 * * *";

export async function runClaimedScheduledCycle(
  cron: string,
  now = new Date(),
): Promise<boolean> {
  const cycle = cycleForCron(cron);
  const claim = await claimScheduledCycle(cycle, now);
  if (!claim.claimed) return false;
  try {
    await runScheduledCycle(cron);
    return true;
  } catch (error) {
    await releaseScheduledCycle(cycle, claim.bucket);
    throw error;
  }
}

export async function runDueFallbackCycles(now = new Date()): Promise<void> {
  if (now.getUTCHours() >= 8) {
    await runClaimedScheduledCycle(DAILY_CRON, now);
  }
  await runClaimedScheduledCycle(NOTIFICATION_CRON, now);
}

export async function runScheduledCycle(cron: string): Promise<void> {
  const startedAt = new Date();
  const components: OperationalComponent[] = [];
  const failures: string[] = [];

  if (cron === DAILY_CRON) {
    await executeScheduledComponent(
      "reminders",
      async () => { await synchronizeAllOperationalReminders(); },
      cron,
      components,
      failures,
    );
    await executeScheduledComponent(
      "privacy-deletions",
      async () => { await processScheduledOrganizationDeletions(); },
      cron,
      components,
      failures,
    );
    await executeScheduledComponent(
      "pilot-lead-retention",
      async () => { await purgeExpiredPilotDemoRequests(); },
      cron,
      components,
      failures,
    );
    await executeScheduledComponent(
      "rate-limit-retention",
      async () => { await purgeExpiredRateLimitBuckets(); },
      cron,
      components,
      failures,
    );
    await executeScheduledComponent(
      "operations-retention",
      async () => { await purgeExpiredOperationalRuns(); },
      cron,
      components,
      failures,
    );
    await executeScheduledComponent(
      "schedule-claims-retention",
      async () => { await purgeExpiredScheduledClaims(); },
      cron,
      components,
      failures,
    );
  }

  await executeScheduledComponent(
    "notifications",
    async () => {
      const summary = await processPendingNotificationDeliveries();
      if (summary.failed > 0) throw new Error("Notification delivery failed");
      return summary.configured ? "succeeded" : "skipped";
    },
    cron,
    components,
    failures,
  );

  try {
    await recordOperationalRun({
      completedAt: new Date(),
      components,
      failureCodes: failures,
      id: crypto.randomUUID(),
      startedAt,
      trigger: cron === DAILY_CRON ? "daily" : "notifications",
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: "scheduled_observability_failed",
      cron,
      errorName: safeErrorName(error),
    }));
    failures.push("observability");
  }

  if (failures.length > 0) {
    throw new Error(`Scheduled cycle failed: ${failures.join(", ")}.`);
  }
}

function cycleForCron(cron: string): ScheduledCycle {
  return cron === DAILY_CRON ? "daily" : "notifications";
}

async function executeScheduledComponent(
  name: string,
  task: () => Promise<"skipped" | "succeeded" | void>,
  cron: string,
  components: OperationalComponent[],
  failures: string[],
): Promise<void> {
  try {
    const status = await task();
    components.push({ name, status: status ?? "succeeded" });
  } catch (error) {
    components.push({ name, status: "failed" });
    failures.push(name);
    console.error(JSON.stringify({
      event: "scheduled_component_failed",
      component: name,
      cron,
      errorName: safeErrorName(error),
    }));
  }
}

function safeErrorName(error: unknown): string {
  return error instanceof Error
    ? error.name.replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || "Error"
    : "UnknownError";
}
