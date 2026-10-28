import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const appUsers = sqliteTable(
  "app_users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    sitesSubject: text("sites_subject"),
    displayName: text("display_name").notNull(),
    status: text("status", { enum: ["active", "disabled"] })
      .notNull()
      .default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("app_users_email_uidx").on(table.email),
    uniqueIndex("app_users_sites_subject_uidx").on(table.sitesSubject),
  ],
);

export const organizations = sqliteTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    timezone: text("timezone").notNull().default("Atlantic/Canary"),
    status: text("status", { enum: ["active", "suspended", "closed"] })
      .notNull()
      .default("active"),
    deletionRequestedAt: text("deletion_requested_at"),
    deletionScheduledAt: text("deletion_scheduled_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("organizations_slug_uidx").on(table.slug)],
);

export const memberships = sqliteTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    role: text("role", {
      enum: [
        "organization_admin",
        "manager",
        "professional",
        "owner",
      ],
    }).notNull(),
    status: text("status", {
      enum: ["invited", "active", "suspended", "revoked"],
    })
      .notNull()
      .default("active"),
    mfaRequired: integer("mfa_required", { mode: "boolean" })
      .notNull()
      .default(false),
    acceptedAt: text("accepted_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("memberships_org_user_uidx").on(
      table.organizationId,
      table.userId,
    ),
    index("memberships_user_idx").on(table.userId),
    index("memberships_org_idx").on(table.organizationId),
  ],
);

