import { env } from "cloudflare:workers";
import { validTaskDate } from "@/lib/checklist-plan";
import {propertyFieldErrors,type PropertyFieldErrors} from "@/lib/property-validation";
import { groupByKey } from "@/lib/dossier-volume";
import { isDownloadableSecurityState } from "@/lib/document-access-policy";
import {
  database,
  ensureCoreSchema,
  getMembershipContext,
  type ActorInput,
  type MembershipContext,
} from "@/db/organizations";
import {
  isIslandCode,
  islandName,
  municipalityNameForIsland,
  type IslandCode,
} from "@/lib/canary-data";
import {
  documentSecurityEngine,
  inspectDocumentSecurity,
} from "@/lib/document-security";
import { can, type Capability, type Role } from "@/lib/permissions";
import {
  directIdentifierLabel,
  isDataProfile,
  isPilotOwnerAlias,
  syntheticPropertyError,
  type DataProfile,
} from "@/lib/pilot-data";
import {
  deriveDossierStatus,
  type ChecklistWorkflowStatus,
  type ChecklistItemKind,
  type DossierStatus,
} from "@/lib/property-status";
import { hasPropertyAccessIn } from "@/db/property-access-core";

export class AuthorizationError extends Error {}
export class NotFoundError extends Error {}
export class ValidationError extends Error {}
export class PropertyFieldValidationError extends ValidationError {
  constructor(public fieldErrors:PropertyFieldErrors){super(Object.values(fieldErrors)[0]??"Revisa los campos indicados.");}
}

export type PropertyFilters = {
  archived?: boolean;
  island?: string;
  managerUserId?: string;
  municipality?: string;
  ownerId?: string;
  query?: string;
  status?: string;
};

export type PropertyListItem = {
  activityStatus: string;
  alias: string;
  dossierStatus: DossierStatus;
  dataProfile: DataProfile;
  id: string;
  internalReference: string;
  islandCode: string;
  managerUserId: string | null;
  managerName: string;
  municipality: string;
  nextAction: string | null;
  nextActionDueAt: string | null;
  ownerId: string;
  ownerName: string;
  pendingItems: number;
};

export type DashboardMetrics = {
  expiringSoon: number;
  incomplete: number;
  pendingDocuments: number;
  readyForReview: number;
  requiresReview: number;
  total: number;
  withoutResponsible: number;
};

export type OperationalAlert = {
  description: string;
  dueAt: string | null;
  id: string;
  kind:
    | "checklist_due"
    | "document_expiry"
    | "next_action_due"
    | "professional_review";
  propertyAlias: string;
  propertyId: string;
  responsible: string;
  severity: "attention" | "overdue" | "soon";
  title: string;
};

export type DownloadableDocument = {
  body: ReadableStream;
  filename: string;
  mimeType: string;
  sizeBytes: number;
};

export type DocumentSecurityCheckResult = {
  message: string;
  status: "available" | "rejected";
};

export type ChecklistItemRecord = {
  deletionBlocked?: number;
  itemKind?: ChecklistItemKind;
  assigneeUserId?: string | null;
  assigneeName: string | null;
  category: string;
  dueAt: string | null;
  explanation: string;
  id: string;
  position: number;
  title: string;
  workflowStatus: ChecklistWorkflowStatus;
};

export type DocumentRecord = {
  checklistItemId: string | null;
  currentVersionId: string;
  documentDate: string | null;
  documentType: string;
  expiresAt: string | null;
  id: string;
  malwareScanStatus: string;
  mimeType: string;
  originalFilename: string;
  sizeBytes: number;
  uploadedAt: string;
  versions: DocumentVersionRecord[];
  workflowStatus: string;
};

export type EvidenceLinkRecord = {
  assessedAt: string | null;
  assessedVersionId: string | null;
  checklistItemId: string;
  documentId: string;
  id: string;
  sufficiency: "unassessed" | "sufficient" | "insufficient";
  validity: "current" | "expired" | "unavailable" | "superseded";
};

export type ProfessionalReviewDecision =
  | "approved"
  | "rejected"
  | "changes_requested";

export type ProfessionalReviewRecord = {
  checklistItemId: string;
  decision: ProfessionalReviewDecision;
  documentId: string;
  documentType: string;
  documentVersionId: string;
  id: string;
  invalidatedAt: string | null;
  invalidationReason: string | null;
  observation: string;
  originalFilename: string;
  reviewedAt: string;
  reviewerName: string;
};

export type DocumentVersionRecord = {
  id: string;
  isCurrent: boolean;
  malwareScanStatus: string;
  originalFilename: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedByName: string;
};

export type CommentRecord = {
  authorName: string;
  body: string;
  createdAt: string;
  id: string;
  visibility: "internal" | "external";
};

export type PropertyDossier = {
  activityStatus: string;
  addressLine: string;
  alias: string;
  archivedAt: string | null;
  cadastralReference: string | null;
  checklist: {
    generatedAt: string;
    id: string;
    ruleVersionLabel: string;
    validationStatus: string;
  };
  checklistItems: ChecklistItemRecord[];
  comments: CommentRecord[];
  dossierStatus: DossierStatus;
  dataProfile: DataProfile;
  documents: DocumentRecord[];
  evidenceLinks: EvidenceLinkRecord[];
  id: string;
  internalReference: string;
  islandCode: string;
  managerName: string;
  municipality: string;
  nextAction: string | null;
  nextActionDueAt: string | null;
  organizationId: string;
  ownerEmail: string | null;
  ownerName: string;
  ownerPhone: string | null;
  postalCode: string;
  reviews: ProfessionalReviewRecord[];
};

export type CreateProfessionalReviewInput = {
  checklistItemId: string;
  decision: string;
  documentId: string;
  observation: string;
  organizationId: string;
  propertyId: string;
};

export type CreatePropertyInput = {
  activityStatus?: string;
  addressLine: string;
  alias: string;
  cadastralReference?: string;
  dataProfile?: string;
  islandCode: string;
  municipality: string;
  nextAction?: string;
  nextActionDueAt?: string;
  organizationId: string;
  ownerEmail?: string;
  ownerName: string;
  ownerPhone?: string;
  postalCode: string;
};

export type UpdatePropertyInput = CreatePropertyInput & {
  managerUserId?: string;
  propertyId: string;
};

export type PropertyManagerOption = {
  id: string;
  isCurrent: boolean;
  name: string;
};

export type UploadDocumentInput = {
  anonymizationConfirmed?: boolean;
  checklistItemId?: string;
  checklistItemIds?: string[];
  documentDate?: string;
  documentType: string;
  expiresAt?: string;
  file: File;
  notes?: string;
  organizationId: string;
  propertyId: string;
};

export type ReplaceDocumentVersionInput = {
  anonymizationConfirmed?: boolean;
  documentId: string;
  file: File;
  organizationId: string;
  propertyId: string;
};

const checklistTemplate = [
  {
    category: "Datos del expediente",
    explanation:
      "Comprueba que la información básica aportada está completa y actualizada.",
    title: "Completar los datos básicos del expediente",
  },
  {
    category: "Evidencias",
    explanation:
      "Añade la documentación identificativa disponible. Este elemento no define un requisito jurídico.",
    title: "Reunir la documentación identificativa disponible",
  },
  {
    category: "Fechas",
    explanation:
      "Registra las fechas conocidas para poder preparar avisos y revisiones.",
    title: "Registrar fechas relevantes y vencimientos",
  },
  {
    category: "Responsabilidad",
    explanation:
      "Asigna la siguiente acción a una persona de la organización.",
    title: "Designar responsable de la siguiente acción",
  },
  {
    category: "Revisión",
    explanation:
      "Solicita revisión cuando la documentación esté preparada. No equivale a una certificación.",
    title: "Preparar el expediente para revisión profesional",
  },
] as const;

let propertyInitialization: Promise<void> | null = null;

export async function ensurePropertySchema(): Promise<void> {
  if (process.env.NODE_ENV !== "development") {
    return;
  }
  await ensureCoreSchema();
  if (propertyInitialization) return propertyInitialization;
  const db = database();

  propertyInitialization = db
    .batch([
      db.prepare(
        `CREATE TABLE IF NOT EXISTS owners (
          id TEXT PRIMARY KEY NOT NULL,
          organization_id TEXT NOT NULL,
          display_name TEXT NOT NULL,
          email TEXT,
          phone TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          UNIQUE (organization_id, id)
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS properties (
          id TEXT PRIMARY KEY NOT NULL,
          organization_id TEXT NOT NULL,
          alias TEXT NOT NULL,
          internal_reference TEXT NOT NULL,
          address_line TEXT NOT NULL,
          island_code TEXT NOT NULL,
          municipality TEXT NOT NULL,
          postal_code TEXT NOT NULL,
          cadastral_reference TEXT,
          data_profile TEXT NOT NULL DEFAULT 'standard',
          owner_id TEXT NOT NULL,
          manager_user_id TEXT,
          activity_status TEXT NOT NULL DEFAULT 'not_started',
          dossier_status TEXT NOT NULL DEFAULT 'incomplete',
          next_action TEXT,
          next_action_due_at TEXT,
          archived_at TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          FOREIGN KEY (manager_user_id) REFERENCES app_users(id) ON DELETE SET NULL,
          FOREIGN KEY (organization_id, owner_id) REFERENCES owners(organization_id, id),
          UNIQUE (organization_id, id),
          UNIQUE (organization_id, internal_reference)
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS property_checklists (
          id TEXT PRIMARY KEY NOT NULL,
          organization_id TEXT NOT NULL,
          property_id TEXT NOT NULL,
          rule_version_label TEXT NOT NULL,
          validation_status TEXT NOT NULL DEFAULT 'draft_unvalidated',
          status TEXT NOT NULL DEFAULT 'active',
          generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          generated_by TEXT NOT NULL,
          engine_version TEXT NOT NULL,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          FOREIGN KEY (generated_by) REFERENCES app_users(id),
          FOREIGN KEY (organization_id, property_id) REFERENCES properties(organization_id, id),
          UNIQUE (organization_id, id)
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS property_access_grants (
          organization_id TEXT NOT NULL,
          property_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          access_role TEXT NOT NULL,
          expires_at TEXT,
          revoked_at TEXT,
          granted_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (organization_id, property_id, user_id),
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
          FOREIGN KEY (granted_by) REFERENCES app_users(id),
          FOREIGN KEY (organization_id, property_id) REFERENCES properties(organization_id, id)
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS checklist_items (
          id TEXT PRIMARY KEY NOT NULL,
          organization_id TEXT NOT NULL,
          checklist_id TEXT NOT NULL,
          title TEXT NOT NULL,
          category TEXT NOT NULL,
          explanation TEXT NOT NULL,
          item_kind TEXT NOT NULL DEFAULT 'professional_requirement',
          workflow_status TEXT NOT NULL DEFAULT 'pending',
          assignee_user_id TEXT,
          due_at TEXT,
          position INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          FOREIGN KEY (assignee_user_id) REFERENCES app_users(id) ON DELETE SET NULL,
          FOREIGN KEY (organization_id, checklist_id) REFERENCES property_checklists(organization_id, id)
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS documents (
          id TEXT PRIMARY KEY NOT NULL,
          organization_id TEXT NOT NULL,
          property_id TEXT NOT NULL,
          checklist_item_id TEXT,
          document_type TEXT NOT NULL,
          document_date TEXT,
          expires_at TEXT,
          workflow_status TEXT NOT NULL DEFAULT 'quarantined',
          notes TEXT NOT NULL DEFAULT '',
          current_version_id TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          FOREIGN KEY (organization_id, property_id) REFERENCES properties(organization_id, id),
          UNIQUE (organization_id, id)
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS document_versions (
          id TEXT PRIMARY KEY NOT NULL,
          organization_id TEXT NOT NULL,
          document_id TEXT NOT NULL,
          storage_key TEXT NOT NULL UNIQUE,
          original_filename TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          sha256 TEXT NOT NULL,
          malware_scan_status TEXT NOT NULL DEFAULT 'pending',
          uploaded_by TEXT NOT NULL,
          uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          supersedes_id TEXT,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          FOREIGN KEY (uploaded_by) REFERENCES app_users(id),
          FOREIGN KEY (organization_id, document_id) REFERENCES documents(organization_id, id)
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS professional_reviews (
          id TEXT PRIMARY KEY NOT NULL,
          organization_id TEXT NOT NULL,
          property_id TEXT NOT NULL,
          checklist_item_id TEXT NOT NULL,
          document_id TEXT NOT NULL,
          document_version_id TEXT NOT NULL,
          reviewer_user_id TEXT NOT NULL,
          decision TEXT NOT NULL,
          observation TEXT NOT NULL,
          reviewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          invalidated_at TEXT,
          invalidation_reason TEXT,
          invalidated_by_version_id TEXT,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          FOREIGN KEY (reviewer_user_id) REFERENCES app_users(id),
          FOREIGN KEY (organization_id, property_id) REFERENCES properties(organization_id, id),
          FOREIGN KEY (organization_id, checklist_item_id) REFERENCES checklist_items(organization_id, id),
          FOREIGN KEY (organization_id, document_id) REFERENCES documents(organization_id, id),
          FOREIGN KEY (organization_id, document_version_id) REFERENCES document_versions(organization_id, id)
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS evidence_links (
          id TEXT PRIMARY KEY NOT NULL,
          organization_id TEXT NOT NULL,
          property_id TEXT NOT NULL,
          checklist_item_id TEXT NOT NULL,
          document_id TEXT NOT NULL,
          sufficiency TEXT NOT NULL DEFAULT 'unassessed',
          assessed_version_id TEXT,
          assessed_at TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (organization_id, property_id) REFERENCES properties(organization_id, id),
          FOREIGN KEY (organization_id, checklist_item_id) REFERENCES checklist_items(organization_id, id),
          FOREIGN KEY (organization_id, document_id) REFERENCES documents(organization_id, id)
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS comments (
          id TEXT PRIMARY KEY NOT NULL,
          organization_id TEXT NOT NULL,
          property_id TEXT NOT NULL,
          checklist_item_id TEXT,
          visibility TEXT NOT NULL DEFAULT 'internal',
          body TEXT NOT NULL,
          author_user_id TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          edited_at TEXT,
          deleted_at TEXT,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          FOREIGN KEY (author_user_id) REFERENCES app_users(id),
          FOREIGN KEY (organization_id, property_id) REFERENCES properties(organization_id, id)
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS reminders (
          id TEXT PRIMARY KEY NOT NULL,
          organization_id TEXT NOT NULL,
          property_id TEXT NOT NULL,
          target_type TEXT NOT NULL,
          target_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          due_at TEXT,
          channel TEXT NOT NULL DEFAULT 'in_app',
          recipient_user_id TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          deduplication_key TEXT NOT NULL UNIQUE,
          last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          resolved_at TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          FOREIGN KEY (recipient_user_id) REFERENCES app_users(id) ON DELETE SET NULL,
          FOREIGN KEY (organization_id, property_id) REFERENCES properties(organization_id, id)
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS reminder_sync_runs (
          id TEXT PRIMARY KEY NOT NULL,
          organization_id TEXT NOT NULL,
          run_date TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'running',
          candidate_count INTEGER NOT NULL DEFAULT 0,
          active_count INTEGER NOT NULL DEFAULT 0,
          started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          completed_at TEXT,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          UNIQUE (organization_id, run_date)
        )`,
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS owners_org_name_idx ON owners(organization_id, display_name)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS properties_org_status_idx ON properties(organization_id, dossier_status)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS properties_org_island_idx ON properties(organization_id, island_code)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS property_checklists_property_idx ON property_checklists(organization_id, property_id)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS property_access_user_idx ON property_access_grants(user_id)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS checklist_items_checklist_idx ON checklist_items(organization_id, checklist_id, position)",
      ),
      db.prepare(
        "CREATE UNIQUE INDEX IF NOT EXISTS checklist_items_org_id_uidx ON checklist_items(organization_id, id)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS documents_property_idx ON documents(organization_id, property_id)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS documents_expiry_idx ON documents(organization_id, expires_at)",
      ),
      db.prepare(
        "CREATE UNIQUE INDEX IF NOT EXISTS document_versions_org_id_uidx ON document_versions(organization_id, id)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS professional_reviews_property_idx ON professional_reviews(organization_id, property_id, reviewed_at)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS professional_reviews_item_idx ON professional_reviews(organization_id, checklist_item_id, invalidated_at)",
      ),
      db.prepare(
        "CREATE UNIQUE INDEX IF NOT EXISTS professional_reviews_active_item_uidx ON professional_reviews(organization_id, checklist_item_id) WHERE invalidated_at IS NULL",
      ),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS evidence_links_org_item_document_uidx ON evidence_links(organization_id, checklist_item_id, document_id)"),
      db.prepare("CREATE INDEX IF NOT EXISTS evidence_links_property_idx ON evidence_links(organization_id, property_id)"),
      db.prepare("CREATE INDEX IF NOT EXISTS evidence_links_document_idx ON evidence_links(organization_id, document_id)"),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS comments_property_idx ON comments(organization_id, property_id, created_at)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS reminders_org_status_idx ON reminders(organization_id, status)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS reminders_recipient_status_idx ON reminders(recipient_user_id, status)",
      ),
      db.prepare("PRAGMA optimize"),
    ])
    .then(async () => {
      const columns = await db
        .prepare("PRAGMA table_info(properties)")
        .all<{ name: string }>();
      const existing = new Set(
        (columns.results ?? []).map((column) => column.name),
      );
      if (!existing.has("data_profile")) {
        await db
          .prepare(
            "ALTER TABLE properties ADD COLUMN data_profile TEXT NOT NULL DEFAULT 'standard'",
          )
          .run();
      }
      await db.prepare("PRAGMA optimize").run();
      const taskColumns=await db.prepare("PRAGMA table_info(checklist_items)").all<{name:string}>();
      if(!(taskColumns.results??[]).some(column=>column.name==="item_kind"))await db.prepare("ALTER TABLE checklist_items ADD COLUMN item_kind TEXT NOT NULL DEFAULT 'professional_requirement'").run();
    })
    .catch((error: unknown) => {
      propertyInitialization = null;
      throw error;
    });

  return propertyInitialization!;
}

