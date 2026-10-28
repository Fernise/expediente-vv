import {
  database,
  getMembershipContext,
  type ActorInput,
} from "@/db/organizations";
import {
  ensurePropertySchema,
  invalidateExpiredProfessionalReviewsIn,
} from "@/db/properties";
import { can, type Role } from "@/lib/permissions";

export type ReminderSyncSummary = {
  activeCount: number;
  lastRunAt: string | null;
  status: "already_current" | "read_only" | "synchronized";
};

type ReminderCandidate = {
  dueAt: string | null;
  internalReference: string;
  kind:
    | "checklist_due"
    | "document_expiry"
    | "next_action_due"
    | "professional_review";
  propertyAlias: string;
  propertyId: string;
  recipientEmail: string | null;
  recipientUserId: string | null;
  targetId: string;
  targetType: "checklist_item" | "document" | "property";
};

export async function synchronizeOperationalReminders(
  actor: ActorInput,
  organizationId: string,
): Promise<ReminderSyncSummary> {
  await ensurePropertySchema();
  const membership = await getMembershipContext(actor, organizationId);
  if (!membership) {
    return { activeCount: 0, lastRunAt: null, status: "read_only" };
  }

  const db = database();
  if (!can(membership.role as Role, "property.update")) {
    return {
      activeCount: await activeReminderCount(db, organizationId),
      lastRunAt: await latestRunAt(db, organizationId),
      status: "read_only",
    };
  }

  return synchronizeOrganizationReminders(db, organizationId);
}

export async function synchronizeAllOperationalReminders(): Promise<{
  failedOrganizations: number;
  processedOrganizations: number;
}> {
  await ensurePropertySchema();
  const db = database();
  const result = await db
    .prepare("SELECT id FROM organizations WHERE status = 'active' ORDER BY id")
    .all<{ id: string }>();
  let failedOrganizations = 0;
  let processedOrganizations = 0;

  for (const organization of result.results ?? []) {
    try {
      await synchronizeOrganizationReminders(db, organization.id);
      processedOrganizations += 1;
    } catch {
      failedOrganizations += 1;
    }
  }

  if (failedOrganizations > 0) {
    throw new Error(
      `Reminder synchronization failed for ${failedOrganizations} organization(s).`,
    );
  }
  return { failedOrganizations, processedOrganizations };
}

