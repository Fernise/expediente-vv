import { env } from "cloudflare:workers";
import { createIdentityAccountIn, findIdentityAccountIn, getIdentityMembershipIn } from "@/db/identity-core";
import { commitOrganizationCreationIn } from "@/db/organization-creation-core";

export type OrganizationRole =
  | "organization_admin"
  | "manager"
  | "professional"
  | "owner";

export type OrganizationSummary = {
  id: string;
  name: string;
  role: OrganizationRole;
  slug: string;
  timezone: string;
};

export type ActorInput = {
  id: string;
  displayName: string;
  email: string;
};

export type MembershipContext = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: OrganizationRole;
  userId: string;
};

let initialization: Promise<void> | null = null;

export function database(): D1Database {
  if (!env.DB) {
    throw new Error("Database binding is unavailable");
  }
  return env.DB;
}

export async function getMembershipContext(
  actor: ActorInput,
  organizationId: string,
): Promise<MembershipContext | null> {
  await ensureCoreSchema();
  return getIdentityMembershipIn(database(), actor, organizationId, identityOptions());
}

export function ensureCoreSchema(): Promise<void> {
  if (process.env.NODE_ENV !== "development") {
    return Promise.resolve();
  }
  if (initialization) return initialization;

  const db = database();
  initialization = db
    .batch([
      db.prepare(
        `CREATE TABLE IF NOT EXISTS app_users (
          id TEXT PRIMARY KEY NOT NULL,
          email TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS organizations (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          slug TEXT NOT NULL UNIQUE,
          timezone TEXT NOT NULL DEFAULT 'Atlantic/Canary',
          status TEXT NOT NULL DEFAULT 'active',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS memberships (
          id TEXT PRIMARY KEY NOT NULL,
          organization_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          role TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          mfa_required INTEGER NOT NULL DEFAULT 0,
          accepted_at TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
          UNIQUE (organization_id, user_id)
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS audit_events (
          id TEXT PRIMARY KEY NOT NULL,
          organization_id TEXT NOT NULL,
          occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          actor_user_id TEXT,
          actor_type TEXT NOT NULL,
          action TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          request_id TEXT,
          metadata_json TEXT NOT NULL DEFAULT '{}',
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
          FOREIGN KEY (actor_user_id) REFERENCES app_users(id) ON DELETE SET NULL
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS invitations (
          id TEXT PRIMARY KEY NOT NULL,
          organization_id TEXT NOT NULL,
          email_normalized TEXT NOT NULL,
          role TEXT NOT NULL,
          scope TEXT NOT NULL,
          token_hash TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          accepted_at TEXT,
          revoked_at TEXT,
          invited_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          FOREIGN KEY (invited_by) REFERENCES app_users(id)
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS invitation_property_scopes (
          invitation_id TEXT NOT NULL,
          organization_id TEXT NOT NULL,
          property_id TEXT NOT NULL,
          PRIMARY KEY (invitation_id, property_id),
          FOREIGN KEY (invitation_id) REFERENCES invitations(id) ON DELETE CASCADE,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          FOREIGN KEY (organization_id, property_id) REFERENCES properties(organization_id, id)
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS notification_deliveries (
          id TEXT PRIMARY KEY NOT NULL,
          organization_id TEXT NOT NULL,
          channel TEXT NOT NULL DEFAULT 'email',
          template_key TEXT NOT NULL,
          recipient_email TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending_provider',
          deduplication_key TEXT NOT NULL UNIQUE,
          payload_json TEXT NOT NULL DEFAULT '{}',
          scheduled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          sent_at TEXT,
          error_code TEXT,
          attempt_count INTEGER NOT NULL DEFAULT 0,
          last_attempt_at TEXT,
          next_attempt_at TEXT,
          provider_message_id TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
        )`,
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS memberships_user_idx ON memberships(user_id)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS memberships_org_idx ON memberships(organization_id)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS audit_events_org_time_idx ON audit_events(organization_id, occurred_at)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS invitations_org_idx ON invitations(organization_id)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS invitations_email_idx ON invitations(email_normalized)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS invitation_scopes_org_idx ON invitation_property_scopes(organization_id)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS notification_deliveries_org_status_idx ON notification_deliveries(organization_id, status)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS notification_deliveries_entity_idx ON notification_deliveries(entity_type, entity_id)",
      ),
    ])
    .then(async () => {
      const userColumns = await db.prepare("PRAGMA table_info(app_users)").all<{ name: string }>();
      if (!(userColumns.results ?? []).some((column) => column.name === "sites_subject")) {
        await db.prepare("ALTER TABLE app_users ADD COLUMN sites_subject TEXT").run();
      }
      await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS app_users_sites_subject_uidx ON app_users(sites_subject)").run();
      const organizationColumns = await db
        .prepare("PRAGMA table_info(organizations)")
        .all<{ name: string }>();
      const existingOrganizationColumns = new Set(
        (organizationColumns.results ?? []).map((column) => column.name),
      );
      const organizationAdditions = [
        ["deletion_requested_at", "TEXT"],
        ["deletion_scheduled_at", "TEXT"],
      ].filter(([name]) => !existingOrganizationColumns.has(name));
      if (organizationAdditions.length > 0) {
        await db.batch(
          organizationAdditions.map(([name, definition]) =>
            db.prepare(
              `ALTER TABLE organizations ADD COLUMN ${name} ${definition}`,
            ),
          ),
        );
      }
      const columns = await db
        .prepare("PRAGMA table_info(notification_deliveries)")
        .all<{ name: string }>();
      const existing = new Set(
        (columns.results ?? []).map((column) => column.name),
      );
      const additions = [
        ["attempt_count", "INTEGER NOT NULL DEFAULT 0"],
        ["last_attempt_at", "TEXT"],
        ["next_attempt_at", "TEXT"],
        ["provider_message_id", "TEXT"],
      ].filter(([name]) => !existing.has(name));
      if (additions.length > 0) {
        await db.batch(
          additions.map(([name, definition]) =>
            db.prepare(
              `ALTER TABLE notification_deliveries ADD COLUMN ${name} ${definition}`,
            ),
          ),
        );
      }
      await db.batch([
        db.prepare(
          "CREATE INDEX IF NOT EXISTS notification_deliveries_dispatch_idx ON notification_deliveries(status, next_attempt_at, scheduled_at)",
        ),
        db.prepare("PRAGMA optimize"),
      ]);
    })
    .catch((error: unknown) => {
      initialization = null;
      throw error;
    });

  return initialization!;
}