// Migración perezosa y repetible de las relaciones anteriores (un documento, un requisito).
// La columna heredada se conserva para poder leer expedientes históricos; el grafo es la fuente actual.
async function syncLegacyEvidenceLinksIn(
  db: D1Database,
  organizationId: string,
  propertyId: string,
): Promise<void> {
  await db.prepare(
    `INSERT OR IGNORE INTO evidence_links (
      id, organization_id, property_id, checklist_item_id, document_id,
      sufficiency, assessed_version_id, assessed_at
    )
    SELECT d.id || ':' || ci.id, d.organization_id, d.property_id,
      ci.id, d.id,
      CASE WHEN pr.decision = 'approved' THEN 'sufficient'
           WHEN pr.id IS NOT NULL THEN 'insufficient'
           ELSE 'unassessed' END,
      pr.document_version_id, pr.reviewed_at
    FROM documents d
    INNER JOIN checklist_items ci
      ON ci.organization_id = d.organization_id AND ci.id = d.checklist_item_id
    INNER JOIN property_checklists pc
      ON pc.organization_id = ci.organization_id AND pc.id = ci.checklist_id
      AND pc.property_id = d.property_id AND pc.status = 'active'
    LEFT JOIN professional_reviews pr
      ON pr.organization_id = d.organization_id
      AND pr.checklist_item_id = ci.id AND pr.document_id = d.id
      AND pr.invalidated_at IS NULL
    WHERE d.organization_id = ? AND d.property_id = ?
      AND d.checklist_item_id IS NOT NULL`,
  ).bind(organizationId, propertyId).run();
}

export async function listProperties(
  actor: ActorInput,
  organizationId: string,
  filters: PropertyFilters = {},
): Promise<PropertyListItem[]> {
  await ensurePropertySchema();
  const membership = await authorize(actor, organizationId, "property.read");
  const db = database();
  const clauses = ["p.organization_id = ?"];
  const bindings: unknown[] = [organizationId];

  if (
    membership.role === "professional" ||
    membership.role === "owner"
  ) {
    clauses.push(
      `EXISTS (
        SELECT 1 FROM property_access_grants pag
        WHERE pag.organization_id = p.organization_id
          AND pag.property_id = p.id
          AND pag.user_id = ?
          AND pag.revoked_at IS NULL
          AND (pag.expires_at IS NULL OR pag.expires_at > CURRENT_TIMESTAMP)
      )`,
    );
    bindings.push(membership.userId);
  }
  if (filters.archived) {
    clauses.push("p.archived_at IS NOT NULL");
  } else {
    clauses.push("p.archived_at IS NULL");
  }
  if (filters.island && isIslandCode(filters.island)) {
    clauses.push("p.island_code = ?");
    bindings.push(filters.island);
  }
  if (filters.municipality?.trim()) {
    clauses.push("p.municipality = ?");
    bindings.push(filters.municipality.trim().slice(0, 100));
  }
  if (filters.ownerId?.trim()) {
    clauses.push("p.owner_id = ?");
    bindings.push(filters.ownerId.trim().slice(0, 64));
  }
  if (filters.managerUserId === "unassigned") {
    clauses.push("p.manager_user_id IS NULL");
  } else if (filters.managerUserId?.trim()) {
    clauses.push("p.manager_user_id = ?");
    bindings.push(filters.managerUserId.trim().slice(0, 64));
  }
  if (
    filters.status &&
    [
      "incomplete",
      "pending_documents",
      "requires_professional_review",
      "ready_for_review",
      "professionally_reviewed",
    ].includes(filters.status)
  ) {
    clauses.push("p.dossier_status = ?");
    bindings.push(filters.status);
  }
  if (filters.query?.trim()) {
    clauses.push(
      "(p.alias LIKE ? OR p.internal_reference LIKE ? OR p.municipality LIKE ? OR o.display_name LIKE ?)",
    );
    const query = `%${filters.query.trim().slice(0, 80)}%`;
    bindings.push(query, query, query, query);
  }

  const result = await db
    .prepare(
      `SELECT
        p.id,
        p.alias,
        p.internal_reference AS internalReference,
        p.island_code AS islandCode,
        p.municipality,
        p.activity_status AS activityStatus,
        p.dossier_status AS dossierStatus,
        p.data_profile AS dataProfile,
        p.next_action AS nextAction,
        p.next_action_due_at AS nextActionDueAt,
        p.owner_id AS ownerId,
        p.manager_user_id AS managerUserId,
        o.display_name AS ownerName,
        COALESCE(u.display_name, 'Sin responsable') AS managerName,
        (
          SELECT COUNT(*)
          FROM checklist_items ci
          INNER JOIN property_checklists pc ON pc.id = ci.checklist_id
          WHERE pc.organization_id = p.organization_id
            AND pc.property_id = p.id
            AND pc.status = 'active'
            AND ci.workflow_status IN ('pending', 'document_requested')
        ) AS pendingItems
      FROM properties p
      INNER JOIN owners o
        ON o.organization_id = p.organization_id AND o.id = p.owner_id
      LEFT JOIN app_users u ON u.id = p.manager_user_id
      WHERE ${clauses.join(" AND ")}
      ORDER BY
        CASE p.dossier_status
          WHEN 'requires_professional_review' THEN 1
          WHEN 'pending_documents' THEN 2
          WHEN 'incomplete' THEN 3
          WHEN 'ready_for_review' THEN 4
          ELSE 5
        END,
        p.updated_at DESC`,
    )
    .bind(...bindings)
    .all<PropertyListItem>();

  return result.results ?? [];
}