export const mutationReceipts = sqliteTable("mutation_receipts", {
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
  requestKey: text("request_key").notNull(),
  fingerprint: text("fingerprint").notNull(),
  responseJson: text("response_json"),
  responseStatus: integer("response_status"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [primaryKey({ columns: [table.organizationId, table.userId, table.requestKey] })]);

export const organizationCreationReceipts = sqliteTable("organization_creation_receipts", {
  userId: text("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
  requestKey: text("request_key").notNull(),
  fingerprint: text("fingerprint").notNull(),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [primaryKey({ columns: [table.userId, table.requestKey] })]);

export const invitations = sqliteTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    emailNormalized: text("email_normalized").notNull(),
    role: text("role", {
      enum: [
        "organization_admin",
        "manager",
        "professional",
        "owner",
      ],
    }).notNull(),
    scope: text("scope", { enum: ["organization", "property"] }).notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    acceptedAt: text("accepted_at"),
    revokedAt: text("revoked_at"),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => appUsers.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("invitations_org_idx").on(table.organizationId),
    index("invitations_email_idx").on(table.emailNormalized),
  ],
);

export const notificationDeliveries = sqliteTable(
  "notification_deliveries",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    channel: text("channel", { enum: ["email"] })
      .notNull()
      .default("email"),
    templateKey: text("template_key", {
      enum: ["team_invitation", "operational_reminder"],
    }).notNull(),
    recipientEmail: text("recipient_email").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    status: text("status", {
      enum: [
        "pending_provider",
        "queued",
        "sent",
        "failed",
        "cancelled",
      ],
    })
      .notNull()
      .default("pending_provider"),
    deduplicationKey: text("deduplication_key").notNull(),
    payloadJson: text("payload_json").notNull().default("{}"),
    scheduledAt: text("scheduled_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    sentAt: text("sent_at"),
    errorCode: text("error_code"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastAttemptAt: text("last_attempt_at"),
    nextAttemptAt: text("next_attempt_at"),
    providerMessageId: text("provider_message_id"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("notification_deliveries_dedupe_uidx").on(
      table.deduplicationKey,
    ),
    index("notification_deliveries_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
    index("notification_deliveries_entity_idx").on(
      table.entityType,
      table.entityId,
    ),
    index("notification_deliveries_dispatch_idx").on(
      table.status,
      table.nextAttemptAt,
      table.scheduledAt,
    ),
  ],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    occurredAt: text("occurred_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    actorUserId: text("actor_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    actorType: text("actor_type", {
      enum: ["user", "system", "support"],
    }).notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    requestId: text("request_id"),
    metadataJson: text("metadata_json").notNull().default("{}"),
  },
  (table) => [
    index("audit_events_org_time_idx").on(
      table.organizationId,
      table.occurredAt,
    ),
    index("audit_events_entity_idx").on(table.entityType, table.entityId),
  ],
);

export const rateLimitBuckets = sqliteTable(
  "rate_limit_buckets",
  {
    scope: text("scope").notNull(),
    keyHash: text("key_hash").notNull(),
    windowStart: integer("window_start").notNull(),
    requestCount: integer("request_count").notNull().default(1),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.scope, table.keyHash, table.windowStart],
    }),
    index("rate_limit_buckets_expires_idx").on(table.expiresAt),
  ],
);

export const operationalRuns = sqliteTable(
  "operational_runs",
  {
    id: text("id").primaryKey(),
    trigger: text("trigger").notNull(),
    status: text("status", {
      enum: ["succeeded", "failed"],
    }).notNull(),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at").notNull(),
    durationMs: integer("duration_ms").notNull(),
    componentsJson: text("components_json").notNull().default("[]"),
    failureCodesJson: text("failure_codes_json").notNull().default("[]"),
  },
  (table) => [
    index("operational_runs_completed_idx").on(table.completedAt),
  ],
);

export const operationalScheduleClaims = sqliteTable(
  "operational_schedule_claims",
  {
    cycle: text("cycle").notNull(),
    bucket: text("bucket").notNull(),
    claimedAt: text("claimed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.cycle, table.bucket] }),
    index("operational_schedule_claims_claimed_idx").on(table.claimedAt),
  ],
);

export const pilotDemoRequests = sqliteTable(
  "pilot_demo_requests",
  {
    id: text("id").primaryKey(),
    fullName: text("full_name").notNull(),
    emailNormalized: text("email_normalized").notNull(),
    organizationName: text("organization_name").notNull(),
    professionalProfile: text("professional_profile", {
      enum: ["gestoria", "gestor", "arquitectura", "legal", "otro"],
    }).notNull(),
    propertyRange: text("property_range", {
      enum: ["1-5", "6-20", "21-50", "51+"],
    }).notNull(),
    message: text("message"),
    communicationsConsent: integer("communications_consent", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    privacyAcceptedAt: text("privacy_accepted_at").notNull(),
    source: text("source").notNull().default("public_demo_form"),
    status: text("status", { enum: ["new", "contacted", "closed"] })
      .notNull()
      .default("new"),
    notificationStatus: text("notification_status", {
      enum: ["pending", "sent", "failed"],
    })
      .notNull()
      .default("pending"),
    retentionUntil: text("retention_until").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("pilot_demo_requests_email_time_idx").on(
      table.emailNormalized,
      table.createdAt,
    ),
    index("pilot_demo_requests_status_time_idx").on(
      table.status,
      table.createdAt,
    ),
    index("pilot_demo_requests_retention_idx").on(table.retentionUntil),
  ],
);

export const owners = sqliteTable(
  "owners",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("owners_org_id_uidx").on(table.organizationId, table.id),
    index("owners_org_name_idx").on(table.organizationId, table.displayName),
  ],
);

export const properties = sqliteTable(
  "properties",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    internalReference: text("internal_reference").notNull(),
    addressLine: text("address_line").notNull(),
    islandCode: text("island_code").notNull(),
    municipality: text("municipality").notNull(),
    postalCode: text("postal_code").notNull(),
    cadastralReference: text("cadastral_reference"),
    dataProfile: text("data_profile", {
      enum: ["standard", "pilot_anonymized"],
    })
      .notNull()
      .default("standard"),
    ownerId: text("owner_id").notNull(),
    managerUserId: text("manager_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    activityStatus: text("activity_status", {
      enum: ["not_started", "active", "paused", "ceased"],
    })
      .notNull()
      .default("not_started"),
    dossierStatus: text("dossier_status", {
      enum: [
        "incomplete",
        "pending_documents",
        "requires_professional_review",
        "ready_for_review",
        "professionally_reviewed",
      ],
    })
      .notNull()
      .default("incomplete"),
    nextAction: text("next_action"),
    nextActionDueAt: text("next_action_due_at"),
    archivedAt: text("archived_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("properties_org_id_uidx").on(table.organizationId, table.id),
    foreignKey({
      columns: [table.organizationId, table.ownerId],
      foreignColumns: [owners.organizationId, owners.id],
      name: "properties_org_owner_fk",
    }),
    index("properties_org_status_idx").on(
      table.organizationId,
      table.dossierStatus,
    ),
    index("properties_org_island_idx").on(
      table.organizationId,
      table.islandCode,
    ),
    index("properties_org_manager_idx").on(
      table.organizationId,
      table.managerUserId,
    ),
  ],
);

export const propertyChecklists = sqliteTable(
  "property_checklists",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    propertyId: text("property_id").notNull(),
    ruleVersionLabel: text("rule_version_label").notNull(),
    validationStatus: text("validation_status", {
      enum: ["draft_unvalidated", "professionally_reviewed"],
    })
      .notNull()
      .default("draft_unvalidated"),
    status: text("status", { enum: ["active", "superseded"] })
      .notNull()
      .default("active"),
    generatedAt: text("generated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    generatedBy: text("generated_by")
      .notNull()
      .references(() => appUsers.id),
    engineVersion: text("engine_version").notNull(),
  },
  (table) => [
    uniqueIndex("property_checklists_org_id_uidx").on(
      table.organizationId,
      table.id,
    ),
    foreignKey({
      columns: [table.organizationId, table.propertyId],
      foreignColumns: [properties.organizationId, properties.id],
      name: "property_checklists_org_property_fk",
    }),
    index("property_checklists_property_idx").on(
      table.organizationId,
      table.propertyId,
    ),
  ],
);

export const checklistItems = sqliteTable(
  "checklist_items",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    checklistId: text("checklist_id").notNull(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    explanation: text("explanation").notNull(),
    itemKind: text("item_kind", {enum:["operational","professional_requirement"]}).notNull().default("professional_requirement"),
    workflowStatus: text("workflow_status", {
      enum: [
        "pending",
        "document_requested",
        "evidence_added",
        "in_review",
        "observed",
        "reviewed",
        "in_progress",
        "completed",
      ],
    })
      .notNull()
      .default("pending"),
    assigneeUserId: text("assignee_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    dueAt: text("due_at"),
    position: integer("position").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("checklist_items_org_id_uidx").on(
      table.organizationId,
      table.id,
    ),
    foreignKey({
      columns: [table.organizationId, table.checklistId],
      foreignColumns: [
        propertyChecklists.organizationId,
        propertyChecklists.id,
      ],
      name: "checklist_items_org_checklist_fk",
    }),
    index("checklist_items_checklist_idx").on(
      table.organizationId,
      table.checklistId,
      table.position,
    ),
  ],
);

export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    propertyId: text("property_id").notNull(),
    checklistItemId: text("checklist_item_id"),
    documentType: text("document_type").notNull(),
    documentDate: text("document_date"),
    expiresAt: text("expires_at"),
    workflowStatus: text("workflow_status", {
      enum: ["quarantined", "available", "rejected", "archived"],
    })
      .notNull()
      .default("quarantined"),
    notes: text("notes").notNull().default(""),
    currentVersionId: text("current_version_id"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("documents_org_id_uidx").on(table.organizationId, table.id),
    foreignKey({
      columns: [table.organizationId, table.propertyId],
      foreignColumns: [properties.organizationId, properties.id],
      name: "documents_org_property_fk",
    }),
    index("documents_property_idx").on(
      table.organizationId,
      table.propertyId,
    ),
    index("documents_expiry_idx").on(table.organizationId, table.expiresAt),
  ],
);

export const documentVersions = sqliteTable(
  "document_versions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    documentId: text("document_id").notNull(),
    storageKey: text("storage_key").notNull(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    malwareScanStatus: text("malware_scan_status", {
      enum: ["pending", "structural_only", "clean", "infected", "failed"],
    })
      .notNull()
      .default("pending"),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => appUsers.id),
    uploadedAt: text("uploaded_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    supersedesId: text("supersedes_id"),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.documentId],
      foreignColumns: [documents.organizationId, documents.id],
      name: "document_versions_org_document_fk",
    }),
    uniqueIndex("document_versions_storage_key_uidx").on(table.storageKey),
    uniqueIndex("document_versions_org_id_uidx").on(
      table.organizationId,
      table.id,
    ),
    index("document_versions_document_idx").on(
      table.organizationId,
      table.documentId,
    ),
  ],
);