export async function listOrganizationsForActor(
  actor: ActorInput,
): Promise<OrganizationSummary[]> {
  await ensureCoreSchema();
  const db = database();
  const email = normalizeEmail(actor.email);
  let user = await findIdentityAccountIn(db, actor, identityOptions());

  const pendingInvitations = await db
    .prepare(
      `SELECT id, organization_id AS organizationId, role, invited_by AS invitedBy
       FROM invitations
       WHERE email_normalized = ?
         AND accepted_at IS NULL
         AND revoked_at IS NULL
         AND expires_at > CURRENT_TIMESTAMP
       ORDER BY created_at DESC`,
    )
    .bind(email)
    .all<{
      id: string;
      invitedBy: string;
      organizationId: string;
      role: OrganizationRole;
    }>();

  if ((pendingInvitations.results?.length ?? 0) > 0) {
    user ??= await createIdentityAccountIn(db, actor, identityOptions());
    const userId = user.id;
    const statements: D1PreparedStatement[] = [];

    for (const invitation of pendingInvitations.results ?? []) {
      statements.push(
        db
          .prepare(
            `INSERT INTO memberships (
              id, organization_id, user_id, role, status, mfa_required,
              accepted_at
            ) VALUES (
              ?, ?, ?, ?, 'active',
              CASE WHEN ? IN ('organization_admin', 'professional') THEN 1 ELSE 0 END,
              CURRENT_TIMESTAMP
            )
            ON CONFLICT (organization_id, user_id) DO UPDATE SET
              role = excluded.role,
              status = 'active',
              mfa_required = excluded.mfa_required,
              accepted_at = COALESCE(memberships.accepted_at, CURRENT_TIMESTAMP),
              updated_at = CURRENT_TIMESTAMP`,
          )
          .bind(
            crypto.randomUUID(),
            invitation.organizationId,
            userId,
            invitation.role,
            invitation.role,
          ),
        db
          .prepare(
            `INSERT INTO property_access_grants (
              organization_id, property_id, user_id, access_role,
              expires_at, revoked_at, granted_by, created_at
            )
            SELECT organization_id, property_id, ?, ?, NULL, NULL, ?, CURRENT_TIMESTAMP
            FROM invitation_property_scopes
            WHERE invitation_id = ?
            ON CONFLICT (organization_id, property_id, user_id) DO UPDATE SET
              access_role = excluded.access_role,
              expires_at = NULL,
              revoked_at = NULL,
              granted_by = excluded.granted_by,
              created_at = CURRENT_TIMESTAMP`,
          )
          .bind(
            userId,
            invitation.role,
            invitation.invitedBy,
            invitation.id,
          ),
        db
          .prepare(
            `UPDATE invitations
             SET accepted_at = CURRENT_TIMESTAMP
             WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL`,
          )
          .bind(invitation.id),
        db
          .prepare(
            `UPDATE notification_deliveries
             SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
             WHERE organization_id = ?
               AND entity_type = 'invitation'
               AND entity_id = ?
               AND status IN ('pending_provider', 'queued', 'failed')`,
          )
          .bind(invitation.organizationId, invitation.id),
        db
          .prepare(
            `INSERT INTO audit_events (
              id, organization_id, actor_user_id, actor_type, action,
              entity_type, entity_id, metadata_json
            ) VALUES (?, ?, ?, 'user', 'invitation.accepted',
              'membership', ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            invitation.organizationId,
            userId,
            userId,
            JSON.stringify({ role: invitation.role }),
          ),
      );
    }

    await db.batch(statements);
  }

  if (!user) return [];

  const result = await db
    .prepare(
      `SELECT
        o.id,
        o.name,
        o.slug,
        o.timezone,
        m.role
      FROM organizations o
      INNER JOIN memberships m ON m.organization_id = o.id
      INNER JOIN app_users u ON u.id = m.user_id
      WHERE m.user_id = ?
        AND m.status = 'active'
        AND u.status = 'active'
        AND o.status = 'active'
      ORDER BY o.name COLLATE NOCASE`,
    )
    .bind(user.id)
    .all<OrganizationSummary>();

  return result.results ?? [];
}

export async function createOrganizationForActor(
  actor: ActorInput,
  requestedName: string,
  requestKey: string | null = null,
): Promise<OrganizationSummary> {
  await ensureCoreSchema();
  const db = database();
  const name = validateOrganizationName(requestedName);
  const organizationId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();
  const baseSlug = slugify(name);
  const slug = requestKey ? `${baseSlug}-${organizationId.slice(0, 12)}` : await availableSlug(db, baseSlug);

  const account = await createIdentityAccountIn(db, actor, identityOptions());
  const effectiveUserId = account.id;

  const statements: D1PreparedStatement[] = [];

  statements.push(
    db
      .prepare(
        `INSERT INTO organizations (id, name, slug, timezone)
         VALUES (?, ?, ?, 'Atlantic/Canary')`,
      )
      .bind(organizationId, name, slug),
    db
      .prepare(
        `INSERT INTO memberships (
          id, organization_id, user_id, role, status, mfa_required, accepted_at
        ) VALUES (?, ?, ?, 'organization_admin', 'active', 1, CURRENT_TIMESTAMP)`,
      )
      .bind(membershipId, organizationId, effectiveUserId),
    db
      .prepare(
        `INSERT INTO audit_events (
          id, organization_id, actor_user_id, actor_type, action,
          entity_type, entity_id, metadata_json
        ) VALUES (?, ?, ?, 'user', 'organization.created',
          'organization', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        organizationId,
        effectiveUserId,
        organizationId,
        JSON.stringify({ source: "onboarding" }),
      ),
  );

  return commitOrganizationCreationIn(db, effectiveUserId, requestKey, {
    id: organizationId,
    name,
    role: "organization_admin",
    slug,
    timezone: "Atlantic/Canary",
  }, statements);
}

export function normalizeEmail(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function identityOptions() {
  // Set only after all legacy accounts have an independently attested subject.
  return { allowLegacy: env.IDENTITY_ENFORCE_STABLE === undefined || env.IDENTITY_ENFORCE_STABLE === "false" };
}

function validateOrganizationName(value: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) {
    throw new Error("El nombre debe tener entre 2 y 80 caracteres.");
  }
  return name;
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return slug || "organizacion";
}

async function availableSlug(
  db: D1Database,
  baseSlug: string,
): Promise<string> {
  const existing = await db
    .prepare("SELECT id FROM organizations WHERE slug = ? LIMIT 1")
    .bind(baseSlug)
    .first();
  if (!existing) return baseSlug;
  return `${baseSlug}-${crypto.randomUUID().slice(0, 6)}`;
}