export async function getDashboardMetrics(
  actor: ActorInput,
  organizationId: string,
): Promise<DashboardMetrics> {
  await ensurePropertySchema();
  const membership = await authorize(actor, organizationId, "property.read");
  const externalRole =
    membership.role === "professional" || membership.role === "owner";
  const accessClause = externalRole
    ? `AND EXISTS (
        SELECT 1 FROM property_access_grants pag
        WHERE pag.organization_id = properties.organization_id
          AND pag.property_id = properties.id
          AND pag.user_id = ?
          AND pag.revoked_at IS NULL
          AND (pag.expires_at IS NULL OR pag.expires_at > CURRENT_TIMESTAMP)
      )`
    : "";
  const row = await database()
    .prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN dossier_status = 'incomplete' THEN 1 ELSE 0 END) AS incomplete,
        SUM(CASE WHEN dossier_status = 'pending_documents' THEN 1 ELSE 0 END) AS pendingDocuments,
        SUM(CASE WHEN dossier_status = 'requires_professional_review' THEN 1 ELSE 0 END) AS requiresReview,
        SUM(CASE WHEN dossier_status = 'ready_for_review' THEN 1 ELSE 0 END) AS readyForReview,
        SUM(CASE WHEN manager_user_id IS NULL THEN 1 ELSE 0 END) AS withoutResponsible,
        SUM(CASE WHEN EXISTS (
          SELECT 1
          FROM documents d
          WHERE d.organization_id = properties.organization_id
            AND d.property_id = properties.id
            AND d.workflow_status != 'archived'
            AND d.expires_at IS NOT NULL
            AND date(d.expires_at) BETWEEN date('now') AND date('now', '+30 days')
        ) THEN 1 ELSE 0 END) AS expiringSoon
      FROM properties
      WHERE organization_id = ?
        AND archived_at IS NULL
        ${accessClause}`,
    )
    .bind(...(externalRole
      ? [organizationId, membership.userId]
      : [organizationId]))
    .first<Record<keyof DashboardMetrics, number | null>>();

  return {
    expiringSoon: Number(row?.expiringSoon ?? 0),
    incomplete: Number(row?.incomplete ?? 0),
    pendingDocuments: Number(row?.pendingDocuments ?? 0),
    readyForReview: Number(row?.readyForReview ?? 0),
    requiresReview: Number(row?.requiresReview ?? 0),
    total: Number(row?.total ?? 0),
    withoutResponsible: Number(row?.withoutResponsible ?? 0),
  };
}

export async function listOperationalAlerts(
  actor: ActorInput,
  organizationId: string,
): Promise<OperationalAlert[]> {
  await ensurePropertySchema();
  const membership = await authorize(actor, organizationId, "property.read");
  const db = database();
  const externalRole =
    membership.role === "professional" || membership.role === "owner";
  const accessClause = externalRole
    ? `AND EXISTS (
        SELECT 1 FROM property_access_grants pag
        WHERE pag.organization_id = p.organization_id
          AND pag.property_id = p.id
          AND pag.user_id = ?
          AND pag.revoked_at IS NULL
          AND (pag.expires_at IS NULL OR pag.expires_at > CURRENT_TIMESTAMP)
      )`
    : "";
  const bindings = externalRole
    ? [organizationId, membership.userId]
    : [organizationId];

  type AlertRow = {
    dueAt: string | null;
    propertyAlias: string;
    propertyId: string;
    responsible: string;
    sourceId: string;
    sourceTitle: string | null;
  };

  const [documents, checklist, actions, reviews] = await Promise.all([
    db
      .prepare(
        `SELECT
          d.id AS sourceId,
          d.document_type AS sourceTitle,
          d.expires_at AS dueAt,
          p.id AS propertyId,
          p.alias AS propertyAlias,
          COALESCE(u.display_name, 'Sin responsable') AS responsible
        FROM documents d
        INNER JOIN properties p
          ON p.organization_id = d.organization_id AND p.id = d.property_id
        LEFT JOIN app_users u ON u.id = p.manager_user_id
        WHERE p.organization_id = ?
          AND p.archived_at IS NULL
          AND d.workflow_status != 'archived'
          AND d.expires_at IS NOT NULL
          AND date(d.expires_at) <= date('now', '+30 days')
          ${accessClause}
        ORDER BY date(d.expires_at), p.alias`,
      )
      .bind(...bindings)
      .all<AlertRow>(),
    db
      .prepare(
        `SELECT
          ci.id AS sourceId,
          ci.title AS sourceTitle,
          ci.due_at AS dueAt,
          ci.assignee_user_id AS assigneeUserId,
          p.id AS propertyId,
          p.alias AS propertyAlias,
          COALESCE(assignee.display_name, manager.display_name, 'Sin responsable') AS responsible
        FROM checklist_items ci
        INNER JOIN property_checklists pc
          ON pc.organization_id = ci.organization_id AND pc.id = ci.checklist_id
        INNER JOIN properties p
          ON p.organization_id = pc.organization_id AND p.id = pc.property_id
        LEFT JOIN app_users assignee ON assignee.id = ci.assignee_user_id
        LEFT JOIN app_users manager ON manager.id = p.manager_user_id
        WHERE p.organization_id = ?
          AND p.archived_at IS NULL
          AND pc.status = 'active'
          AND ci.workflow_status NOT IN ('reviewed', 'closed')
          AND ci.due_at IS NOT NULL
          AND date(ci.due_at) <= date('now', '+30 days')
          ${accessClause}
        ORDER BY date(ci.due_at), p.alias`,
      )
      .bind(...bindings)
      .all<AlertRow>(),
    db
      .prepare(
        `SELECT
          p.id AS sourceId,
          p.next_action AS sourceTitle,
          p.next_action_due_at AS dueAt,
          p.id AS propertyId,
          p.alias AS propertyAlias,
          COALESCE(u.display_name, 'Sin responsable') AS responsible
        FROM properties p
        LEFT JOIN app_users u ON u.id = p.manager_user_id
        WHERE p.organization_id = ?
          AND p.archived_at IS NULL
          AND p.next_action_due_at IS NOT NULL
          AND date(p.next_action_due_at) <= date('now', '+30 days')
          ${accessClause}
        ORDER BY date(p.next_action_due_at), p.alias`,
      )
      .bind(...bindings)
      .all<AlertRow>(),
    db
      .prepare(
        `SELECT
          p.id AS sourceId,
          p.next_action AS sourceTitle,
          NULL AS dueAt,
          p.id AS propertyId,
          p.alias AS propertyAlias,
          COALESCE(u.display_name, 'Sin responsable') AS responsible
        FROM properties p
        LEFT JOIN app_users u ON u.id = p.manager_user_id
        WHERE p.organization_id = ?
          AND p.archived_at IS NULL
          AND p.dossier_status = 'requires_professional_review'
          ${accessClause}
        ORDER BY p.updated_at DESC`,
      )
      .bind(...bindings)
      .all<AlertRow>(),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const datedAlert = (
    row: AlertRow,
    kind: OperationalAlert["kind"],
    title: string,
    description: string,
  ): OperationalAlert => ({
    description,
    dueAt: row.dueAt,
    id: `${kind}:${row.sourceId}`,
    kind,
    propertyAlias: row.propertyAlias,
    propertyId: row.propertyId,
    responsible: row.responsible,
    severity:
      row.dueAt && row.dueAt.slice(0, 10) < today ? "overdue" : "soon",
    title,
  });

  return [
    ...(documents.results ?? []).map((row) =>
      datedAlert(
        row,
        "document_expiry",
        row.sourceTitle ?? "Documento",
        "El documento necesita atención por su fecha de vencimiento.",
      ),
    ),
    ...(checklist.results ?? []).map((row) =>
      datedAlert(
        row,
        "checklist_due",
        row.sourceTitle ?? "Tarea del checklist",
        "La tarea del expediente tiene una fecha objetivo próxima o vencida.",
      ),
    ),
    ...(actions.results ?? []).map((row) =>
      datedAlert(
        row,
        "next_action_due",
        row.sourceTitle ?? "Siguiente acción",
        "La siguiente acción asignada a la vivienda necesita seguimiento.",
      ),
    ),
    ...(reviews.results ?? []).map(
      (row): OperationalAlert => ({
        description:
          "El expediente contiene incertidumbre o evidencia que requiere criterio profesional.",
        dueAt: null,
        id: `professional_review:${row.sourceId}`,
        kind: "professional_review",
        propertyAlias: row.propertyAlias,
        propertyId: row.propertyId,
        responsible: row.responsible,
        severity: "attention",
        title: "Revisión profesional necesaria",
      }),
    ),
  ].sort((left, right) => {
    const severityOrder = { overdue: 0, soon: 1, attention: 2 };
    const severityDifference =
      severityOrder[left.severity] - severityOrder[right.severity];
    if (severityDifference !== 0) return severityDifference;
    return (left.dueAt ?? "9999").localeCompare(right.dueAt ?? "9999");
  });
}

export async function createProperty(
  actor: ActorInput,
  input: CreatePropertyInput,
): Promise<{ id: string }> {
  await ensurePropertySchema();
  const membership = await authorize(
    actor,
    input.organizationId,
    "property.create",
  );
  const values = validateProperty(input);
  const db = database();
  const propertyId = crypto.randomUUID();
  const ownerId = crypto.randomUUID();
  const checklistId = crypto.randomUUID();
  const internalReference = `VV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO owners (
          id, organization_id, display_name, email, phone
        ) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        ownerId,
        input.organizationId,
        values.ownerName,
        values.ownerEmail,
        values.ownerPhone,
      ),
    db
      .prepare(
        `INSERT INTO properties (
          id, organization_id, alias, internal_reference, address_line,
          island_code, municipality, postal_code, cadastral_reference,
          data_profile, owner_id, manager_user_id, activity_status, dossier_status,
          next_action, next_action_due_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_documents', ?, ?)`,
      )
      .bind(
        propertyId,
        input.organizationId,
        values.alias,
        internalReference,
        values.addressLine,
        values.islandCode,
        values.municipality,
        values.postalCode,
        values.cadastralReference,
        values.dataProfile,
        ownerId,
        membership.userId,
        values.activityStatus,
        values.nextAction,
        values.nextActionDueAt,
      ),
    db
      .prepare(
        `INSERT INTO property_checklists (
          id, organization_id, property_id, rule_version_label,
          validation_status, status, generated_by, engine_version
        ) VALUES (?, ?, ?, 'VV-DEMO · 0.1', 'draft_unvalidated',
          'active', ?, 'manual-pilot-1')`,
      )
      .bind(checklistId, input.organizationId, propertyId, membership.userId),
  ];

  checklistTemplate.forEach((item, index) => {
    statements.push(
      db
        .prepare(
          `INSERT INTO checklist_items (
            id, organization_id, checklist_id, title, category,
            explanation, workflow_status, assignee_user_id, position, item_kind
          ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, 'operational')`,
        )
        .bind(
          crypto.randomUUID(),
          input.organizationId,
          checklistId,
          item.title,
          item.category,
          item.explanation,
          membership.userId,
          index + 1,
        ),
    );
  });

  statements.push(
    auditStatement(db, membership, "property.created", "property", propertyId, {
      islandCode: values.islandCode,
      dataProfile: values.dataProfile,
      source: "property_onboarding",
    }),
  );

  await db.batch(statements);
  return { id: propertyId };
}

export async function listAssignablePropertyManagers(
  actor: ActorInput,
  organizationId: string,
  propertyId: string,
): Promise<PropertyManagerOption[]> {
  await ensurePropertySchema();
  const membership = await authorize(actor, organizationId, "property.update");
  const db = database();
  await assertPropertyAccess(db, membership, propertyId);
  const result = await db
    .prepare(
      `SELECT DISTINCT
        u.id,
        CASE WHEN p.manager_user_id = u.id THEN 1 ELSE 0 END AS isCurrent,
        u.display_name AS name
      FROM memberships m
      INNER JOIN app_users u ON u.id = m.user_id
      INNER JOIN properties p
        ON p.organization_id = m.organization_id AND p.id = ?
      WHERE m.organization_id = ?
        AND m.status = 'active'
        AND u.status = 'active'
        AND (
          m.role IN ('organization_admin', 'manager')
          OR EXISTS (
            SELECT 1
            FROM property_access_grants pag
            WHERE pag.organization_id = m.organization_id
              AND pag.property_id = p.id
              AND pag.user_id = m.user_id
              AND pag.revoked_at IS NULL
              AND (pag.expires_at IS NULL OR pag.expires_at >= CURRENT_TIMESTAMP)
          )
        )
      ORDER BY u.display_name COLLATE NOCASE`,
    )
    .bind(propertyId, organizationId)
    .all<Omit<PropertyManagerOption, "isCurrent"> & { isCurrent: number }>();
  return (result.results ?? []).map((manager) => ({
    ...manager,
    isCurrent: Boolean(manager.isCurrent),
  }));
}

export async function updateProperty(
  actor: ActorInput,
  input: UpdatePropertyInput,
): Promise<void> {
  await ensurePropertySchema();
  const membership = await authorize(
    actor,
    input.organizationId,
    "property.update",
  );
  const values = validateProperty(input, {
    defaultNextAction: false,
    permitStandardProfile: true,
  });
  const db = database();
  await assertPropertyAccess(db, membership, input.propertyId);
  const current = await db
    .prepare(
      `SELECT
        p.alias,
        p.address_line AS addressLine,
        p.island_code AS islandCode,
        p.municipality,
        p.postal_code AS postalCode,
        p.cadastral_reference AS cadastralReference,
        p.data_profile AS dataProfile,
        p.activity_status AS activityStatus,
        p.next_action AS nextAction,
        p.next_action_due_at AS nextActionDueAt,
        p.manager_user_id AS managerUserId,
        p.archived_at AS archivedAt,
        o.display_name AS ownerName,
        o.email AS ownerEmail,
        o.phone AS ownerPhone
      FROM properties p
      INNER JOIN owners o
        ON o.organization_id = p.organization_id AND o.id = p.owner_id
      WHERE p.organization_id = ? AND p.id = ?
      LIMIT 1`,
    )
    .bind(input.organizationId, input.propertyId)
    .first<{
      activityStatus: string;
      addressLine: string;
      alias: string;
      archivedAt: string | null;
      cadastralReference: string | null;
      dataProfile: DataProfile;
      islandCode: string;
      managerUserId: string | null;
      municipality: string;
      nextAction: string | null;
      nextActionDueAt: string | null;
      ownerEmail: string | null;
      ownerName: string;
      ownerPhone: string | null;
      postalCode: string;
    }>();
  if (!current) throw new NotFoundError("Vivienda no encontrada.");
  if (current.archivedAt) {
    throw new ValidationError("No se puede editar una vivienda archivada.");
  }
  if (current.dataProfile !== values.dataProfile) {
    throw new ValidationError(
      "El perfil de datos no puede cambiarse desde la edición del expediente.",
    );
  }

  const managerUserId = cleanOptional(input.managerUserId, 128);
  if (managerUserId) {
    const assignable = await db
      .prepare(
        `SELECT m.user_id AS userId
         FROM memberships m
         WHERE m.organization_id = ?
           AND m.user_id = ?
           AND m.status = 'active'
           AND (
             m.role IN ('organization_admin', 'manager')
             OR EXISTS (
               SELECT 1
               FROM property_access_grants pag
               WHERE pag.organization_id = m.organization_id
                 AND pag.property_id = ?
                 AND pag.user_id = m.user_id
                 AND pag.revoked_at IS NULL
                 AND (pag.expires_at IS NULL OR pag.expires_at >= CURRENT_TIMESTAMP)
             )
           )
         LIMIT 1`,
      )
      .bind(input.organizationId, managerUserId, input.propertyId)
      .first();
    if (!assignable) {
      throw new ValidationError(
        "Selecciona una persona con acceso activo a esta vivienda.",
      );
    }
  }

  const nextValues = {
    activityStatus: values.activityStatus,
    addressLine: values.addressLine,
    alias: values.alias,
    cadastralReference: values.cadastralReference,
    islandCode: values.islandCode,
    managerUserId,
    municipality: values.municipality,
    nextAction: values.nextAction,
    nextActionDueAt: values.nextActionDueAt,
    ownerEmail: values.ownerEmail,
    ownerName: values.ownerName,
    ownerPhone: values.ownerPhone,
    postalCode: values.postalCode,
  };
  const changedFields = Object.entries(nextValues)
    .filter(([key, value]) => current[key as keyof typeof current] !== value)
    .map(([key]) => key);
  if (changedFields.length === 0) return;

  await db.batch([
    db
      .prepare(
        `UPDATE owners
         SET display_name = ?, email = ?, phone = ?, updated_at = CURRENT_TIMESTAMP
         WHERE organization_id = ?
           AND id = (
             SELECT owner_id FROM properties
             WHERE organization_id = ? AND id = ?
           )`,
      )
      .bind(
        values.ownerName,
        values.ownerEmail,
        values.ownerPhone,
        input.organizationId,
        input.organizationId,
        input.propertyId,
      ),
    db
      .prepare(
        `UPDATE properties
         SET alias = ?, address_line = ?, island_code = ?, municipality = ?,
           postal_code = ?, cadastral_reference = ?, manager_user_id = ?,
           activity_status = ?, next_action = ?, next_action_due_at = ?,
           updated_at = CURRENT_TIMESTAMP
         WHERE organization_id = ? AND id = ? AND archived_at IS NULL`,
      )
      .bind(
        values.alias,
        values.addressLine,
        values.islandCode,
        values.municipality,
        values.postalCode,
        values.cadastralReference,
        managerUserId,
        values.activityStatus,
        values.nextAction,
        values.nextActionDueAt,
        input.organizationId,
        input.propertyId,
      ),
    auditStatement(
      db,
      membership,
      "property.updated",
      "property",
      input.propertyId,
      { changedFields },
    ),
  ]);
}