export const evidenceLinks = sqliteTable(
  "evidence_links",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    propertyId: text("property_id").notNull(),
    checklistItemId: text("checklist_item_id").notNull(),
    documentId: text("document_id").notNull(),
    sufficiency: text("sufficiency", { enum: ["unassessed", "sufficient", "insufficient"] }).notNull().default("unassessed"),
    assessedVersionId: text("assessed_version_id"),
    assessedAt: text("assessed_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    foreignKey({ columns: [table.organizationId, table.propertyId], foreignColumns: [properties.organizationId, properties.id], name: "evidence_links_org_property_fk" }),
    foreignKey({ columns: [table.organizationId, table.checklistItemId], foreignColumns: [checklistItems.organizationId, checklistItems.id], name: "evidence_links_org_item_fk" }),
    foreignKey({ columns: [table.organizationId, table.documentId], foreignColumns: [documents.organizationId, documents.id], name: "evidence_links_org_document_fk" }),
    uniqueIndex("evidence_links_org_item_document_uidx").on(table.organizationId, table.checklistItemId, table.documentId),
    index("evidence_links_property_idx").on(table.organizationId, table.propertyId),
    index("evidence_links_document_idx").on(table.organizationId, table.documentId),
  ],
);

export const professionalReviews = sqliteTable(
  "professional_reviews",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    propertyId: text("property_id").notNull(),
    checklistItemId: text("checklist_item_id").notNull(),
    documentId: text("document_id").notNull(),
    documentVersionId: text("document_version_id").notNull(),
    reviewerUserId: text("reviewer_user_id")
      .notNull()
      .references(() => appUsers.id),
    decision: text("decision", {
      enum: ["approved", "rejected", "changes_requested"],
    }).notNull(),
    observation: text("observation").notNull(),
    reviewedAt: text("reviewed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    invalidatedAt: text("invalidated_at"),
    invalidationReason: text("invalidation_reason"),
    invalidatedByVersionId: text("invalidated_by_version_id"),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.propertyId],
      foreignColumns: [properties.organizationId, properties.id],
      name: "professional_reviews_org_property_fk",
    }),
    foreignKey({
      columns: [table.organizationId, table.checklistItemId],
      foreignColumns: [checklistItems.organizationId, checklistItems.id],
      name: "professional_reviews_org_item_fk",
    }),
    foreignKey({
      columns: [table.organizationId, table.documentId],
      foreignColumns: [documents.organizationId, documents.id],
      name: "professional_reviews_org_document_fk",
    }),
    foreignKey({
      columns: [table.organizationId, table.documentVersionId],
      foreignColumns: [documentVersions.organizationId, documentVersions.id],
      name: "professional_reviews_org_version_fk",
    }),
    index("professional_reviews_property_idx").on(
      table.organizationId,
      table.propertyId,
      table.reviewedAt,
    ),
    index("professional_reviews_item_idx").on(
      table.organizationId,
      table.checklistItemId,
      table.invalidatedAt,
    ),
    uniqueIndex("professional_reviews_active_item_uidx")
      .on(table.organizationId, table.checklistItemId)
      .where(sql`${table.invalidatedAt} IS NULL`),
  ],
);