async function synchronizeOrganizationReminders(
  db: D1Database,
  organizationId: string,
): Promise<ReminderSyncSummary> {
  const runDate = canaryDate();
  await invalidateExpiredProfessionalReviewsIn(db, organizationId, runDate);
  const completed = await db
    .prepare(
      `SELECT completed_at AS completedAt, active_count AS activeCount
       FROM reminder_sync_runs
       WHERE organization_id = ? AND run_date = ? AND status = 'completed'
       LIMIT 1`,
    )
    .bind(organizationId, runDate)
    .first<{ activeCount: number; completedAt: string }>();
  if (completed) {
    return {
      activeCount: Number(completed.activeCount),
      lastRunAt: completed.completedAt,
      status: "already_current",
    };
  }

  const runId = crypto.randomUUID();
  const runStartedAt = sqliteTimestamp(new Date());
  const claimed = await db
    .prepare(
      `INSERT INTO reminder_sync_runs (
        id, organization_id, run_date, status, started_at
      ) VALUES (?, ?, ?, 'running', ?)
      ON CONFLICT (organization_id, run_date) DO UPDATE SET
        id = excluded.id,
        status = 'running',
        candidate_count = 0,
        active_count = 0,
        started_at = excluded.started_at,
        completed_at = NULL
      WHERE reminder_sync_runs.status = 'failed'
         OR (
           reminder_sync_runs.status = 'running'
           AND datetime(reminder_sync_runs.started_at) < datetime('now', '-15 minutes')
         )`,
    )
    .bind(runId, organizationId, runDate, runStartedAt)
    .run();
  if (Number(claimed.meta.changes ?? 0) === 0) {
    return {
      activeCount: await activeReminderCount(db, organizationId),
      lastRunAt: await latestRunAt(db, organizationId),
      status: "already_current",
    };
  }

  try {
    const candidates = await reminderCandidates(db, organizationId);
    const statements: D1PreparedStatement[] = [];
    for (const candidate of candidates) {
      const deduplicationKey = reminderDeduplicationKey(
        organizationId,
        candidate,
      );
      const reminderId = await stableReminderId(deduplicationKey);
      statements.push(
        db
          .prepare(
            `INSERT INTO reminders (
              id, organization_id, property_id, target_type, target_id, kind,
              due_at, channel, recipient_user_id, status, deduplication_key,
              last_seen_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'in_app', ?, 'active', ?, ?)
            ON CONFLICT (deduplication_key) DO UPDATE SET
              property_id = excluded.property_id,
              due_at = excluded.due_at,
              recipient_user_id = excluded.recipient_user_id,
              status = 'active',
              resolved_at = NULL,
              last_seen_at = excluded.last_seen_at,
              updated_at = CURRENT_TIMESTAMP`,
          )
          .bind(
            reminderId,
            organizationId,
            candidate.propertyId,
            candidate.targetType,
            candidate.targetId,
            candidate.kind,
            candidate.dueAt,
            candidate.recipientUserId,
            deduplicationKey,
            runStartedAt,
          ),
      );
      if (candidate.recipientEmail) {
        statements.push(
          db
            .prepare(
              `INSERT INTO notification_deliveries (
                id, organization_id, channel, template_key, recipient_email,
                entity_type, entity_id, status, deduplication_key, payload_json
              ) VALUES (
                ?, ?, 'email', 'operational_reminder', ?, 'reminder', ?,
                'pending_provider', ?, ?
              )
              ON CONFLICT (deduplication_key) DO UPDATE SET
                recipient_email = excluded.recipient_email,
                payload_json = excluded.payload_json,
                status = CASE
                  WHEN notification_deliveries.status = 'cancelled'
                    THEN 'pending_provider'
                  ELSE notification_deliveries.status
                END,
                updated_at = CURRENT_TIMESTAMP`,
            )
            .bind(
              crypto.randomUUID(),
              organizationId,
              candidate.recipientEmail,
              reminderId,
              `reminder-email:${deduplicationKey}`,
              JSON.stringify({
                dueAt: candidate.dueAt,
                internalReference: candidate.internalReference,
                kind: candidate.kind,
                propertyAlias: candidate.propertyAlias,
              }),
            ),
        );
      }
    }

    statements.push(
      db
        .prepare(
          `UPDATE reminders
           SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE organization_id = ? AND status = 'active'
             AND last_seen_at < ?`,
        )
        .bind(organizationId, runStartedAt),
      db
        .prepare(
          `UPDATE notification_deliveries
           SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
           WHERE organization_id = ?
             AND entity_type = 'reminder'
             AND status IN ('pending_provider', 'queued', 'failed')
             AND entity_id IN (
               SELECT id FROM reminders
               WHERE organization_id = ? AND status = 'resolved'
             )`,
        )
        .bind(organizationId, organizationId),
    );
    await executeInBatches(db, statements);

    const activeCount = await activeReminderCount(db, organizationId);
    await db.batch([
      db
        .prepare(
          `UPDATE reminder_sync_runs
           SET status = 'completed', candidate_count = ?, active_count = ?,
               completed_at = CURRENT_TIMESTAMP
           WHERE id = ? AND organization_id = ?`,
        )
        .bind(candidates.length, activeCount, runId, organizationId),
      db
        .prepare(
          `INSERT INTO audit_events (
            id, organization_id, actor_user_id, actor_type, action,
            entity_type, entity_id, metadata_json
          ) VALUES (?, ?, NULL, 'system', 'reminders.synchronized',
            'organization', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          organizationId,
          organizationId,
          JSON.stringify({ activeCount, candidateCount: candidates.length }),
        ),
    ]);

    return {
      activeCount,
      lastRunAt: sqliteTimestamp(new Date()),
      status: "synchronized",
    };
  } catch (error) {
    await db
      .prepare(
        `UPDATE reminder_sync_runs
         SET status = 'failed', completed_at = CURRENT_TIMESTAMP
         WHERE id = ? AND organization_id = ?`,
      )
      .bind(runId, organizationId)
      .run();
    throw error;
  }
}

async function reminderCandidates(
  db: D1Database,
  organizationId: string,
): Promise<ReminderCandidate[]> {
  const result = await db
    .prepare(
      `SELECT
        d.id AS targetId, 'document' AS targetType,
        'document_expiry' AS kind, d.expires_at AS dueAt,
        p.id AS propertyId, p.alias AS propertyAlias,
        p.internal_reference AS internalReference,
        manager_membership.user_id AS recipientUserId,
        manager.email AS recipientEmail
      FROM documents d
      INNER JOIN properties p
        ON p.organization_id = d.organization_id AND p.id = d.property_id
      LEFT JOIN memberships manager_membership
        ON manager_membership.organization_id = p.organization_id
       AND manager_membership.user_id = p.manager_user_id
       AND manager_membership.status = 'active'
      LEFT JOIN app_users manager
        ON manager.id = manager_membership.user_id AND manager.status = 'active'
      WHERE p.organization_id = ? AND p.archived_at IS NULL
        AND d.workflow_status != 'archived' AND d.expires_at IS NOT NULL
        AND date(d.expires_at) <= date('now', '+30 days')
      UNION ALL
      SELECT
        ci.id, 'checklist_item', 'checklist_due', ci.due_at,
        p.id, p.alias, p.internal_reference,
        COALESCE(assignee_membership.user_id, manager_membership.user_id),
        COALESCE(assignee.email, manager.email)
      FROM checklist_items ci
      INNER JOIN property_checklists pc
        ON pc.organization_id = ci.organization_id AND pc.id = ci.checklist_id
      INNER JOIN properties p
        ON p.organization_id = pc.organization_id AND p.id = pc.property_id
      LEFT JOIN memberships assignee_membership
        ON assignee_membership.organization_id = p.organization_id
       AND assignee_membership.user_id = ci.assignee_user_id
       AND assignee_membership.status = 'active'
      LEFT JOIN app_users assignee
        ON assignee.id = assignee_membership.user_id AND assignee.status = 'active'
      LEFT JOIN memberships manager_membership
        ON manager_membership.organization_id = p.organization_id
       AND manager_membership.user_id = p.manager_user_id
       AND manager_membership.status = 'active'
      LEFT JOIN app_users manager
        ON manager.id = manager_membership.user_id AND manager.status = 'active'
      WHERE p.organization_id = ? AND p.archived_at IS NULL
        AND pc.status = 'active'
        AND ci.workflow_status NOT IN ('reviewed', 'closed', 'completed')
        AND ci.due_at IS NOT NULL
        AND date(ci.due_at) <= date('now', '+30 days')
      UNION ALL
      SELECT
        p.id, 'property', 'next_action_due', p.next_action_due_at,
        p.id, p.alias, p.internal_reference,
        manager_membership.user_id, manager.email
      FROM properties p
      LEFT JOIN memberships manager_membership
        ON manager_membership.organization_id = p.organization_id
       AND manager_membership.user_id = p.manager_user_id
       AND manager_membership.status = 'active'
      LEFT JOIN app_users manager
        ON manager.id = manager_membership.user_id AND manager.status = 'active'
      WHERE p.organization_id = ? AND p.archived_at IS NULL
        AND p.next_action_due_at IS NOT NULL
        AND date(p.next_action_due_at) <= date('now', '+30 days')
      UNION ALL
      SELECT
        p.id, 'property', 'professional_review', NULL,
        p.id, p.alias, p.internal_reference,
        manager_membership.user_id, manager.email
      FROM properties p
      LEFT JOIN memberships manager_membership
        ON manager_membership.organization_id = p.organization_id
       AND manager_membership.user_id = p.manager_user_id
       AND manager_membership.status = 'active'
      LEFT JOIN app_users manager
        ON manager.id = manager_membership.user_id AND manager.status = 'active'
      WHERE p.organization_id = ? AND p.archived_at IS NULL
        AND p.dossier_status = 'requires_professional_review'`,
    )
    .bind(organizationId, organizationId, organizationId, organizationId)
    .all<ReminderCandidate>();
  return result.results ?? [];
}

function reminderDeduplicationKey(
  organizationId: string,
  candidate: ReminderCandidate,
): string {
  return [
    organizationId,
    candidate.kind,
    candidate.targetType,
    candidate.targetId,
    candidate.dueAt?.slice(0, 10) ?? "attention",
  ].join(":");
}

async function stableReminderId(deduplicationKey: string): Promise<string> {
  const bytes = new TextEncoder().encode(deduplicationKey);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `rem_${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}

async function activeReminderCount(
  db: D1Database,
  organizationId: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM reminders WHERE organization_id = ? AND status = 'active'`,
    )
    .bind(organizationId)
    .first<{ count: number }>();
  return Number(row?.count ?? 0);
}

async function latestRunAt(
  db: D1Database,
  organizationId: string,
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT completed_at AS completedAt
       FROM reminder_sync_runs
       WHERE organization_id = ? AND status = 'completed'
       ORDER BY completed_at DESC LIMIT 1`,
    )
    .bind(organizationId)
    .first<{ completedAt: string | null }>();
  return row?.completedAt ?? null;
}

function canaryDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Atlantic/Canary",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function sqliteTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

async function executeInBatches(
  db: D1Database,
  statements: D1PreparedStatement[],
): Promise<void> {
  const batchSize = 50;
  for (let index = 0; index < statements.length; index += batchSize) {
    await db.batch(statements.slice(index, index + batchSize));
  }
}