export async function getPropertyDossier(
  actor: ActorInput,
  organizationId: string,
  propertyId: string,
): Promise<PropertyDossier> {
  await ensurePropertySchema();
  const membership = await authorize(actor, organizationId, "property.read");
  const db = database();
  await assertPropertyAccess(db, membership, propertyId);
  await syncLegacyEvidenceLinksIn(db, organizationId, propertyId);
  await invalidateExpiredProfessionalReviewsIn(db, organizationId, currentCanaryDate(), propertyId);
  const property = await db
    .prepare(
      `SELECT
        p.id,
        p.organization_id AS organizationId,
        p.alias,
        p.internal_reference AS internalReference,
        p.address_line AS addressLine,
        p.island_code AS islandCode,
        p.municipality,
        p.postal_code AS postalCode,
        p.cadastral_reference AS cadastralReference,
        p.data_profile AS dataProfile,
        p.activity_status AS activityStatus,
        p.dossier_status AS dossierStatus,
        p.next_action AS nextAction,
        p.next_action_due_at AS nextActionDueAt,
        p.archived_at AS archivedAt,
        o.display_name AS ownerName,
        o.email AS ownerEmail,
        o.phone AS ownerPhone,
        COALESCE(u.display_name, 'Sin responsable') AS managerName
      FROM properties p
      INNER JOIN owners o
        ON o.organization_id = p.organization_id AND o.id = p.owner_id
      LEFT JOIN app_users u ON u.id = p.manager_user_id
      WHERE p.organization_id = ? AND p.id = ?
      LIMIT 1`,
    )
    .bind(organizationId, propertyId)
    .first<Omit<
      PropertyDossier,
      "checklist" | "checklistItems" | "comments" | "documents"
    >>();
  if (!property) throw new NotFoundError("Vivienda no encontrada.");

  const checklist = await db
    .prepare(
      `SELECT
        id,
        rule_version_label AS ruleVersionLabel,
        validation_status AS validationStatus,
        generated_at AS generatedAt
      FROM property_checklists
      WHERE organization_id = ? AND property_id = ? AND status = 'active'
      ORDER BY generated_at DESC
      LIMIT 1`,
    )
    .bind(organizationId, propertyId)
    .first<PropertyDossier["checklist"]>();
  if (!checklist) throw new NotFoundError("Checklist no encontrado.");

  type DocumentVersionRow = DocumentVersionRecord & { documentId: string };

  const [itemResult, documentResult, commentResult, versionResult, reviewResult, evidenceResult] =
    await Promise.all([
    db
      .prepare(
        `SELECT
          ci.id,
          ci.title,
          ci.category,
          ci.explanation,
          ci.item_kind AS itemKind,
          (EXISTS(SELECT 1 FROM professional_reviews pr WHERE pr.organization_id=ci.organization_id AND pr.checklist_item_id=ci.id)
           OR EXISTS(SELECT 1 FROM evidence_links el WHERE el.organization_id=ci.organization_id AND el.checklist_item_id=ci.id)
           OR EXISTS(SELECT 1 FROM documents d WHERE d.organization_id=ci.organization_id AND d.checklist_item_id=ci.id)
           OR EXISTS(SELECT 1 FROM comments c WHERE c.organization_id=ci.organization_id AND c.checklist_item_id=ci.id)) AS deletionBlocked,
          ci.assignee_user_id AS assigneeUserId,
          ci.workflow_status AS workflowStatus,
          ci.due_at AS dueAt,
          ci.position,
          u.display_name AS assigneeName
        FROM checklist_items ci
        LEFT JOIN app_users u ON u.id = ci.assignee_user_id
        WHERE ci.organization_id = ? AND ci.checklist_id = ?
        ORDER BY ci.position`,
      )
      .bind(organizationId, checklist.id)
      .all<ChecklistItemRecord>(),
    db
      .prepare(
        `SELECT
          d.id,
          d.checklist_item_id AS checklistItemId,
          d.current_version_id AS currentVersionId,
          d.document_type AS documentType,
          d.document_date AS documentDate,
          d.expires_at AS expiresAt,
          d.workflow_status AS workflowStatus,
          dv.original_filename AS originalFilename,
          dv.mime_type AS mimeType,
          dv.size_bytes AS sizeBytes,
          dv.malware_scan_status AS malwareScanStatus,
          dv.uploaded_at AS uploadedAt
        FROM documents d
        INNER JOIN document_versions dv ON dv.id = d.current_version_id
        WHERE d.organization_id = ? AND d.property_id = ?
          AND d.workflow_status != 'archived'
        ORDER BY dv.uploaded_at DESC`,
      )
      .bind(organizationId, propertyId)
      .all<DocumentRecord>(),
    db
      .prepare(
        `SELECT
          c.id,
          c.body,
          c.visibility,
          c.created_at AS createdAt,
          u.display_name AS authorName
        FROM comments c
        INNER JOIN app_users u ON u.id = c.author_user_id
        WHERE c.organization_id = ? AND c.property_id = ?
          AND c.deleted_at IS NULL
          AND (? != 'owner' OR c.visibility = 'external')
        ORDER BY c.created_at DESC
        LIMIT 30`,
      )
      .bind(organizationId, propertyId, membership.role)
      .all<CommentRecord>(),
    db
      .prepare(
        `SELECT
          dv.id,
          dv.document_id AS documentId,
          dv.original_filename AS originalFilename,
          dv.size_bytes AS sizeBytes,
          dv.malware_scan_status AS malwareScanStatus,
          dv.uploaded_at AS uploadedAt,
          u.display_name AS uploadedByName,
          CASE WHEN dv.id = d.current_version_id THEN 1 ELSE 0 END AS isCurrent
        FROM document_versions dv
        INNER JOIN documents d
          ON d.organization_id = dv.organization_id
          AND d.id = dv.document_id
        INNER JOIN app_users u ON u.id = dv.uploaded_by
        WHERE d.organization_id = ?
          AND d.property_id = ?
          AND d.workflow_status != 'archived'
        ORDER BY dv.uploaded_at DESC`,
      )
      .bind(organizationId, propertyId)
      .all<DocumentVersionRow>(),
    db
      .prepare(
        `SELECT
          pr.id,
          pr.checklist_item_id AS checklistItemId,
          pr.document_id AS documentId,
          pr.document_version_id AS documentVersionId,
          pr.decision,
          pr.observation,
          pr.reviewed_at AS reviewedAt,
          pr.invalidated_at AS invalidatedAt,
          pr.invalidation_reason AS invalidationReason,
          d.document_type AS documentType,
          dv.original_filename AS originalFilename,
          u.display_name AS reviewerName
        FROM professional_reviews pr
        INNER JOIN documents d
          ON d.organization_id = pr.organization_id
          AND d.id = pr.document_id
        INNER JOIN document_versions dv
          ON dv.organization_id = pr.organization_id
          AND dv.id = pr.document_version_id
        INNER JOIN app_users u ON u.id = pr.reviewer_user_id
        WHERE pr.organization_id = ? AND pr.property_id = ?
        ORDER BY pr.reviewed_at DESC`,
      )
      .bind(organizationId, propertyId)
      .all<ProfessionalReviewRecord>(),
    db.prepare(
      `SELECT el.id, el.checklist_item_id AS checklistItemId,
        el.document_id AS documentId, el.sufficiency,
        el.assessed_version_id AS assessedVersionId,
        el.assessed_at AS assessedAt
       FROM evidence_links el
       INNER JOIN documents d ON d.organization_id = el.organization_id
         AND d.id = el.document_id AND d.workflow_status != 'archived'
       WHERE el.organization_id = ? AND el.property_id = ?`,
    ).bind(organizationId, propertyId).all<EvidenceLinkRecord>(),
  ]);

  const versionsByDocument = groupByKey(versionResult.results ?? [], (version) => version.documentId);
  const documentsById = new Map((documentResult.results ?? []).map((document) => [document.id, document]));
  const derivedStatus=deriveDossierStatus(itemResult.results ?? []);
  if(property.dossierStatus!==derivedStatus)await db.prepare(`UPDATE properties SET dossier_status=? WHERE organization_id=? AND id=? AND dossier_status=?`).bind(derivedStatus,organizationId,propertyId,property.dossierStatus).run();
  return {
    ...property,
    dossierStatus: derivedStatus,
    checklist,
    checklistItems: itemResult.results ?? [],
    comments: commentResult.results ?? [],
    documents: (documentResult.results ?? []).map((document) => ({
      ...document,
      versions: (versionsByDocument.get(document.id) ?? [])
        .map((version) => ({
          id: version.id,
          isCurrent: Boolean(version.isCurrent),
          malwareScanStatus: version.malwareScanStatus,
          originalFilename: version.originalFilename,
          sizeBytes: version.sizeBytes,
          uploadedAt: version.uploadedAt,
          uploadedByName: version.uploadedByName,
        })),
    })),
    evidenceLinks: (evidenceResult.results ?? []).map((link) => {
      const document = documentsById.get(link.documentId);
      const validity = !document || document.workflowStatus !== "available" ||
        !["clean", "structural_only"].includes(document.malwareScanStatus)
        ? "unavailable" as const
        : document.expiresAt && document.expiresAt < currentCanaryDate()
          ? "expired" as const
          : link.assessedVersionId && link.assessedVersionId !== document.currentVersionId
            ? "superseded" as const
            : "current" as const;
      return { ...link, validity };
    }),
    reviews: reviewResult.results ?? [],
  };
}

export async function requireOrganizationCapability(
  actor: ActorInput,
  organizationId: string,
  capability: Capability,
): Promise<MembershipContext> {
  await ensurePropertySchema();
  return authorize(actor, organizationId, capability);
}

export async function getDownloadableDocument(
  actor: ActorInput,
  organizationId: string,
  propertyId: string,
  documentId: string,
): Promise<DownloadableDocument> {
  await ensurePropertySchema();
  const membership = await authorize(actor, organizationId, "document.read");
  const db = database();
  await assertPropertyAccess(db, membership, propertyId);

  const document = await db
    .prepare(
      `SELECT
        d.id,
        d.workflow_status AS workflowStatus,
        p.data_profile AS dataProfile,
        dv.storage_key AS storageKey,
        dv.original_filename AS originalFilename,
        dv.mime_type AS mimeType,
        dv.size_bytes AS sizeBytes,
        dv.malware_scan_status AS malwareScanStatus
      FROM documents d
      INNER JOIN properties p
        ON p.organization_id = d.organization_id AND p.id = d.property_id
      INNER JOIN document_versions dv ON dv.id = d.current_version_id
      WHERE d.organization_id = ?
        AND d.property_id = ?
        AND d.id = ?
        AND d.workflow_status != 'archived'
      LIMIT 1`,
    )
    .bind(organizationId, propertyId, documentId)
    .first<{
      id: string;
      dataProfile: DataProfile;
      malwareScanStatus: string;
      mimeType: string;
      originalFilename: string;
      sizeBytes: number;
      storageKey: string;
      workflowStatus: string;
    }>();

  if (!document) throw new NotFoundError("Documento no encontrado.");
  if (
    document.workflowStatus !== "available" ||
    !isDownloadableSecurityState(
      document.malwareScanStatus,
      document.dataProfile,
    )
  ) {
    throw new ValidationError(
      "El archivo no tiene un control de seguridad suficiente para descargarse.",
    );
  }
  if (!env.DOCUMENTS) {
    throw new Error("Private document storage is unavailable");
  }
  const object = await env.DOCUMENTS.get(document.storageKey);
  if (!object) throw new NotFoundError("El archivo privado no está disponible.");

  await db
    .prepare(
      `INSERT INTO audit_events (
        id, organization_id, actor_user_id, actor_type, action,
        entity_type, entity_id, metadata_json
      ) VALUES (?, ?, ?, 'user', 'document.downloaded', 'document', ?, '{}')`,
    )
    .bind(crypto.randomUUID(), organizationId, membership.userId, documentId)
    .run();

  return {
    body: object.body,
    filename: document.originalFilename,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
  };
}

export async function updateEvidenceMetadata(actor:ActorInput,input:{organizationId:string;propertyId:string;documentId:string;documentType:string;documentDate:string;expiresAt:string}):Promise<void> {
  await ensurePropertySchema();
  const membership=await authorize(actor,input.organizationId,"property.update");
  const db=database();await assertPropertyAccess(db,membership,input.propertyId);
  const documentType=cleanRequired(input.documentType,"Tipo de documento",80);
  if(!validTaskDate(input.documentDate)||!validTaskDate(input.expiresAt)||(input.documentDate&&input.expiresAt&&input.expiresAt<input.documentDate))throw new ValidationError("Las fechas del documento no son válidas; el vencimiento no puede ser anterior a la emisión.");
  await assertPilotTextAllowed(db,input.organizationId,input.propertyId,documentType);
  const document=await db.prepare(`SELECT id FROM documents WHERE organization_id=? AND property_id=? AND id=? AND workflow_status!='archived'`).bind(input.organizationId,input.propertyId,input.documentId).first();
  if(!document)throw new NotFoundError("Documento no encontrado.");
  const result=await db.prepare(`UPDATE documents SET document_type=?,document_date=?,expires_at=?,updated_at=CURRENT_TIMESTAMP
    WHERE organization_id=? AND property_id=? AND id=? AND NOT EXISTS(SELECT 1 FROM professional_reviews pr
      WHERE pr.organization_id=documents.organization_id AND pr.document_id=documents.id)`)
    .bind(documentType,input.documentDate||null,input.expiresAt||null,input.organizationId,input.propertyId,input.documentId).run();
  if(!result.meta.changes)throw new ValidationError("La evidencia tiene historial de revisión. Conserva sus datos originales y registra otra evidencia para corregirlos.");
  await auditStatement(db,membership,"document.metadata_edited","document",input.documentId,{propertyId:input.propertyId,changedFields:["documentType","documentDate","expiresAt"]}).run();
}