export const reminders = sqliteTable(
  "reminders",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    propertyId: text("property_id").notNull(),
    targetType: text("target_type", {
      enum: ["document", "checklist_item", "property"],
    }).notNull(),
    targetId: text("target_id").notNull(),
    kind: text("kind", {
      enum: [
        "document_expiry",
        "checklist_due",
        "next_action_due",
        "professional_review",
      ],
    }).notNull(),
    dueAt: text("due_at"),
    channel: text("channel", { enum: ["in_app"] })
      .notNull()
      .default("in_app"),
    recipientUserId: text("recipient_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    status: text("status", { enum: ["active", "resolved"] })
      .notNull()
      .default("active"),
    deduplicationKey: text("deduplication_key").notNull(),
    lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    resolvedAt: text("resolved_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("reminders_dedupe_uidx").on(table.deduplicationKey),
    foreignKey({
      columns: [table.organizationId, table.propertyId],
      foreignColumns: [properties.organizationId, properties.id],
      name: "reminders_org_property_fk",
    }),
    index("reminders_org_status_idx").on(table.organizationId, table.status),
    index("reminders_recipient_status_idx").on(
      table.recipientUserId,
      table.status,
    ),
  ],
);

export const reminderSyncRuns = sqliteTable(
  "reminder_sync_runs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    runDate: text("run_date").notNull(),
    status: text("status", { enum: ["running", "completed", "failed"] })
      .notNull()
      .default("running"),
    candidateCount: integer("candidate_count").notNull().default(0),
    activeCount: integer("active_count").notNull().default(0),
    startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    completedAt: text("completed_at"),
  },
  (table) => [
    uniqueIndex("reminder_sync_runs_org_date_uidx").on(
      table.organizationId,
      table.runDate,
    ),
  ],
);

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    propertyId: text("property_id").notNull(),
    checklistItemId: text("checklist_item_id"),
    visibility: text("visibility", { enum: ["internal", "external"] })
      .notNull()
      .default("internal"),
    body: text("body").notNull(),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => appUsers.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    editedAt: text("edited_at"),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.propertyId],
      foreignColumns: [properties.organizationId, properties.id],
      name: "comments_org_property_fk",
    }),
    index("comments_property_idx").on(
      table.organizationId,
      table.propertyId,
      table.createdAt,
    ),
  ],
);

