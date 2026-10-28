import {
  database,
  getMembershipContext,
  type ActorInput,
} from "@/db/organizations";
import {
  listOperationalRunsIn,
  OPERATIONAL_RUNS_INDEX_SQL,
  OPERATIONAL_RUNS_TABLE_SQL,
  purgeOperationalRunsIn,
  recordOperationalRunIn,
  type OperationalComponent,
  type OperationalRunInput,
  type OperationalRunView,
} from "@/db/operations-core";
import { gmailProviderStatus } from "@/lib/email/gmail";
import { can, type Role } from "@/lib/permissions";

type CountRow = {
  failed: number;
  pending: number;
  retrying: number;
  stale: number;
};

export type OperationalOverview = {
  identity: { legacyAccounts: number; stableAccounts: number };
  emailConfigured: boolean;
  notifications: CountRow;
  reminders: {
    failed: number;
    stale: number;
  };
  runs: OperationalRunView[];
  status: "attention" | "healthy" | "waiting";
};

let initialization: Promise<void> | null = null;

export async function recordOperationalRun(
  input: OperationalRunInput,
): Promise<void> {
  await ensureOperationalSchema();
  await recordOperationalRunIn(database(), input);
}

export async function purgeExpiredOperationalRuns(): Promise<number> {
  await ensureOperationalSchema();
  return purgeOperationalRunsIn(database());
}

export async function getOperationalOverview(
  actor: ActorInput,
  organizationId: string,
): Promise<OperationalOverview> {
  const membership = await getMembershipContext(actor, organizationId);
  if (!membership || !can(membership.role as Role, "operations.read")) {
    throw new Error("Operational overview access denied");
  }
  await ensureOperationalSchema();
  const db = database();
  const [notifications, reminderRuns, runs, identity] = await Promise.all([
    db
      .prepare(
        `SELECT
          COALESCE(SUM(CASE
            WHEN status IN ('pending_provider', 'queued') THEN 1 ELSE 0 END), 0) AS pending,
          COALESCE(SUM(CASE
            WHEN status = 'failed' AND next_attempt_at IS NOT NULL
             AND attempt_count < 5 THEN 1 ELSE 0 END), 0) AS retrying,
          COALESCE(SUM(CASE
            WHEN status = 'failed' AND (next_attempt_at IS NULL OR attempt_count >= 5)
              THEN 1 ELSE 0 END), 0) AS failed,
          COALESCE(SUM(CASE
            WHEN status = 'queued'
             AND last_attempt_at < datetime('now', '-30 minutes')
              THEN 1 ELSE 0 END), 0) AS stale
         FROM notification_deliveries
         WHERE organization_id = ?`,
      )
      .bind(organizationId)
      .first<CountRow>(),
    db
      .prepare(
        `SELECT
          COALESCE(SUM(CASE
            WHEN status = 'failed' AND started_at >= datetime('now', '-7 days')
              THEN 1 ELSE 0 END), 0) AS failed,
          COALESCE(SUM(CASE
            WHEN status = 'running' AND started_at < datetime('now', '-15 minutes')
              THEN 1 ELSE 0 END), 0) AS stale
         FROM reminder_sync_runs
         WHERE organization_id = ?`,
      )
      .bind(organizationId)
      .first<{ failed: number; stale: number }>(),
    listOperationalRunsIn(db),
    db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN u.sites_subject IS NULL THEN 1 ELSE 0 END), 0) AS legacyAccounts,
      COALESCE(SUM(CASE WHEN u.sites_subject IS NOT NULL THEN 1 ELSE 0 END), 0) AS stableAccounts
      FROM memberships m INNER JOIN app_users u ON u.id = m.user_id
      WHERE m.organization_id = ? AND m.status = 'active' AND u.status = 'active'`)
      .bind(organizationId).first<{ legacyAccounts: number; stableAccounts: number }>(),
  ]);

  const notificationCounts = normalizedCounts(notifications);
  const reminders = {
    failed: Number(reminderRuns?.failed ?? 0),
    stale: Number(reminderRuns?.stale ?? 0),
  };
  const emailConfigured = gmailProviderStatus().configured;
  const critical =
    runs[0]?.status === "failed" ||
    notificationCounts.failed > 0 ||
    notificationCounts.stale > 0 ||
    reminders.failed > 0 ||
    reminders.stale > 0;
  const attention =
    !emailConfigured ||
    notificationCounts.pending > 0 ||
    notificationCounts.retrying > 0;

  return {
    identity: {
      legacyAccounts: Number(identity?.legacyAccounts ?? 0),
      stableAccounts: Number(identity?.stableAccounts ?? 0),
    },
    emailConfigured,
    notifications: notificationCounts,
    reminders,
    runs,
    status: critical || attention
      ? "attention"
      : runs.length === 0 ? "waiting" : "healthy",
  };
}

export type { OperationalComponent };

function ensureOperationalSchema(): Promise<void> {
  if (process.env.NODE_ENV !== "development") return Promise.resolve();
  if (initialization) return initialization;
  const db = database();
  initialization = db
    .batch([
      db.prepare(OPERATIONAL_RUNS_TABLE_SQL),
      db.prepare(OPERATIONAL_RUNS_INDEX_SQL),
    ])
    .then(() => undefined)
    .catch((error) => {
      initialization = null;
      throw error;
    });
  return initialization;
}

function normalizedCounts(row: CountRow | null): CountRow {
  return {
    failed: Number(row?.failed ?? 0),
    pending: Number(row?.pending ?? 0),
    retrying: Number(row?.retrying ?? 0),
    stale: Number(row?.stale ?? 0),
  };
}