export async function recheckDocumentSecurity(
  actor: ActorInput,
  organizationId: string,
  propertyId: string,
  documentId: string,
): Promise<DocumentSecurityCheckResult> {
  await ensurePropertySchema();
  const membership = await authorize(
    actor,
    organizationId,
    "document.security.manage",
  );
  const db = database();
  await assertPropertyAccess(db, membership, propertyId);

  const document = await db
    .prepare(
      `SELECT
        d.id,
        d.workflow_status AS workflowStatus,
        p.data_profile AS dataProfile,
        dv.id AS versionId,
        dv.storage_key AS storageKey,
        dv.original_filename AS originalFilename,
        dv.mime_type AS mimeType,
        dv.malware_scan_status AS malwareScanStatus
      FROM documents d
      INNER JOIN properties p
        ON p.organization_id = d.organization_id AND p.id = d.property_id
      INNER JOIN document_versions dv ON dv.id = d.current_version_id
      WHERE d.organization_id = ?
        AND d.property_id = ?
        AND d.id = ?
        AND d.workflow_status != 'archived'
      LIMIT 1`,
    )
    .bind(organizationId, propertyId, documentId)
    .first<{
      id: string;
      dataProfile: DataProfile;
      malwareScanStatus: string;
      mimeType: string;
      originalFilename: string;
      storageKey: string;
      versionId: string;
      workflowStatus: string;
    }>();

  if (!document) throw new NotFoundError("Documento no encontrado.");
  if (
    document.workflowStatus === "available" &&
    isDownloadableSecurityState(
      document.malwareScanStatus,
      document.dataProfile,
    )
  ) {
    return {
      message: "La comprobación técnica ya estaba superada.",
      status: "available",
    };
  }
  if (!env.DOCUMENTS) {
    throw new Error("Private document storage is unavailable");
  }

  assertPilotSecurityMode(document.dataProfile);

  const object = await env.DOCUMENTS.get(document.storageKey);
  const securityCheck = object
    ? inspectDocumentSecurity({
        bytes: new Uint8Array(await object.arrayBuffer()),
        filename: document.originalFilename,
        mimeType: document.mimeType,
      })
    : {
        accepted: false as const,
        engine: documentSecurityEngine,
        reason: "El archivo privado ya no está disponible.",
      };
  const nextScanStatus = securityCheck.accepted
    ? "structural_only"
    : "failed";
  const nextWorkflowStatus = securityCheck.accepted ? "available" : "rejected";
  const action = securityCheck.accepted
    ? "document.security_check_passed"
    : "document.security_check_failed";

  const results = await db.batch([
    db
      .prepare(
        `UPDATE document_versions
         SET malware_scan_status = ?
         WHERE organization_id = ? AND document_id = ? AND id = ?`,
      )
      .bind(nextScanStatus, organizationId, documentId, document.versionId),
    db
      .prepare(
        `UPDATE documents
         SET workflow_status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE organization_id = ? AND property_id = ? AND id = ?
           AND current_version_id = ?`,
      )
      .bind(
        nextWorkflowStatus,
        organizationId,
        propertyId,
        documentId,
        document.versionId,
      ),
    auditStatement(db, membership, action, "document", documentId, {
      securityEngine: securityCheck.engine,
    }),
  ]);

  if (Number(results[1]?.meta?.changes ?? 0) !== 1) {
    throw new ValidationError(
      "El documento cambió durante la comprobación. Vuelve a intentarlo.",
    );
  }
  if (!securityCheck.accepted && object) {
    await env.DOCUMENTS.delete(document.storageKey);
  }

  return securityCheck.accepted
    ? {
        message:
          "Control estructural superado para la prueba anonimizada. El archivo ya está disponible.",
        status: "available",
      }
    : { message: securityCheck.reason, status: "rejected" };
}

export async function archiveProperty(
  actor: ActorInput,
  organizationId: string,
  propertyId: string,
): Promise<void> {
  await ensurePropertySchema();
  const membership = await authorize(
    actor,
    organizationId,
    "property.archive",
  );
  const db = database();
  const exists = await propertyExists(db, organizationId, propertyId);
  if (!exists) throw new NotFoundError("Vivienda no encontrada.");

  await db.batch([
    db
      .prepare(
        `UPDATE properties
         SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE organization_id = ? AND id = ? AND archived_at IS NULL`,
      )
      .bind(organizationId, propertyId),
    auditStatement(
      db,
      membership,
      "property.archived",
      "property",
      propertyId,
      {},
    ),
  ]);
}

export async function manageChecklistTask(actor: ActorInput, input: {
  organizationId:string; propertyId:string; itemId?:string; action:"create"|"edit"|"delete";
  title?:string; category?:string; explanation?:string; dueAt?:string; assigneeUserId?:string;
  itemKind?:string;
}): Promise<{id:string}> {
  await ensurePropertySchema();
  const membership=await authorize(actor,input.organizationId,"property.update");
  const db=database();
  await assertPropertyAccess(db,membership,input.propertyId);
  const checklist=await db.prepare(`SELECT pc.id FROM property_checklists pc
    INNER JOIN properties p ON p.organization_id=pc.organization_id AND p.id=pc.property_id
    WHERE pc.organization_id=? AND pc.property_id=? AND pc.status='active' AND p.archived_at IS NULL
    ORDER BY pc.generated_at DESC LIMIT 1`).bind(input.organizationId,input.propertyId).first<{id:string}>();
  if(!checklist)throw new NotFoundError("Checklist activo no encontrado.");
  const itemId=input.itemId || crypto.randomUUID();
  const item=input.action!=="create" ? await db.prepare(`SELECT title, category, explanation, item_kind AS itemKind FROM checklist_items
    WHERE organization_id=? AND checklist_id=? AND id=?`).bind(input.organizationId,checklist.id,itemId).first<{title:string;category:string;explanation:string;itemKind:ChecklistItemKind}>() : null;
  if(input.action!=="create" && !item)throw new NotFoundError("Elemento no encontrado.");
  const protectedHistory=await db.prepare(`SELECT COUNT(*) AS total FROM professional_reviews
    WHERE organization_id=? AND property_id=? AND checklist_item_id=?`).bind(input.organizationId,input.propertyId,itemId).first<{total:number}>();
  if(input.action==="delete") {
    const references=await db.prepare(`SELECT
      (SELECT COUNT(*) FROM evidence_links WHERE organization_id=? AND checklist_item_id=?) +
      (SELECT COUNT(*) FROM documents WHERE organization_id=? AND checklist_item_id=?) +
      (SELECT COUNT(*) FROM comments WHERE organization_id=? AND checklist_item_id=?) AS total`)
      .bind(input.organizationId,itemId,input.organizationId,itemId,input.organizationId,itemId).first<{total:number}>();
    if(protectedHistory?.total || references?.total)throw new ValidationError("No se puede eliminar una tarea con evidencias, comentarios o historial de revisión. Conserva su trazabilidad.");
    const results=await db.batch([
      db.prepare(`DELETE FROM checklist_items WHERE organization_id=? AND checklist_id=? AND id=?
        AND NOT EXISTS(SELECT 1 FROM professional_reviews WHERE organization_id=? AND checklist_item_id=?)
        AND NOT EXISTS(SELECT 1 FROM evidence_links WHERE organization_id=? AND checklist_item_id=?)
        AND NOT EXISTS(SELECT 1 FROM documents WHERE organization_id=? AND checklist_item_id=?)
        AND NOT EXISTS(SELECT 1 FROM comments WHERE organization_id=? AND checklist_item_id=?)`)
        .bind(input.organizationId,checklist.id,itemId,input.organizationId,itemId,input.organizationId,itemId,input.organizationId,itemId,input.organizationId,itemId),
      db.prepare(`UPDATE reminders SET status='resolved',resolved_at=CURRENT_TIMESTAMP WHERE organization_id=? AND target_type='checklist_item' AND target_id=? AND NOT EXISTS(SELECT 1 FROM checklist_items WHERE organization_id=? AND id=?)`).bind(input.organizationId,itemId,input.organizationId,itemId),
      db.prepare(`INSERT INTO audit_events(id,organization_id,actor_user_id,actor_type,action,entity_type,entity_id,metadata_json)
        SELECT ?,?,?,'user','checklist_item.deleted','checklist_item',?,? WHERE NOT EXISTS(SELECT 1 FROM checklist_items WHERE organization_id=? AND id=?)`)
        .bind(crypto.randomUUID(),input.organizationId,membership.userId,itemId,JSON.stringify({propertyId:input.propertyId}),input.organizationId,itemId),
    ]);
    if(!results[0].meta.changes)throw new ValidationError("La tarea cambió durante la edición. Actualiza el expediente antes de continuar.");
  } else {
    const itemKind=input.itemKind || item?.itemKind || "professional_requirement";
    if(itemKind!=="operational" && itemKind!=="professional_requirement")throw new ValidationError("Tipo de elemento no válido.");
    const changingKind=Boolean(item && item.itemKind!==itemKind);
    if(changingKind){
      const activity=await db.prepare(`SELECT workflow_status AS status,
        (SELECT COUNT(*) FROM professional_reviews WHERE organization_id=? AND checklist_item_id=?) +
        (SELECT COUNT(*) FROM evidence_links WHERE organization_id=? AND checklist_item_id=?) +
        (SELECT COUNT(*) FROM documents WHERE organization_id=? AND checklist_item_id=?) +
        (SELECT COUNT(*) FROM comments WHERE organization_id=? AND checklist_item_id=?) AS total
        FROM checklist_items WHERE organization_id=? AND id=?`)
        .bind(input.organizationId,itemId,input.organizationId,itemId,input.organizationId,itemId,input.organizationId,itemId,input.organizationId,itemId).first<{status:string;total:number}>();
      if(activity?.status!=="pending" || activity.total)throw new ValidationError("Solo puedes reclasificar un elemento pendiente sin evidencias, comentarios ni revisiones. Crea otro para conservar su historial.");
    }
    const title=cleanRequired(input.title,"Título",160);
    const category=cleanRequired(input.category,"Fase o categoría",60);
    const explanation=cleanRequired(input.explanation,"Descripción",800);
    if(!validTaskDate(input.dueAt??""))throw new ValidationError("La fecha objetivo no es válida.");
    const dataProfile=await propertyDataProfile(db,input.organizationId,input.propertyId);
    if(dataProfile==="pilot_anonymized" && directIdentifierLabel(`${title} ${category} ${explanation}`))throw new ValidationError("No introduzcas identificadores personales en las tareas de la beta.");
    if(protectedHistory?.total && item && (item.title!==title || item.category!==category || item.explanation!==explanation))throw new ValidationError("No se puede cambiar el contenido de una tarea con historial de revisión. Añade una nueva tarea para conservar el criterio original.");
    const assignee=input.assigneeUserId?.trim() || null;
    if(assignee && !(await listAssignablePropertyManagers(actor,input.organizationId,input.propertyId)).some(member=>member.id===assignee))throw new ValidationError("El responsable debe ser un miembro activo con acceso a esta vivienda.");
    if(input.action==="create") {
      const result=await db.prepare(`INSERT INTO checklist_items(id,organization_id,checklist_id,title,category,explanation,workflow_status,assignee_user_id,due_at,item_kind,position)
        SELECT ?,?,?,?,?,?,'pending',?,?,?,COALESCE(MAX(position),0)+1 FROM checklist_items WHERE organization_id=? AND checklist_id=?
        HAVING COUNT(*)<50 AND SUM(CASE WHEN lower(title)=lower(?) THEN 1 ELSE 0 END)=0 OR COUNT(*)=0`)
        .bind(itemId,input.organizationId,checklist.id,title,category,explanation,assignee,input.dueAt||null,itemKind,input.organizationId,checklist.id,title).run();
      if(!result.meta.changes)throw new ValidationError("Ya existe una tarea con ese título o se alcanzó el límite de 50 tareas.");
    } else {
      const changedContent=item?.title!==title || item?.category!==category || item?.explanation!==explanation;
      const result=await db.prepare(`UPDATE checklist_items SET title=?,category=?,explanation=?,assignee_user_id=?,due_at=?,item_kind=?,updated_at=CURRENT_TIMESTAMP
        WHERE organization_id=? AND checklist_id=? AND id=? AND (?=0 OR NOT EXISTS(
          SELECT 1 FROM professional_reviews WHERE organization_id=? AND checklist_item_id=?))
        AND (?=0 OR (workflow_status='pending'
          AND NOT EXISTS(SELECT 1 FROM professional_reviews WHERE organization_id=? AND checklist_item_id=?)
          AND NOT EXISTS(SELECT 1 FROM evidence_links WHERE organization_id=? AND checklist_item_id=?)
          AND NOT EXISTS(SELECT 1 FROM documents WHERE organization_id=? AND checklist_item_id=?)
          AND NOT EXISTS(SELECT 1 FROM comments WHERE organization_id=? AND checklist_item_id=?)))`)
        .bind(title,category,explanation,assignee,input.dueAt||null,itemKind,input.organizationId,checklist.id,itemId,changedContent?1:0,input.organizationId,itemId,changingKind?1:0,input.organizationId,itemId,input.organizationId,itemId,input.organizationId,itemId,input.organizationId,itemId).run();
      if(!result.meta.changes)throw new ValidationError("La tarea cambió durante la edición. Actualiza el expediente antes de continuar.");
    }
    await auditStatement(db,membership,input.action==="create"?"checklist_item.created":"checklist_item.edited","checklist_item",itemId,{propertyId:input.propertyId,itemKind,previousItemKind:item?.itemKind??null}).run();
  }
  await refreshDossierStatusIn(db,input.organizationId,input.propertyId);
  return {id:itemId};
}