export const propertyAccessGrants = sqliteTable(
  "property_access_grants",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    propertyId: text("property_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    accessRole: text("access_role", {
      enum: ["professional", "owner"],
    }).notNull(),
    expiresAt: text("expires_at"),
    revokedAt: text("revoked_at"),
    grantedBy: text("granted_by")
      .notNull()
      .references(() => appUsers.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({
      columns: [table.organizationId, table.propertyId, table.userId],
    }),
    foreignKey({
      columns: [table.organizationId, table.propertyId],
      foreignColumns: [properties.organizationId, properties.id],
      name: "property_access_org_property_fk",
    }),
    index("property_access_user_idx").on(table.userId),
  ],
);

export const invitationPropertyScopes = sqliteTable(
  "invitation_property_scopes",
  {
    invitationId: text("invitation_id")
      .notNull()
      .references(() => invitations.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    propertyId: text("property_id").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.invitationId, table.propertyId],
    }),
    foreignKey({
      columns: [table.organizationId, table.propertyId],
      foreignColumns: [properties.organizationId, properties.id],
      name: "invitation_scope_org_property_fk",
    }),
    index("invitation_scopes_org_idx").on(table.organizationId),
  ],
);

export const factDefinitions = sqliteTable(
  "fact_definitions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    factKey: text("fact_key").notNull(),
    label: text("label").notNull(),
    valueType: text("value_type", {
      enum: ["boolean", "text", "date", "enum"],
    }).notNull(),
    allowedValuesJson: text("allowed_values_json").notNull().default("[]"),
    sensitivity: text("sensitivity", {
      enum: ["normal", "restricted"],
    })
      .notNull()
      .default("normal"),
    status: text("status", { enum: ["active", "retired"] })
      .notNull()
      .default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("fact_definitions_org_key_uidx").on(
      table.organizationId,
      table.factKey,
    ),
  ],
);

export const propertyFacts = sqliteTable(
  "property_facts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    propertyId: text("property_id").notNull(),
    factDefinitionId: text("fact_definition_id")
      .notNull()
      .references(() => factDefinitions.id),
    factKey: text("fact_key").notNull(),
    valueType: text("value_type", {
      enum: ["boolean", "text", "date", "enum"],
    }).notNull(),
    textValue: text("text_value"),
    booleanValue: integer("boolean_value", { mode: "boolean" }),
    source: text("source", {
      enum: ["declared", "document", "professional"],
    })
      .notNull()
      .default("declared"),
    confidence: text("confidence", {
      enum: ["declared", "documented", "professionally_reviewed"],
    })
      .notNull()
      .default("declared"),
    observedAt: text("observed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => appUsers.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("property_facts_org_property_key_uidx").on(
      table.organizationId,
      table.propertyId,
      table.factKey,
    ),
    foreignKey({
      columns: [table.organizationId, table.propertyId],
      foreignColumns: [properties.organizationId, properties.id],
      name: "property_facts_org_property_fk",
    }),
    index("property_facts_property_idx").on(
      table.organizationId,
      table.propertyId,
    ),
  ],
);

export const requirements = sqliteTable(
  "requirements",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    stableKey: text("stable_key").notNull(),
    category: text("category").notNull(),
    status: text("status", { enum: ["active", "retired"] })
      .notNull()
      .default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("requirements_org_key_uidx").on(
      table.organizationId,
      table.stableKey,
    ),
    uniqueIndex("requirements_org_id_uidx").on(table.organizationId, table.id),
  ],
);

