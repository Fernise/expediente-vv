import { env } from "cloudflare:workers";
import {
  database,
  ensureCoreSchema,
  type ActorInput,
} from "@/db/organizations";
import {
  AuthorizationError,
  requireOrganizationCapability,
  ValidationError,
} from "@/db/properties";

export const DELETION_RECOVERY_DAYS = 30;
export const MAX_PORTABILITY_EXPORT_BYTES = 250 * 1024 * 1024;

export type PrivacyOverview = {
  auditEvents: number;
  comments: number;
  deletionRequestedAt: string | null;
  deletionScheduledAt: string | null;
  documentBytes: number;
  documents: number;
  members: number;
  properties: number;
};

export type ExportDocumentFile = {
  documentId: string;
  filename: string;
  mimeType: string;
  propertyReference: string;
  sha256: string;
  sizeBytes: number;
  storageKey: string;
  versionId: string;
};

type OrganizationPrivacyRow = {
  createdAt: string;
  deletionRequestedAt: string | null;
  deletionScheduledAt: string | null;
  id: string;
  name: string;
  slug: string;
  status: string;
  timezone: string;
  updatedAt: string;
};

export class PrivacyNotFoundError extends Error {}

export async function getPrivacyOverview(
  actor: ActorInput,
  organizationId: string,
): Promise<PrivacyOverview> {
  await requireOrganizationCapability(actor, organizationId, "data.export");
  const db = database();
  const row = await db
    .prepare(
      `SELECT
        o.deletion_requested_at AS deletionRequestedAt,
        o.deletion_scheduled_at AS deletionScheduledAt,
        (SELECT COUNT(*) FROM properties p
          WHERE p.organization_id = o.id) AS properties,
        (SELECT COUNT(*) FROM documents d
          WHERE d.organization_id = o.id) AS documents,
        (SELECT COALESCE(SUM(dv.size_bytes), 0)
          FROM document_versions dv
          INNER JOIN documents d
            ON d.organization_id = dv.organization_id
            AND d.id = dv.document_id
          INNER JOIN properties p
            ON p.organization_id = d.organization_id
            AND p.id = d.property_id
          WHERE dv.organization_id = o.id
            AND p.data_profile = 'pilot_anonymized'
            AND (
              dv.malware_scan_status = 'clean'
              OR (
                dv.malware_scan_status = 'structural_only'
                AND p.data_profile = 'pilot_anonymized'
              )
            )) AS documentBytes,
        (SELECT COUNT(*) FROM memberships m
          WHERE m.organization_id = o.id AND m.status = 'active') AS members,
        (SELECT COUNT(*) FROM comments c
          WHERE c.organization_id = o.id AND c.deleted_at IS NULL) AS comments,
        (SELECT COUNT(*) FROM audit_events ae
          WHERE ae.organization_id = o.id) AS auditEvents
       FROM organizations o
       WHERE o.id = ? AND o.status = 'active'
       LIMIT 1`,
    )
    .bind(organizationId)
    .first<PrivacyOverview>();
  if (!row) throw new PrivacyNotFoundError("El espacio no está disponible.");
  return {
    ...row,
    auditEvents: Number(row.auditEvents),
    comments: Number(row.comments),
    documentBytes: Number(row.documentBytes),
    documents: Number(row.documents),
    members: Number(row.members),
    properties: Number(row.properties),
  };
}