async function refreshDossierStatusIn(db:D1Database, organizationId:string, propertyId:string) {
  const rows=await db.prepare(`SELECT ci.workflow_status AS workflowStatus, ci.item_kind AS itemKind FROM checklist_items ci
    INNER JOIN property_checklists pc ON pc.organization_id=ci.organization_id AND pc.id=ci.checklist_id
    WHERE pc.organization_id=? AND pc.property_id=? AND pc.status='active'`).bind(organizationId,propertyId).all<{workflowStatus:ChecklistWorkflowStatus;itemKind:ChecklistItemKind}>();
  const status=deriveDossierStatus(rows.results??[]);
  await db.prepare(`UPDATE properties SET dossier_status=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?`).bind(status,organizationId,propertyId).run();
}

export async function updateChecklistItem(
  actor: ActorInput,
  organizationId: string,
  propertyId: string,
  itemId: string,
  requestedStatus: string,
): Promise<DossierStatus> {
  await ensurePropertySchema();
  const allowed: ChecklistWorkflowStatus[] = [
    "pending",
    "document_requested",
    "evidence_added",
    "in_review",
    "observed",
    "reviewed",
    "in_progress",
    "completed",
  ];
  if (!allowed.includes(requestedStatus as ChecklistWorkflowStatus)) {
    throw new ValidationError("Estado de checklist no válido.");
  }
  if (requestedStatus === "reviewed") {
    throw new ValidationError(
      "Para cerrar este requisito registra una revisión profesional con su evidencia y observación.",
    );
  }
  const requiredCapability: Capability =
    requestedStatus === "in_review" || requestedStatus === "observed"
        ? "review.create"
        : "property.update";
  const membership = await authorize(
    actor,
    organizationId,
    requiredCapability,
  );
  const db = database();
  await assertPropertyAccess(db, membership, propertyId);
  const item = await db
    .prepare(
      `SELECT
         ci.id,
         ci.item_kind AS itemKind,
         EXISTS (
           SELECT 1
           FROM professional_reviews pr
           WHERE pr.organization_id = ci.organization_id
             AND pr.checklist_item_id = ci.id
             AND pr.invalidated_at IS NULL
         ) AS hasActiveReview
       FROM checklist_items ci
       INNER JOIN property_checklists pc ON pc.id = ci.checklist_id
       WHERE ci.organization_id = ?
         AND ci.id = ?
         AND pc.property_id = ?
         AND pc.status = 'active'
       LIMIT 1`,
    )
    .bind(organizationId, itemId, propertyId)
    .first<{ hasActiveReview: number; id: string; itemKind:ChecklistItemKind }>();
  if (!item) throw new NotFoundError("Elemento no encontrado.");
  if(item.itemKind==="operational" && !["pending","in_progress","completed"].includes(requestedStatus))throw new ValidationError("Una tarea operativa solo puede estar pendiente, en curso o completada; no es una revisión profesional.");
  if(item.itemKind!=="operational" && ["in_progress","completed"].includes(requestedStatus))throw new ValidationError("Este requisito necesita una decisión profesional; no puede marcarse como tarea completada.");
  if (Boolean(item.hasActiveReview)) {
    throw new ValidationError(
      "Este requisito tiene una decisión profesional vigente y su estado no puede modificarse manualmente.",
    );
  }

  if(requestedStatus==="evidence_added" || requestedStatus==="in_review") {
    const evidence=await db.prepare(`SELECT d.id FROM evidence_links el
      INNER JOIN documents d ON d.organization_id=el.organization_id AND d.id=el.document_id AND d.property_id=el.property_id
      INNER JOIN document_versions dv ON dv.organization_id=d.organization_id AND dv.id=d.current_version_id
      INNER JOIN properties p ON p.organization_id=d.organization_id AND p.id=d.property_id
      WHERE el.organization_id=? AND el.property_id=? AND el.checklist_item_id=? AND d.workflow_status='available'
      AND (dv.malware_scan_status='clean' OR (p.data_profile='pilot_anonymized' AND dv.malware_scan_status='structural_only'))
      AND (d.expires_at IS NULL OR d.expires_at>=?) LIMIT 1`).bind(organizationId,propertyId,itemId,currentCanaryDate()).first();
    if(!evidence)throw new ValidationError("Vincula una evidencia disponible y vigente antes de marcar este estado.");
  }

  await db
    .prepare(
      `UPDATE checklist_items
       SET workflow_status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE organization_id = ? AND id = ?`,
    )
    .bind(requestedStatus, organizationId, itemId)
    .run();

  const statuses = await db
    .prepare(
      `SELECT ci.workflow_status AS workflowStatus, ci.item_kind AS itemKind
       FROM checklist_items ci
       INNER JOIN property_checklists pc ON pc.id = ci.checklist_id
       WHERE ci.organization_id = ? AND pc.property_id = ?
         AND pc.status = 'active'`,
    )
    .bind(organizationId, propertyId)
    .all<{ workflowStatus: ChecklistWorkflowStatus;itemKind:ChecklistItemKind }>();
  const dossierStatus = deriveDossierStatus(
    statuses.results ?? [],
  );

  await db.batch([
    db
      .prepare(
        `UPDATE properties
         SET dossier_status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE organization_id = ? AND id = ?`,
      )
      .bind(dossierStatus, organizationId, propertyId),
    auditStatement(
      db,
      membership,
      "checklist_item.status_changed",
      "checklist_item",
      itemId,
      { dossierStatus, workflowStatus: requestedStatus },
    ),
  ]);

  return dossierStatus;
}

export async function createProfessionalReview(
  actor: ActorInput,
  input: CreateProfessionalReviewInput,
): Promise<{ dossierStatus: DossierStatus; reviewId: string }> {
  await ensurePropertySchema();
  const membership = await authorize(
    actor,
    input.organizationId,
    "review.close",
  );
  if (membership.role !== "professional") {
    throw new AuthorizationError(
      "La decisión debe registrarla una persona con rol profesional.",
    );
  }
  const db = database();
  await assertPropertyAccess(db, membership, input.propertyId);
  await syncLegacyEvidenceLinksIn(db, input.organizationId, input.propertyId);

  const decision = input.decision.trim() as ProfessionalReviewDecision;
  if (!["approved", "rejected", "changes_requested"].includes(decision)) {
    throw new ValidationError("Decisión de revisión no válida.");
  }
  const observation = input.observation.trim().replace(/\s+/g, " ");
  await assertPilotTextAllowed(db,input.organizationId,input.propertyId,observation);
  if (observation.length < 12 || observation.length > 800) {
    throw new ValidationError(
      "La observación debe tener entre 12 y 800 caracteres.",
    );
  }

  const evidence = await db
    .prepare(
      `SELECT
        ci.id AS checklistItemId,
        d.id AS documentId,
        d.current_version_id AS documentVersionId,
        el.id AS evidenceLinkId,
        d.workflow_status AS workflowStatus,
        d.expires_at AS expiresAt,
        dv.malware_scan_status AS malwareScanStatus,
        p.data_profile AS dataProfile
       FROM checklist_items ci
       INNER JOIN property_checklists pc
         ON pc.organization_id = ci.organization_id
         AND pc.id = ci.checklist_id
       INNER JOIN evidence_links el
         ON el.organization_id = ci.organization_id
         AND el.property_id = pc.property_id
         AND el.checklist_item_id = ci.id
       INNER JOIN documents d
         ON d.organization_id = el.organization_id
         AND d.id = el.document_id
         AND d.property_id = el.property_id
       INNER JOIN document_versions dv
         ON dv.organization_id = d.organization_id
         AND dv.id = d.current_version_id
       INNER JOIN properties p
         ON p.organization_id = d.organization_id
         AND p.id = d.property_id
       WHERE ci.organization_id = ?
         AND pc.property_id = ?
         AND pc.status = 'active'
         AND ci.id = ?
         AND ci.item_kind = 'professional_requirement'
         AND d.id = ?
         AND d.workflow_status != 'archived'
       LIMIT 1`,
    )
    .bind(
      input.organizationId,
      input.propertyId,
      input.checklistItemId,
      input.documentId,
    )
    .first<{
      checklistItemId: string;
      dataProfile: DataProfile;
      documentId: string;
      documentVersionId: string;
      evidenceLinkId: string;
      expiresAt: string | null;
      malwareScanStatus: string;
      workflowStatus: string;
    }>();
  if (!evidence) {
    throw new ValidationError(
      "Selecciona una evidencia vigente vinculada a este requisito.",
    );
  }
  if (
    evidence.workflowStatus !== "available" ||
    !isDownloadableSecurityState(
      evidence.malwareScanStatus,
      evidence.dataProfile,
    )
  ) {
    throw new ValidationError(
      "La evidencia todavía no tiene un control de seguridad suficiente.",
    );
  }
  if (evidence.expiresAt && evidence.expiresAt < currentCanaryDate()) {
    throw new ValidationError("La evidencia está caducada y no puede revisarse como vigente.");
  }

  const existing = await db
    .prepare(
      `SELECT id
       FROM professional_reviews
       WHERE organization_id = ?
         AND property_id = ?
         AND checklist_item_id = ?
         AND invalidated_at IS NULL
       LIMIT 1`,
    )
    .bind(input.organizationId, input.propertyId, input.checklistItemId)
    .first();
  if (existing) {
    throw new ValidationError(
      "Este requisito ya tiene una decisión vigente. Sustituye la evidencia para abrir una nueva revisión.",
    );
  }

  const reviewId = crypto.randomUUID();
  const workflowStatus: ChecklistWorkflowStatus =
    decision === "approved" ? "reviewed" : "observed";
  const statuses = await db
    .prepare(
      `SELECT ci.id, ci.workflow_status AS workflowStatus, ci.item_kind AS itemKind
       FROM checklist_items ci
       INNER JOIN property_checklists pc ON pc.id = ci.checklist_id
       WHERE ci.organization_id = ? AND pc.property_id = ?
         AND pc.status = 'active'`,
    )
    .bind(input.organizationId, input.propertyId)
    .all<{ id: string; workflowStatus: ChecklistWorkflowStatus;itemKind:ChecklistItemKind }>();
  const dossierStatus = deriveDossierStatus(
    (statuses.results ?? []).map((row) =>
      ({...row,workflowStatus:row.id === input.checklistItemId ? workflowStatus : row.workflowStatus}),
    ),
  );

  await db.batch([
    db
      .prepare(
        `INSERT INTO professional_reviews (
          id, organization_id, property_id, checklist_item_id,
          document_id, document_version_id, reviewer_user_id,
          decision, observation
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        reviewId,
        input.organizationId,
        input.propertyId,
        input.checklistItemId,
        evidence.documentId,
        evidence.documentVersionId,
        membership.userId,
        decision,
        observation,
      ),
    db
      .prepare(
        `UPDATE checklist_items
         SET workflow_status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE organization_id = ? AND id = ?`,
      )
      .bind(workflowStatus, input.organizationId, input.checklistItemId),
    db.prepare(
      `UPDATE evidence_links SET sufficiency = ?, assessed_version_id = ?,
        assessed_at = CURRENT_TIMESTAMP WHERE organization_id = ? AND id = ?`,
    ).bind(decision === "approved" ? "sufficient" : "insufficient", evidence.documentVersionId, input.organizationId, evidence.evidenceLinkId),
    db
      .prepare(
        `UPDATE properties
         SET dossier_status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE organization_id = ? AND id = ?`,
      )
      .bind(dossierStatus, input.organizationId, input.propertyId),
    auditStatement(
      db,
      membership,
      "review.created",
      "professional_review",
      reviewId,
      {
        checklistItemId: input.checklistItemId,
        decision,
        documentId: evidence.documentId,
        documentVersionId: evidence.documentVersionId,
        evidenceLinkId: evidence.evidenceLinkId,
        dossierStatus,
      },
    ),
  ]);

  return { dossierStatus, reviewId };
}

export async function invalidateExpiredProfessionalReviewsIn(
  db: D1Database,
  organizationId: string,
  currentDate: string,
  propertyId?: string,
): Promise<number> {
  const expired = await db
    .prepare(
      `SELECT
        pr.id,
        pr.property_id AS propertyId,
        pr.checklist_item_id AS checklistItemId,
        pr.document_id AS documentId,
        pr.document_version_id AS documentVersionId
       FROM professional_reviews pr
       INNER JOIN documents d
         ON d.organization_id = pr.organization_id
         AND d.id = pr.document_id
       WHERE pr.organization_id = ?
         AND (? IS NULL OR pr.property_id = ?)
         AND pr.invalidated_at IS NULL
         AND d.expires_at IS NOT NULL
         AND d.expires_at < ?
       ORDER BY pr.reviewed_at
       LIMIT 100`,
    )
    .bind(organizationId, propertyId ?? null, propertyId ?? null, currentDate)
    .all<{
      checklistItemId: string;
      documentId: string;
      documentVersionId: string;
      id: string;
      propertyId: string;
    }>();
  const rows = expired.results ?? [];
  if (!rows.length) return 0;

  const statements: D1PreparedStatement[] = [];
  for (const review of rows) {
    statements.push(
      db
        .prepare(
          `UPDATE professional_reviews
           SET invalidated_at = CURRENT_TIMESTAMP,
             invalidation_reason = 'evidence_expired'
           WHERE organization_id = ? AND id = ?
             AND invalidated_at IS NULL`,
        )
        .bind(organizationId, review.id),
      db
        .prepare(
          `UPDATE checklist_items
           SET workflow_status = 'evidence_added',
             updated_at = CURRENT_TIMESTAMP
           WHERE organization_id = ? AND id = ?`,
        )
        .bind(organizationId, review.checklistItemId),
      db.prepare(
        `UPDATE evidence_links SET sufficiency = 'unassessed',
         assessed_version_id = NULL, assessed_at = NULL
         WHERE organization_id = ? AND checklist_item_id = ? AND document_id = ?`,
      ).bind(organizationId, review.checklistItemId, review.documentId),
      db
        .prepare(
          `UPDATE properties
           SET dossier_status = 'requires_professional_review',
             updated_at = CURRENT_TIMESTAMP
           WHERE organization_id = ? AND id = ?`,
        )
        .bind(organizationId, review.propertyId),
      db
        .prepare(
          `INSERT INTO audit_events (
            id, organization_id, actor_user_id, actor_type, action,
            entity_type, entity_id, metadata_json
          ) VALUES (?, ?, NULL, 'system', 'review.invalidated',
            'professional_review', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          organizationId,
          review.id,
          JSON.stringify({
            documentId: review.documentId,
            documentVersionId: review.documentVersionId,
            reason: "evidence_expired",
          }),
        ),
    );
  }
  await db.batch(statements);
  return rows.length;
}

export async function addComment(
  actor: ActorInput,
  organizationId: string,
  propertyId: string,
  bodyValue: string,
): Promise<void> {
  await ensurePropertySchema();
  const membership = await authorize(
    actor,
    organizationId,
    "comment.internal.read",
  );
  const body = bodyValue.trim().replace(/\s+/g, " ");
  if (body.length < 2 || body.length > 1200) {
    throw new ValidationError(
      "El comentario debe tener entre 2 y 1.200 caracteres.",
    );
  }
  const db = database();
  await assertPropertyAccess(db, membership, propertyId);
  await assertPilotTextAllowed(db, organizationId, propertyId, body);
  const commentId = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        `INSERT INTO comments (
          id, organization_id, property_id, visibility, body, author_user_id
        ) VALUES (?, ?, ?, 'internal', ?, ?)`,
      )
      .bind(
        commentId,
        organizationId,
        propertyId,
        body,
        membership.userId,
      ),
    auditStatement(
      db,
      membership,
      "comment.created",
      "comment",
      commentId,
      { visibility: "internal" },
    ),
  ]);
}