export const rules = sqliteTable(
  "rules",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    stableKey: text("stable_key").notNull(),
    name: text("name").notNull(),
    requirementId: text("requirement_id").notNull(),
    status: text("status", { enum: ["active", "retired"] })
      .notNull()
      .default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("rules_org_key_uidx").on(table.organizationId, table.stableKey),
    uniqueIndex("rules_org_id_uidx").on(table.organizationId, table.id),
    foreignKey({
      columns: [table.organizationId, table.requirementId],
      foreignColumns: [requirements.organizationId, requirements.id],
      name: "rules_org_requirement_fk",
    }),
  ],
);

export const ruleVersions = sqliteTable(
  "rule_versions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ruleId: text("rule_id").notNull(),
    versionNumber: integer("version_number").notNull(),
    territoryScope: text("territory_scope").notNull(),
    effectiveFrom: text("effective_from"),
    effectiveTo: text("effective_to"),
    reviewDueAt: text("review_due_at"),
    validationStatus: text("validation_status", {
      enum: [
        "draft_unvalidated",
        "in_review",
        "reviewed",
        "approved",
        "published",
        "retired",
      ],
    })
      .notNull()
      .default("draft_unvalidated"),
    conditionJson: text("condition_json").notNull(),
    outcomeJson: text("outcome_json").notNull(),
    displayTitle: text("display_title").notNull(),
    displayExplanation: text("display_explanation").notNull(),
    contentHash: text("content_hash").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => appUsers.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("rule_versions_org_rule_version_uidx").on(
      table.organizationId,
      table.ruleId,
      table.versionNumber,
    ),
    uniqueIndex("rule_versions_org_id_uidx").on(table.organizationId, table.id),
    foreignKey({
      columns: [table.organizationId, table.ruleId],
      foreignColumns: [rules.organizationId, rules.id],
      name: "rule_versions_org_rule_fk",
    }),
  ],
);

export const sourceReferences = sqliteTable(
  "source_references",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    issuer: text("issuer").notNull(),
    title: text("title").notNull(),
    officialUrl: text("official_url"),
    publicationDate: text("publication_date"),
    consultedAt: text("consulted_at").notNull(),
    territoryScope: text("territory_scope").notNull(),
    sourceType: text("source_type", {
      enum: ["internal_demo", "official", "professional_note"],
    }).notNull(),
    status: text("status", { enum: ["draft", "active", "retired"] })
      .notNull()
      .default("draft"),
    reviewDueAt: text("review_due_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("source_references_org_id_uidx").on(
      table.organizationId,
      table.id,
    ),
  ],
);

export const ruleVersionSources = sqliteTable(
  "rule_version_sources",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ruleVersionId: text("rule_version_id").notNull(),
    sourceReferenceId: text("source_reference_id").notNull(),
    locator: text("locator"),
    note: text("note"),
  },
  (table) => [
    primaryKey({
      columns: [
        table.organizationId,
        table.ruleVersionId,
        table.sourceReferenceId,
      ],
    }),
    foreignKey({
      columns: [table.organizationId, table.ruleVersionId],
      foreignColumns: [ruleVersions.organizationId, ruleVersions.id],
      name: "rule_version_sources_org_rule_version_fk",
    }),
    foreignKey({
      columns: [table.organizationId, table.sourceReferenceId],
      foreignColumns: [sourceReferences.organizationId, sourceReferences.id],
      name: "rule_version_sources_org_source_fk",
    }),
  ],
);

export const ruleSets = sqliteTable(
  "rule_sets",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    stableKey: text("stable_key").notNull(),
    name: text("name").notNull(),
    status: text("status", { enum: ["active", "retired"] })
      .notNull()
      .default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("rule_sets_org_key_uidx").on(
      table.organizationId,
      table.stableKey,
    ),
    uniqueIndex("rule_sets_org_id_uidx").on(table.organizationId, table.id),
  ],
);

export const ruleSetVersions = sqliteTable(
  "rule_set_versions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ruleSetId: text("rule_set_id").notNull(),
    versionNumber: integer("version_number").notNull(),
    label: text("label").notNull(),
    validationStatus: text("validation_status", {
      enum: [
        "draft_unvalidated",
        "in_review",
        "reviewed",
        "approved",
        "published",
        "retired",
      ],
    })
      .notNull()
      .default("draft_unvalidated"),
    contentHash: text("content_hash").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => appUsers.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("rule_set_versions_org_set_version_uidx").on(
      table.organizationId,
      table.ruleSetId,
      table.versionNumber,
    ),
    uniqueIndex("rule_set_versions_org_id_uidx").on(
      table.organizationId,
      table.id,
    ),
    foreignKey({
      columns: [table.organizationId, table.ruleSetId],
      foreignColumns: [ruleSets.organizationId, ruleSets.id],
      name: "rule_set_versions_org_rule_set_fk",
    }),
  ],
);