export async function buildOrganizationExport(
  actor: ActorInput,
  organizationId: string,
) {
  const membership = await requireOrganizationCapability(
    actor,
    organizationId,
    "data.export",
  );
  const db = database();
  const organization = await organizationPrivacyRow(db, organizationId);
  if (!organization) throw new PrivacyNotFoundError("El espacio no está disponible.");

  const queries: Record<string, string> = {
    auditEvents: `SELECT id, occurred_at, actor_user_id, actor_type, action,
      entity_type, entity_id, request_id, metadata_json
      FROM audit_events WHERE organization_id = ? ORDER BY occurred_at`,
    checklistItems: `SELECT * FROM checklist_items WHERE organization_id = ?
      ORDER BY checklist_id, position`,
    comments: `SELECT * FROM comments WHERE organization_id = ?
      ORDER BY property_id, created_at`,
    documents: `SELECT * FROM documents WHERE organization_id = ?
      ORDER BY property_id, created_at`,
    documentVersions: `SELECT id, organization_id, document_id,
      original_filename, mime_type, size_bytes, sha256, malware_scan_status,
      uploaded_by, uploaded_at, supersedes_id
      FROM document_versions WHERE organization_id = ? ORDER BY uploaded_at`,
    factDefinitions: `SELECT * FROM fact_definitions WHERE organization_id = ?
      ORDER BY fact_key`,
    invitations: `SELECT id, organization_id, email_normalized, role, scope,
      expires_at, accepted_at, revoked_at, invited_by, created_at
      FROM invitations WHERE organization_id = ? ORDER BY created_at`,
    invitationPropertyScopes: `SELECT * FROM invitation_property_scopes
      WHERE organization_id = ? ORDER BY invitation_id, property_id`,
    members: `SELECT m.id, m.organization_id, m.role, m.status,
      m.mfa_required, m.accepted_at, m.created_at, m.updated_at,
      u.id AS user_id, u.email, u.display_name, u.status AS user_status
      FROM memberships m INNER JOIN app_users u ON u.id = m.user_id
      WHERE m.organization_id = ? ORDER BY u.display_name COLLATE NOCASE`,
    notificationDeliveries: `SELECT id, organization_id, channel, template_key,
      recipient_email, entity_type, entity_id, status, scheduled_at, sent_at,
      error_code, attempt_count, last_attempt_at, next_attempt_at,
      provider_message_id, created_at, updated_at
      FROM notification_deliveries WHERE organization_id = ? ORDER BY created_at`,
    owners: `SELECT * FROM owners WHERE organization_id = ?
      ORDER BY display_name COLLATE NOCASE`,
    properties: `SELECT * FROM properties WHERE organization_id = ?
      ORDER BY created_at`,
    professionalReviews: `SELECT * FROM professional_reviews
      WHERE organization_id = ? ORDER BY property_id, reviewed_at`,
    evidenceLinks: `SELECT * FROM evidence_links
      WHERE organization_id = ? ORDER BY property_id, checklist_item_id, document_id`,
    propertyAccessGrants: `SELECT * FROM property_access_grants
      WHERE organization_id = ? ORDER BY property_id, user_id`,
    propertyChecklists: `SELECT * FROM property_checklists
      WHERE organization_id = ? ORDER BY property_id, generated_at`,
    propertyFacts: `SELECT * FROM property_facts WHERE organization_id = ?
      ORDER BY property_id, fact_key`,
    reminders: `SELECT * FROM reminders WHERE organization_id = ?
      ORDER BY created_at`,
    reminderSyncRuns: `SELECT * FROM reminder_sync_runs WHERE organization_id = ?
      ORDER BY started_at`,
    requirements: `SELECT * FROM requirements WHERE organization_id = ?
      ORDER BY stable_key`,
    rules: `SELECT * FROM rules WHERE organization_id = ? ORDER BY stable_key`,
    ruleVersions: `SELECT * FROM rule_versions WHERE organization_id = ?
      ORDER BY rule_id, version_number`,
    sourceReferences: `SELECT * FROM source_references WHERE organization_id = ?
      ORDER BY consulted_at`,
    ruleVersionSources: `SELECT * FROM rule_version_sources
      WHERE organization_id = ? ORDER BY rule_version_id, source_reference_id`,
    ruleSets: `SELECT * FROM rule_sets WHERE organization_id = ? ORDER BY stable_key`,
    ruleSetVersions: `SELECT * FROM rule_set_versions WHERE organization_id = ?
      ORDER BY rule_set_id, version_number`,
    ruleReviewEvents: `SELECT * FROM rule_review_events WHERE organization_id = ?
      ORDER BY created_at`,
    ruleSetVersionRules: `SELECT * FROM rule_set_version_rules
      WHERE organization_id = ? ORDER BY rule_set_version_id, position`,
    ruleEvaluations: `SELECT * FROM rule_evaluations WHERE organization_id = ?
      ORDER BY evaluated_at`,
    ruleEvaluationItems: `SELECT * FROM rule_evaluation_items
      WHERE organization_id = ? ORDER BY evaluation_id, created_at`,
  };
  const entries = await Promise.all(
    Object.entries(queries).map(async ([key, sql]) => {
      const result = await db.prepare(sql).bind(organizationId).all();
      return [key, result.results ?? []] as const;
    }),
  );
  const documentFiles = await exportDocumentFiles(db, organizationId);

  await db
    .prepare(
      `INSERT INTO audit_events (
        id, organization_id, actor_user_id, actor_type, action,
        entity_type, entity_id, metadata_json
      ) VALUES (?, ?, ?, 'user', 'data.exported', 'organization', ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      organizationId,
      membership.userId,
      organizationId,
      JSON.stringify({ format: "zip", scope: "organization" }),
    )
    .run();

  return {
    documentFiles,
    manifest: {
      data: Object.fromEntries(entries),
      export: {
        generatedAt: new Date().toISOString(),
        includes: [
          "datos estructurados",
          "historial de auditoría",
          "inventario documental",
          "archivos con control suficiente para su perfil de datos",
        ],
        schemaVersion: 1,
      },
      organization,
    },
  };
}

export async function requestOrganizationDeletion(
  actor: ActorInput,
  organizationId: string,
  confirmation: string,
): Promise<{ scheduledAt: string }> {
  const membership = await requireOrganizationCapability(
    actor,
    organizationId,
    "data.delete",
  );
  const db = database();
  const organization = await organizationPrivacyRow(db, organizationId);
  if (!organization) throw new PrivacyNotFoundError("El espacio no está disponible.");
  if (confirmation.trim() !== organization.name) {
    throw new ValidationError("Escribe exactamente el nombre del espacio.");
  }
  if (!organization.deletionScheduledAt) {
    await db.batch([
      db
        .prepare(
          `UPDATE organizations
           SET deletion_requested_at = CURRENT_TIMESTAMP,
               deletion_scheduled_at = datetime('now', '+${DELETION_RECOVERY_DAYS} days'),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = 'active'`,
        )
        .bind(organizationId),
      db
        .prepare(
          `INSERT INTO audit_events (
            id, organization_id, actor_user_id, actor_type, action,
            entity_type, entity_id, metadata_json
          ) VALUES (?, ?, ?, 'user', 'data.deletion_requested',
            'organization', ?, ?)` ,
        )
        .bind(
          crypto.randomUUID(),
          organizationId,
          membership.userId,
          organizationId,
          JSON.stringify({ recoveryDays: DELETION_RECOVERY_DAYS }),
        ),
    ]);
  }
  const scheduled = await db
    .prepare(
      "SELECT deletion_scheduled_at AS scheduledAt FROM organizations WHERE id = ?",
    )
    .bind(organizationId)
    .first<{ scheduledAt: string }>();
  if (!scheduled?.scheduledAt) {
    throw new Error("No se pudo programar la eliminación.");
  }
  return scheduled;
}

export async function cancelOrganizationDeletion(
  actor: ActorInput,
  organizationId: string,
): Promise<void> {
  const membership = await requireOrganizationCapability(
    actor,
    organizationId,
    "data.delete",
  );
  const db = database();
  const organization = await organizationPrivacyRow(db, organizationId);
  if (!organization) throw new PrivacyNotFoundError("El espacio no está disponible.");
  if (!organization.deletionScheduledAt) return;
  await db.batch([
    db
      .prepare(
        `UPDATE organizations
         SET deletion_requested_at = NULL, deletion_scheduled_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'active'`,
      )
      .bind(organizationId),
    db
      .prepare(
        `INSERT INTO audit_events (
          id, organization_id, actor_user_id, actor_type, action,
          entity_type, entity_id, metadata_json
        ) VALUES (?, ?, ?, 'user', 'data.deletion_cancelled',
          'organization', ?, '{}')`,
      )
      .bind(
        crypto.randomUUID(),
        organizationId,
        membership.userId,
        organizationId,
      ),
  ]);
}

export async function processScheduledOrganizationDeletions(): Promise<number> {
  await ensureCoreSchema();
  const db = database();
  const due = await db
    .prepare(
      `SELECT id FROM organizations
       WHERE status = 'active'
         AND deletion_scheduled_at IS NOT NULL
         AND deletion_scheduled_at <= CURRENT_TIMESTAMP
       ORDER BY deletion_scheduled_at
       LIMIT 20`,
    )
    .all<{ id: string }>();
  let deleted = 0;
  for (const organization of due.results ?? []) {
    await purgeOrganization(organization.id);
    deleted += 1;
  }
  return deleted;
}

async function purgeOrganization(organizationId: string): Promise<void> {
  const db = database();
  const keys = await db
    .prepare(
      "SELECT storage_key AS storageKey FROM document_versions WHERE organization_id = ?",
    )
    .bind(organizationId)
    .all<{ storageKey: string }>();
  const storageKeys = (keys.results ?? []).map((row) => row.storageKey);
  if (storageKeys.length > 0) {
    if (!env.DOCUMENTS) throw new Error("Private document storage is unavailable");
    for (let offset = 0; offset < storageKeys.length; offset += 1_000) {
      await env.DOCUMENTS.delete(storageKeys.slice(offset, offset + 1_000));
    }
  }
  await db.batch([
    db
      .prepare("DELETE FROM audit_events WHERE organization_id = ?")
      .bind(organizationId),
    db
      .prepare(
        `DELETE FROM organizations
         WHERE id = ? AND deletion_scheduled_at <= CURRENT_TIMESTAMP`,
      )
      .bind(organizationId),
  ]);
}

async function organizationPrivacyRow(
  db: D1Database,
  organizationId: string,
): Promise<OrganizationPrivacyRow | null> {
  return db
    .prepare(
      `SELECT id, name, slug, timezone, status,
        deletion_requested_at AS deletionRequestedAt,
        deletion_scheduled_at AS deletionScheduledAt,
        created_at AS createdAt, updated_at AS updatedAt
       FROM organizations WHERE id = ? AND status = 'active' LIMIT 1`,
    )
    .bind(organizationId)
    .first<OrganizationPrivacyRow>();
}

async function exportDocumentFiles(
  db: D1Database,
  organizationId: string,
): Promise<ExportDocumentFile[]> {
  const result = await db
    .prepare(
      `SELECT
        dv.id AS versionId,
        dv.document_id AS documentId,
        dv.storage_key AS storageKey,
        dv.original_filename AS filename,
        dv.mime_type AS mimeType,
        dv.size_bytes AS sizeBytes,
        dv.sha256,
        p.internal_reference AS propertyReference
       FROM document_versions dv
       INNER JOIN documents d
         ON d.organization_id = dv.organization_id AND d.id = dv.document_id
       INNER JOIN properties p
         ON p.organization_id = d.organization_id AND p.id = d.property_id
       WHERE dv.organization_id = ?
         AND p.data_profile = 'pilot_anonymized'
         AND (
           dv.malware_scan_status = 'clean'
           OR (
             dv.malware_scan_status = 'structural_only'
             AND p.data_profile = 'pilot_anonymized'
           )
         )
       ORDER BY p.internal_reference, dv.uploaded_at`,
    )
    .bind(organizationId)
    .all<ExportDocumentFile>();
  return result.results ?? [];
}

export function privacyErrorStatus(error: unknown): number {
  if (error instanceof AuthorizationError) return 403;
  if (error instanceof PrivacyNotFoundError) return 404;
  if (error instanceof ValidationError) return 400;
  return 500;
}