export async function changeEvidenceLink(
  actor: ActorInput,
  input: {
    action: "link" | "unlink";
    checklistItemId: string;
    documentId: string;
    organizationId: string;
    propertyId: string;
  },
): Promise<void> {
  await ensurePropertySchema();
  const membership = await authorize(actor, input.organizationId, "document.upload");
  const db = database();
  await assertPropertyAccess(db, membership, input.propertyId);
  await syncLegacyEvidenceLinksIn(db, input.organizationId, input.propertyId);
  const relation = await db.prepare(
    `SELECT ci.id AS checklistItemId, d.id AS documentId
     FROM checklist_items ci
     INNER JOIN property_checklists pc ON pc.organization_id = ci.organization_id
       AND pc.id = ci.checklist_id AND pc.status = 'active'
     INNER JOIN documents d ON d.organization_id = ci.organization_id
       AND d.property_id = pc.property_id AND d.workflow_status != 'archived'
     WHERE ci.organization_id = ? AND pc.property_id = ?
       AND ci.id = ? AND d.id = ? LIMIT 1`,
  ).bind(input.organizationId, input.propertyId, input.checklistItemId, input.documentId).first();
  if (!relation) throw new ValidationError("El documento y el requisito deben pertenecer a esta vivienda.");

  const existing = await db.prepare(
    `SELECT id FROM evidence_links WHERE organization_id = ?
      AND property_id = ? AND checklist_item_id = ? AND document_id = ? LIMIT 1`,
  ).bind(input.organizationId, input.propertyId, input.checklistItemId, input.documentId).first<{ id: string }>();
  if (input.action === "link") {
    if (existing) return;
    const active = await db.prepare(
      `SELECT id FROM professional_reviews WHERE organization_id = ?
       AND checklist_item_id = ? AND invalidated_at IS NULL LIMIT 1`,
    ).bind(input.organizationId, input.checklistItemId).first();
    await db.batch([
      db.prepare(
        `INSERT INTO evidence_links (id, organization_id, property_id, checklist_item_id, document_id)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), input.organizationId, input.propertyId, input.checklistItemId, input.documentId),
      ...(active ? [] : [db.prepare(
        `UPDATE checklist_items SET workflow_status = 'evidence_added', updated_at = CURRENT_TIMESTAMP
         WHERE organization_id = ? AND id = ? AND item_kind = 'professional_requirement'`,
      ).bind(input.organizationId, input.checklistItemId)]),
      ...(active ? [] : [db.prepare(
        `UPDATE properties SET dossier_status = 'requires_professional_review',
         updated_at = CURRENT_TIMESTAMP WHERE organization_id = ? AND id = ?`,
      ).bind(input.organizationId, input.propertyId)]),
      auditStatement(db, membership, "evidence.linked", "document", input.documentId, { checklistItemId: input.checklistItemId }),
    ]);
    await refreshDossierStatusIn(db,input.organizationId,input.propertyId);
    return;
  }
  if (!existing) return;
  const active = await db.prepare(
    `SELECT id FROM professional_reviews WHERE organization_id = ?
       AND checklist_item_id = ? AND document_id = ? AND invalidated_at IS NULL LIMIT 1`,
  ).bind(input.organizationId, input.checklistItemId, input.documentId).first<{ id: string }>();
  await db.batch([
    db.prepare(`DELETE FROM evidence_links WHERE organization_id = ? AND id = ?`)
      .bind(input.organizationId, existing.id),
    db.prepare(`UPDATE documents SET checklist_item_id = NULL WHERE organization_id = ?
      AND id = ? AND checklist_item_id = ?`)
      .bind(input.organizationId, input.documentId, input.checklistItemId),
    ...(active ? [
      db.prepare(`UPDATE professional_reviews SET invalidated_at = CURRENT_TIMESTAMP,
        invalidation_reason = 'evidence_unlinked' WHERE organization_id = ? AND id = ?
        AND invalidated_at IS NULL`).bind(input.organizationId, active.id),
      db.prepare(`UPDATE properties SET dossier_status = 'requires_professional_review',
        updated_at = CURRENT_TIMESTAMP WHERE organization_id = ? AND id = ?`)
        .bind(input.organizationId, input.propertyId),
    ] : []),
    db.prepare(`UPDATE checklist_items SET workflow_status = CASE
      WHEN EXISTS (SELECT 1 FROM professional_reviews pr WHERE pr.organization_id = ?
        AND pr.checklist_item_id = ? AND pr.invalidated_at IS NULL) THEN workflow_status
      WHEN EXISTS (SELECT 1 FROM evidence_links el WHERE el.organization_id = ?
        AND el.checklist_item_id = ?) THEN 'evidence_added' ELSE 'pending' END,
      updated_at = CURRENT_TIMESTAMP WHERE organization_id = ? AND id = ? AND item_kind = 'professional_requirement'`)
      .bind(input.organizationId, input.checklistItemId, input.organizationId, input.checklistItemId, input.organizationId, input.checklistItemId),
    auditStatement(db, membership, "evidence.unlinked", "document", input.documentId, { checklistItemId: input.checklistItemId, invalidatedReviewId: active?.id ?? null }),
  ]);
  await refreshDossierStatusIn(db,input.organizationId,input.propertyId);
}

export async function uploadDocument(
  actor: ActorInput,
  input: UploadDocumentInput,
): Promise<void> {
  await ensurePropertySchema();
  const membership = await authorize(
    actor,
    input.organizationId,
    "document.upload",
  );
  const db = database();
  await assertPropertyAccess(db, membership, input.propertyId);
  const dataProfile = await propertyDataProfile(
    db,
    input.organizationId,
    input.propertyId,
  );
  assertPilotSecurityMode(dataProfile);

  const file = validateFile(input.file);
  const documentType = cleanRequired(input.documentType, "Tipo de documento", 80);
  const notes = cleanOptional(input.notes, 500) ?? "";
  const documentDate = validateOptionalDate(input.documentDate);
  const expiresAt = validateOptionalDate(input.expiresAt);
  const checklistItemIds = [...new Set(
    (input.checklistItemIds?.length ? input.checklistItemIds : [input.checklistItemId ?? ""])
      .map((id) => id.trim()).filter(Boolean),
  )];
  if (checklistItemIds.length > 30 || checklistItemIds.some((id) => id.length > 64)) {
    throw new ValidationError("Selecciona hasta 30 requisitos válidos.");
  }
  for (const checklistItemId of checklistItemIds) {
    const item = await db.prepare(
      `SELECT ci.id FROM checklist_items ci
       INNER JOIN property_checklists pc ON pc.organization_id = ci.organization_id
         AND pc.id = ci.checklist_id
       WHERE ci.organization_id = ? AND ci.id = ?
         AND pc.property_id = ? AND pc.status = 'active' LIMIT 1`,
    ).bind(input.organizationId, checklistItemId, input.propertyId).first();
    if (!item) throw new ValidationError("Uno de los requisitos seleccionados no pertenece a esta vivienda.");
  }

  if (!env.DOCUMENTS) {
    throw new Error("Private document storage is unavailable");
  }

  const documentId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const storageKey = `${input.organizationId}/${input.propertyId}/${documentId}/${versionId}`;
  const fileBytes = await file.arrayBuffer();
  const sha256 = await digestSha256(fileBytes);
  const originalFilename = sanitizeFilename(file.name);
  assertPilotDocumentAllowed(dataProfile, input, originalFilename);
  const securityCheck = inspectDocumentSecurity({
    bytes: new Uint8Array(fileBytes),
    filename: originalFilename,
    mimeType: file.type,
  });
  if (!securityCheck.accepted) {
    await auditStatement(
      db,
      membership,
      "document.upload_rejected_by_security",
      "property",
      input.propertyId,
      {
        mimeType: file.type,
        securityEngine: securityCheck.engine,
        sizeBytes: file.size,
      },
    ).run();
    throw new ValidationError(securityCheck.reason);
  }

  await env.DOCUMENTS.put(storageKey, fileBytes, {
    customMetadata: {
      documentId,
      organizationId: input.organizationId,
      propertyId: input.propertyId,
      quarantine: "pilot-structural-only",
      securityEngine: securityCheck.engine,
      dataProfile,
    },
    httpMetadata: { contentType: file.type },
  });

  try {
    const statements: D1PreparedStatement[] = [
      db
        .prepare(
          `INSERT INTO documents (
            id, organization_id, property_id, checklist_item_id,
            document_type, document_date, expires_at, workflow_status,
            notes, current_version_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'available', ?, ?)`,
        )
        .bind(
          documentId,
          input.organizationId,
          input.propertyId,
          null,
          documentType,
          documentDate,
          expiresAt,
          notes,
          versionId,
        ),
      db
        .prepare(
          `INSERT INTO document_versions (
            id, organization_id, document_id, storage_key,
            original_filename, mime_type, size_bytes, sha256,
            malware_scan_status, uploaded_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'structural_only', ?)`,
        )
        .bind(
          versionId,
          input.organizationId,
          documentId,
          storageKey,
          originalFilename,
          file.type,
          file.size,
          sha256,
          membership.userId,
        ),
      auditStatement(
        db,
        membership,
        "document.uploaded_after_security_check",
        "document",
        documentId,
        {
          mimeType: file.type,
          securityEngine: securityCheck.engine,
          sizeBytes: file.size,
        },
      ),
    ];

    for (const checklistItemId of checklistItemIds) {
      statements.push(db.prepare(
        `INSERT INTO evidence_links (id, organization_id, property_id, checklist_item_id, document_id)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), input.organizationId, input.propertyId, checklistItemId, documentId));
      statements.push(
        db
          .prepare(
            `UPDATE checklist_items
             SET workflow_status = 'evidence_added',
               updated_at = CURRENT_TIMESTAMP
             WHERE organization_id = ? AND id = ? AND item_kind = 'professional_requirement' AND NOT EXISTS (
               SELECT 1 FROM professional_reviews pr WHERE pr.organization_id = ?
               AND pr.checklist_item_id = ? AND pr.invalidated_at IS NULL)`,
          )
          .bind(input.organizationId, checklistItemId, input.organizationId, checklistItemId),
      );
    }
    if (checklistItemIds.length) {
      statements.push(db.prepare(
        `UPDATE properties SET dossier_status = 'requires_professional_review',
         updated_at = CURRENT_TIMESTAMP WHERE organization_id = ? AND id = ?
         AND EXISTS (SELECT 1 FROM checklist_items ci
           INNER JOIN evidence_links el ON el.organization_id = ci.organization_id
             AND el.checklist_item_id = ci.id
           WHERE el.organization_id = ? AND el.document_id = ?
             AND ci.workflow_status = 'evidence_added')`,
      ).bind(input.organizationId, input.propertyId, input.organizationId, documentId));
    }
    await db.batch(statements);
  } catch (error) {
    await env.DOCUMENTS.delete(storageKey);
    throw error;
  }
}