export const ruleReviewEvents = sqliteTable(
  "rule_review_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ruleSetVersionId: text("rule_set_version_id").notNull(),
    action: text("action", {
      enum: [
        "submitted",
        "withdrawn",
        "changes_requested",
        "professionally_reviewed",
        "approved",
      ],
    }).notNull(),
    note: text("note"),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => appUsers.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("rule_review_events_version_idx").on(
      table.organizationId,
      table.ruleSetVersionId,
      table.createdAt,
    ),
    foreignKey({
      columns: [table.organizationId, table.ruleSetVersionId],
      foreignColumns: [
        ruleSetVersions.organizationId,
        ruleSetVersions.id,
      ],
      name: "rule_review_events_org_set_version_fk",
    }),
  ],
);

export const ruleSetVersionRules = sqliteTable(
  "rule_set_version_rules",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ruleSetVersionId: text("rule_set_version_id").notNull(),
    ruleVersionId: text("rule_version_id").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.organizationId,
        table.ruleSetVersionId,
        table.ruleVersionId,
      ],
    }),
    foreignKey({
      columns: [table.organizationId, table.ruleSetVersionId],
      foreignColumns: [ruleSetVersions.organizationId, ruleSetVersions.id],
      name: "rule_set_version_rules_org_set_version_fk",
    }),
    foreignKey({
      columns: [table.organizationId, table.ruleVersionId],
      foreignColumns: [ruleVersions.organizationId, ruleVersions.id],
      name: "rule_set_version_rules_org_rule_version_fk",
    }),
  ],
);

export const ruleEvaluations = sqliteTable(
  "rule_evaluations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    propertyId: text("property_id").notNull(),
    ruleSetVersionId: text("rule_set_version_id").notNull(),
    factSnapshotJson: text("fact_snapshot_json").notNull(),
    resultSummaryJson: text("result_summary_json").notNull(),
    contentHash: text("content_hash").notNull(),
    engineVersion: text("engine_version").notNull(),
    evaluatedBy: text("evaluated_by")
      .notNull()
      .references(() => appUsers.id),
    evaluatedAt: text("evaluated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("rule_evaluations_org_id_uidx").on(
      table.organizationId,
      table.id,
    ),
    foreignKey({
      columns: [table.organizationId, table.propertyId],
      foreignColumns: [properties.organizationId, properties.id],
      name: "rule_evaluations_org_property_fk",
    }),
    foreignKey({
      columns: [table.organizationId, table.ruleSetVersionId],
      foreignColumns: [ruleSetVersions.organizationId, ruleSetVersions.id],
      name: "rule_evaluations_org_set_version_fk",
    }),
    index("rule_evaluations_property_idx").on(
      table.organizationId,
      table.propertyId,
      table.evaluatedAt,
    ),
  ],
);

export const ruleEvaluationItems = sqliteTable(
  "rule_evaluation_items",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    evaluationId: text("evaluation_id").notNull(),
    ruleVersionId: text("rule_version_id").notNull(),
    requirementId: text("requirement_id").notNull(),
    result: text("result", {
      enum: ["applies", "not_applies", "unknown", "conflict"],
    }).notNull(),
    traceJson: text("trace_json").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.evaluationId],
      foreignColumns: [ruleEvaluations.organizationId, ruleEvaluations.id],
      name: "rule_evaluation_items_org_evaluation_fk",
    }),
    foreignKey({
      columns: [table.organizationId, table.ruleVersionId],
      foreignColumns: [ruleVersions.organizationId, ruleVersions.id],
      name: "rule_evaluation_items_org_rule_version_fk",
    }),
    foreignKey({
      columns: [table.organizationId, table.requirementId],
      foreignColumns: [requirements.organizationId, requirements.id],
      name: "rule_evaluation_items_org_requirement_fk",
    }),
    index("rule_evaluation_items_evaluation_idx").on(
      table.organizationId,
      table.evaluationId,
    ),
  ],
);