export async function replaceDocumentVersion(
  actor: ActorInput,
  input: ReplaceDocumentVersionInput,
): Promise<void> {
  await ensurePropertySchema();
  const membership = await authorize(
    actor,
    input.organizationId,
    "document.upload",
  );
  const db = database();
  await assertPropertyAccess(db, membership, input.propertyId);
  await syncLegacyEvidenceLinksIn(db, input.organizationId, input.propertyId);
  const dataProfile = await propertyDataProfile(
    db,
    input.organizationId,
    input.propertyId,
  );
  assertPilotSecurityMode(dataProfile);
  const current = await db
    .prepare(
      `SELECT
         d.id,
         d.checklist_item_id AS checklistItemId,
         d.current_version_id AS currentVersionId
       FROM documents d
       WHERE d.organization_id = ?
         AND d.property_id = ?
         AND d.id = ?
         AND d.workflow_status != 'archived'
       LIMIT 1`,
    )
    .bind(input.organizationId, input.propertyId, input.documentId)
    .first<{
      checklistItemId: string | null;
      currentVersionId: string;
      id: string;
    }>();
  if (!current) throw new NotFoundError("Documento no encontrado.");

  const activeReviews = await db
    .prepare(
      `SELECT id, checklist_item_id AS checklistItemId
       FROM professional_reviews
       WHERE organization_id = ?
         AND property_id = ?
         AND document_id = ?
         AND document_version_id = ?
         AND invalidated_at IS NULL
       ORDER BY reviewed_at`,
    )
    .bind(
      input.organizationId,
      input.propertyId,
      input.documentId,
      current.currentVersionId,
    )
    .all<{ id: string; checklistItemId: string }>();

  const file = validateFile(input.file);
  if (!env.DOCUMENTS) {
    throw new Error("Private document storage is unavailable");
  }

  const versionId = crypto.randomUUID();
  const storageKey = `${input.organizationId}/${input.propertyId}/${input.documentId}/${versionId}`;
  const fileBytes = await file.arrayBuffer();
  const sha256 = await digestSha256(fileBytes);
  const originalFilename = sanitizeFilename(file.name);
  assertPilotDocumentAllowed(dataProfile, input, originalFilename);
  const securityCheck = inspectDocumentSecurity({
    bytes: new Uint8Array(fileBytes),
    filename: originalFilename,
    mimeType: file.type,
  });
  if (!securityCheck.accepted) {
    await auditStatement(
      db,
      membership,
      "document.version_rejected_by_security",
      "document",
      input.documentId,
      {
        mimeType: file.type,
        securityEngine: securityCheck.engine,
        sizeBytes: file.size,
      },
    ).run();
    throw new ValidationError(securityCheck.reason);
  }

  await env.DOCUMENTS.put(storageKey, fileBytes, {
    customMetadata: {
      documentId: input.documentId,
      organizationId: input.organizationId,
      propertyId: input.propertyId,
      quarantine: "pilot-structural-only",
      dataProfile,
      securityEngine: securityCheck.engine,
      supersedesVersionId: current.currentVersionId,
    },
    httpMetadata: { contentType: file.type },
  });

  try {
    const replacementStatements: D1PreparedStatement[] = [
      db
        .prepare(
          `INSERT INTO document_versions (
            id, organization_id, document_id, storage_key,
            original_filename, mime_type, size_bytes, sha256,
            malware_scan_status, uploaded_by, supersedes_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'structural_only', ?, ?)`,
        )
        .bind(
          versionId,
          input.organizationId,
          input.documentId,
          storageKey,
          originalFilename,
          file.type,
          file.size,
          sha256,
          membership.userId,
          current.currentVersionId,
        ),
      db
        .prepare(
          `UPDATE documents
           SET current_version_id = ?,
             workflow_status = 'available',
             updated_at = CURRENT_TIMESTAMP
           WHERE organization_id = ?
             AND property_id = ?
             AND id = ?
             AND current_version_id = ?`,
        )
        .bind(
          versionId,
          input.organizationId,
          input.propertyId,
          input.documentId,
          current.currentVersionId,
        ),
    ];
    replacementStatements.push(db.prepare(
      `UPDATE evidence_links SET sufficiency = 'unassessed',
        assessed_version_id = NULL, assessed_at = NULL
       WHERE organization_id = ? AND document_id = ?`,
    ).bind(input.organizationId, input.documentId));
    for (const review of activeReviews.results ?? []) {
      replacementStatements.push(
        db.prepare(
          `UPDATE professional_reviews SET invalidated_at = CURRENT_TIMESTAMP,
           invalidation_reason = 'evidence_replaced', invalidated_by_version_id = ?
           WHERE organization_id = ? AND id = ? AND invalidated_at IS NULL`,
        ).bind(versionId, input.organizationId, review.id),
        db.prepare(
          `UPDATE checklist_items SET workflow_status = 'evidence_added',
           updated_at = CURRENT_TIMESTAMP WHERE organization_id = ? AND id = ?`,
        ).bind(input.organizationId, review.checklistItemId),
      );
    }
    const results = await db.batch(replacementStatements);

    if (Number(results[1]?.meta?.changes ?? 0) !== 1) {
      await db
        .prepare(
          `DELETE FROM document_versions
           WHERE organization_id = ? AND id = ?`,
        )
        .bind(input.organizationId, versionId)
        .run();
      throw new ValidationError(
        "El documento cambió mientras subías el archivo. Vuelve a intentarlo.",
      );
    }

    const followUpStatements: D1PreparedStatement[] = [
      db
        .prepare(
          `UPDATE properties
           SET dossier_status = 'requires_professional_review',
             updated_at = CURRENT_TIMESTAMP
           WHERE organization_id = ? AND id = ?`,
        )
        .bind(input.organizationId, input.propertyId),
      auditStatement(
        db,
        membership,
        "document.version_uploaded_after_security_check",
        "document",
        input.documentId,
        {
          mimeType: file.type,
          previousVersionId: current.currentVersionId,
          securityEngine: securityCheck.engine,
          sizeBytes: file.size,
          versionId,
        },
      ),
    ];
    for (const review of activeReviews.results ?? []) {
      followUpStatements.push(
        auditStatement(
          db,
          membership,
          "review.invalidated",
          "professional_review",
          review.id,
          {
            documentId: input.documentId,
            previousVersionId: current.currentVersionId,
            reason: "evidence_replaced",
            replacementVersionId: versionId,
          },
        ),
      );
    }
    await db.batch(followUpStatements);
  } catch (error) {
    await env.DOCUMENTS.delete(storageKey);
    throw error;
  }
}

async function authorize(
  actor: ActorInput,
  organizationId: string,
  capability: Capability,
): Promise<MembershipContext> {
  const membership = await getMembershipContext(actor, organizationId);
  if (!membership || !can(membership.role as Role, capability)) {
    throw new AuthorizationError("No tienes permiso para realizar esta acción.");
  }
  return membership;
}

async function assertPropertyAccess(
  db: D1Database,
  membership: MembershipContext,
  propertyId: string,
): Promise<void> {
  if (!(await hasPropertyAccessIn(db, membership, propertyId))) {
    throw new NotFoundError("Vivienda no encontrada.");
  }
}

function auditStatement(
  db: D1Database,
  membership: MembershipContext,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown>,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO audit_events (
        id, organization_id, actor_user_id, actor_type, action,
        entity_type, entity_id, metadata_json
      ) VALUES (?, ?, ?, 'user', ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      membership.organizationId,
      membership.userId,
      action,
      entityType,
      entityId,
      JSON.stringify(metadata),
    );
}

async function propertyExists(
  db: D1Database,
  organizationId: string,
  propertyId: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT id FROM properties WHERE organization_id = ? AND id = ? LIMIT 1",
    )
    .bind(organizationId, propertyId)
    .first();
  return Boolean(row);
}

async function propertyDataProfile(
  db: D1Database,
  organizationId: string,
  propertyId: string,
): Promise<DataProfile> {
  const row = await db
    .prepare(
      `SELECT data_profile AS dataProfile
       FROM properties
       WHERE organization_id = ? AND id = ?
       LIMIT 1`,
    )
    .bind(organizationId, propertyId)
    .first<{ dataProfile: DataProfile }>();
  if (!row) throw new NotFoundError("Vivienda no encontrada.");
  return row.dataProfile;
}

async function assertPilotTextAllowed(
  db: D1Database,
  organizationId: string,
  propertyId: string,
  value: string,
): Promise<void> {
  if (
    (await propertyDataProfile(db, organizationId, propertyId)) !==
    "pilot_anonymized"
  ) {
    return;
  }
  const identifier = directIdentifierLabel(value);
  if (identifier) {
    throw new ValidationError(
      `El comentario parece contener ${identifier}. Retíralo para mantener la prueba anonimizada.`,
    );
  }
}

function assertPilotDocumentAllowed(
  dataProfile: DataProfile,
  input: UploadDocumentInput | ReplaceDocumentVersionInput,
  filename: string,
): void {
  if (dataProfile !== "pilot_anonymized") return;
  if (!input.anonymizationConfirmed) {
    throw new ValidationError(
      "Confirma que el archivo es ficticio o está anonimizado antes de subirlo.",
    );
  }
  const descriptiveText = "documentType" in input
    ? `${filename} ${input.documentType} ${input.notes ?? ""}`
    : filename;
  const identifier = directIdentifierLabel(descriptiveText);
  if (identifier) {
    throw new ValidationError(
      `El archivo o su descripción parece contener ${identifier}. Renómbralo o anonimízalo.`,
    );
  }
}

function validateProperty(
  input: CreatePropertyInput,
  options: {
    defaultNextAction?: boolean;
    permitStandardProfile?: boolean;
  } = {},
) {
  const islandCode = input.islandCode.trim();
  const fieldErrors=propertyFieldErrors(input);
  if(Object.keys(fieldErrors).length)throw new PropertyFieldValidationError(fieldErrors);
  if (!isIslandCode(islandCode)) {
    throw new ValidationError("Selecciona una isla válida.");
  }
  const municipality = municipalityNameForIsland(
    islandCode,
    input.municipality,
  );
  if (!municipality) {
    throw new ValidationError(
      `Selecciona un municipio de ${islandName(islandCode)}.`,
    );
  }
  const postalCode = input.postalCode.trim();
  if (!/^\d{5}$/.test(postalCode)) {
    throw new ValidationError("Introduce un código postal de 5 cifras.");
  }
  const activityStatus = input.activityStatus?.trim() || "not_started";
  if (!["not_started", "active", "paused", "ceased"].includes(activityStatus)) {
    throw new ValidationError("Estado de actividad no válido.");
  }

  const requestedDataProfile = input.dataProfile?.trim() || "standard";
  if (!isDataProfile(requestedDataProfile)) {
    throw new ValidationError("Perfil de datos no válido.");
  }
  const dataProfile = requestedDataProfile;
  if (dataProfile === "standard" && !options.permitStandardProfile) {
    throw new ValidationError(
      "Los datos reales permanecen desactivados hasta verificar MFA y análisis antimalware externo. Usa la prueba anonimizada.",
    );
  }
  if (dataProfile === "pilot_anonymized") {
    const syntheticError = syntheticPropertyError(input);
    if (syntheticError) throw new ValidationError(syntheticError);
    if (!isPilotOwnerAlias(input.ownerName)) {
      throw new ValidationError(
        "Usa un alias como Propietario 01 en la prueba anonimizada.",
      );
    }
    const identifier = directIdentifierLabel(
      `${input.alias} ${input.nextAction ?? ""}`,
    );
    if (identifier) {
      throw new ValidationError(
        `Retira ${identifier} antes de crear la prueba anonimizada.`,
      );
    }
  }

  return {
    activityStatus,
    addressLine: cleanOptional(input.addressLine, 180) ?? "",
    alias: cleanRequired(input.alias, "Alias", 80),
    cadastralReference: cleanOptional(input.cadastralReference, 30),
    dataProfile,
    islandCode: islandCode as IslandCode,
    municipality,
    nextAction:
      cleanOptional(input.nextAction, 160) ??
      (options.defaultNextAction === false
        ? null
        : "Completar documentación pendiente"),
    nextActionDueAt: validateOptionalDate(input.nextActionDueAt),
    ownerEmail: validateOptionalEmail(input.ownerEmail),
    ownerName: cleanRequired(input.ownerName, "Propietario", 120),
    ownerPhone: cleanOptional(input.ownerPhone, 30),
    postalCode,
  };
}

function assertPilotSecurityMode(dataProfile: DataProfile): void {
  if (dataProfile === "pilot_anonymized") return;
  throw new ValidationError(
    "La carga de documentos con datos reales permanece desactivada hasta disponer de MFA verificable y análisis antimalware externo.",
  );
}

function currentCanaryDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Atlantic/Canary",
    year: "numeric",
  }).format(new Date());
}

function cleanRequired(
  value: string | undefined,
  label: string,
  maxLength: number,
): string {
  const cleaned = value?.trim().replace(/\s+/g, " ") ?? "";
  if (cleaned.length < 2 || cleaned.length > maxLength) {
    throw new ValidationError(
      `${label} debe tener entre 2 y ${maxLength} caracteres.`,
    );
  }
  return cleaned;
}

function cleanOptional(
  value: string | undefined,
  maxLength: number,
): string | null {
  const cleaned = value?.trim().replace(/\s+/g, " ") ?? "";
  if (!cleaned) return null;
  if (cleaned.length > maxLength) {
    throw new ValidationError(`El valor no puede superar ${maxLength} caracteres.`);
  }
  return cleaned;
}

function validateOptionalEmail(value: string | undefined): string | null {
  const email = value?.trim().toLowerCase() ?? "";
  if (!email) return null;
  if (email.length > 180 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError("El correo del propietario no es válido.");
  }
  return email;
}

function validateOptionalDate(value: string | undefined): string | null {
  const date = value?.trim() ?? "";
  if (!date) return null;
  if (!validTaskDate(date)) {
    throw new ValidationError("La fecha no tiene un formato válido.");
  }
  return date;
}

function validateFile(file: File): File {
  const allowedMimeTypes = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
  ]);
  if (!allowedMimeTypes.has(file.type)) {
    throw new ValidationError("Solo se admiten archivos PDF, JPG o PNG.");
  }
  if (file.size < 1 || file.size > 10 * 1024 * 1024) {
    throw new ValidationError("El archivo debe ocupar menos de 10 MB.");
  }
  return file;
}

function sanitizeFilename(value: string): string {
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]/g, "-")
    .trim()
    .slice(0, 180);
  return cleaned || "documento";
}

async function digestSha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function propertyLocationLabel(
  islandCode: string,
  municipality: string,
): string {
  return `${municipality} · ${islandName(islandCode)}`;
}
