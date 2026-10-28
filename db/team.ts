import {
  database,
  ensureCoreSchema,
  getMembershipContext,
  normalizeEmail,
  type ActorInput,
  type MembershipContext,
  type OrganizationRole,
} from "@/db/organizations";
import { can, type Role } from "@/lib/permissions";

export type PropertyAccessSummary = {
  expiresAt: string | null;
  id: string;
  name: string;
};

export type TeamMember = {
  acceptedAt: string | null;
  displayName: string;
  email: string;
  id: string;
  isCurrentActor: boolean;
  propertyAccess: PropertyAccessSummary[];
  role: OrganizationRole;
  status: "active" | "suspended";
  userId: string;
};

export type TeamInvitation = {
  attemptCount: number;
  createdAt: string;
  deliveryErrorCode: string | null;
  deliveryStatus:
    | "pending_provider"
    | "queued"
    | "sent"
    | "failed"
    | "cancelled"
    | null;
  email: string;
  expiresAt: string;
  id: string;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  propertyAccess: Array<{ id: string; name: string }>;
  role: OrganizationRole;
  scope: "organization" | "property";
  sentAt: string | null;
};

export type TeamOverview = {
  invitations: TeamInvitation[];
  members: TeamMember[];
};

type InviteMemberInput = {
  email: string;
  propertyIds?: string[];
  role: OrganizationRole;
};

type UpdateMemberInput = {
  expiresAt?: string | null;
  propertyIds?: string[];
  role: OrganizationRole;
};

const assignableRoles: OrganizationRole[] = [
  "organization_admin",
  "manager",
  "professional",
  "owner",
];

export class TeamAuthorizationError extends Error {}
export class TeamValidationError extends Error {}

export async function listTeam(
  actor: ActorInput,
  organizationId: string,
): Promise<TeamOverview> {
  await ensureTeamSchema();
  await authorizeTeamManagement(actor, organizationId);
  const db = database();
  const actorEmail = normalizeEmail(actor.email);
  const [memberResult, grantResult, invitationResult, invitationScopeResult] =
    await Promise.all([
      db
        .prepare(
          `SELECT
            m.id,
            m.user_id AS userId,
            m.role,
            m.status,
            m.accepted_at AS acceptedAt,
            u.display_name AS displayName,
            u.email
          FROM memberships m
          INNER JOIN app_users u ON u.id = m.user_id
          WHERE m.organization_id = ?
            AND m.status IN ('active', 'suspended')
          ORDER BY
            CASE m.role
              WHEN 'organization_admin' THEN 0
              WHEN 'manager' THEN 1
              WHEN 'professional' THEN 2
              ELSE 3
            END,
            u.display_name COLLATE NOCASE`,
        )
        .bind(organizationId)
        .all<Omit<TeamMember, "isCurrentActor" | "propertyAccess">>(),
      db
        .prepare(
          `SELECT
            pag.user_id AS userId,
            pag.property_id AS id,
            p.alias AS name,
            pag.expires_at AS expiresAt
          FROM property_access_grants pag
          INNER JOIN properties p
            ON p.organization_id = pag.organization_id
           AND p.id = pag.property_id
          WHERE pag.organization_id = ?
            AND pag.revoked_at IS NULL
            AND (pag.expires_at IS NULL OR pag.expires_at >= CURRENT_TIMESTAMP)
          ORDER BY p.alias COLLATE NOCASE`,
        )
        .bind(organizationId)
        .all<PropertyAccessSummary & { userId: string }>(),
      db
        .prepare(
          `SELECT
            i.id,
            i.email_normalized AS email,
            i.role,
            i.scope,
            i.expires_at AS expiresAt,
            i.created_at AS createdAt,
            nd.status AS deliveryStatus,
            COALESCE(nd.attempt_count, 0) AS attemptCount,
            nd.last_attempt_at AS lastAttemptAt,
            nd.next_attempt_at AS nextAttemptAt,
            nd.sent_at AS sentAt,
            nd.error_code AS deliveryErrorCode
          FROM invitations i
          LEFT JOIN notification_deliveries nd
            ON nd.organization_id = i.organization_id
           AND nd.entity_type = 'invitation'
           AND nd.entity_id = i.id
           AND nd.template_key = 'team_invitation'
          WHERE i.organization_id = ?
            AND i.accepted_at IS NULL
            AND i.revoked_at IS NULL
            AND i.expires_at > CURRENT_TIMESTAMP
          ORDER BY i.created_at DESC`,
        )
        .bind(organizationId)
        .all<Omit<TeamInvitation, "propertyAccess">>(),
      db
        .prepare(
          `SELECT
            ips.invitation_id AS invitationId,
            ips.property_id AS id,
            p.alias AS name
          FROM invitation_property_scopes ips
          INNER JOIN properties p
            ON p.organization_id = ips.organization_id
           AND p.id = ips.property_id
          WHERE ips.organization_id = ?
          ORDER BY p.alias COLLATE NOCASE`,
        )
        .bind(organizationId)
        .all<{ id: string; invitationId: string; name: string }>(),
    ]);

  const grantsByUser = new Map<string, PropertyAccessSummary[]>();
  for (const grant of grantResult.results ?? []) {
    const current = grantsByUser.get(grant.userId) ?? [];
    current.push({
      expiresAt: grant.expiresAt,
      id: grant.id,
      name: grant.name,
    });
    grantsByUser.set(grant.userId, current);
  }

  const scopesByInvitation = new Map<
    string,
    Array<{ id: string; name: string }>
  >();
  for (const scope of invitationScopeResult.results ?? []) {
    const current = scopesByInvitation.get(scope.invitationId) ?? [];
    current.push({ id: scope.id, name: scope.name });
    scopesByInvitation.set(scope.invitationId, current);
  }

  return {
    invitations: (invitationResult.results ?? []).map((invitation) => ({
      ...invitation,
      propertyAccess: scopesByInvitation.get(invitation.id) ?? [],
    })),
    members: (memberResult.results ?? []).map((member) => ({
      ...member,
      isCurrentActor: normalizeEmail(member.email) === actorEmail,
      propertyAccess: grantsByUser.get(member.userId) ?? [],
    })),
  };
}

export async function inviteTeamMember(
  actor: ActorInput,
  organizationId: string,
  input: InviteMemberInput,
): Promise<
  | { kind: "invitation"; deliveryId: string }
  | { kind: "member" }
> {
  await ensureTeamSchema();
  const membership = await authorizeTeamManagement(actor, organizationId);
  const db = database();
  const email = validateEmail(input.email);
  const role = validateRole(input.role);
  const propertyIds = await validatePropertyScope(
    db,
    organizationId,
    role,
    input.propertyIds,
  );

  if (email === normalizeEmail(actor.email)) {
    throw new TeamValidationError(
      "Tu cuenta ya forma parte de este espacio.",
    );
  }

  const existingMembership = await db
    .prepare(
      `SELECT m.id, m.status
       FROM memberships m
       INNER JOIN app_users u ON u.id = m.user_id
       WHERE m.organization_id = ? AND u.email = ?
       LIMIT 1`,
    )
    .bind(organizationId, email)
    .first<{ id: string; status: string }>();

  if (
    existingMembership?.status === "active" ||
    existingMembership?.status === "suspended"
  ) {
    throw new TeamValidationError(
      "Esta persona ya forma parte del espacio.",
    );
  }

  const existingUser = await db
    .prepare("SELECT id FROM app_users WHERE email = ? LIMIT 1")
    .bind(email)
    .first<{ id: string }>();

  if (existingUser) {
    const membershipId = existingMembership?.id ?? crypto.randomUUID();
    const statements: D1PreparedStatement[] = [
      existingMembership
        ? db
            .prepare(
              `UPDATE memberships
               SET role = ?, status = 'active',
                   mfa_required = CASE
                     WHEN ? IN ('organization_admin', 'professional') THEN 1 ELSE 0
                   END,
                   accepted_at = COALESCE(accepted_at, CURRENT_TIMESTAMP),
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = ? AND organization_id = ?`,
            )
            .bind(role, role, membershipId, organizationId)
        : db
            .prepare(
              `INSERT INTO memberships (
                id, organization_id, user_id, role, status, mfa_required,
                accepted_at
              ) VALUES (
                ?, ?, ?, ?, 'active',
                CASE WHEN ? IN ('organization_admin', 'professional') THEN 1 ELSE 0 END,
                CURRENT_TIMESTAMP
              )`,
            )
            .bind(
              membershipId,
              organizationId,
              existingUser.id,
              role,
              role,
            ),
      db
        .prepare(
          `UPDATE property_access_grants
           SET revoked_at = CURRENT_TIMESTAMP
           WHERE organization_id = ? AND user_id = ? AND revoked_at IS NULL`,
        )
        .bind(organizationId, existingUser.id),
      db
        .prepare(
          `UPDATE invitations
           SET accepted_at = CURRENT_TIMESTAMP
           WHERE organization_id = ? AND email_normalized = ?
             AND accepted_at IS NULL AND revoked_at IS NULL`,
        )
        .bind(organizationId, email),
      db
        .prepare(
          `UPDATE notification_deliveries
           SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
           WHERE organization_id = ?
             AND recipient_email = ?
             AND entity_type = 'invitation'
             AND status IN ('pending_provider', 'queued', 'failed')`,
        )
        .bind(organizationId, email),
    ];
    statements.push(
      ...propertyGrantStatements(
        db,
        organizationId,
        existingUser.id,
        role,
        propertyIds,
        membership.userId,
        null,
      ),
      auditStatement(
        db,
        membership,
        "membership.created",
        "membership",
        membershipId,
        { propertyCount: propertyIds.length, role },
      ),
    );
    await db.batch(statements);
    return { kind: "member" };
  }

  const pending = await db
    .prepare(
      `SELECT id
       FROM invitations
       WHERE organization_id = ?
         AND email_normalized = ?
         AND accepted_at IS NULL
         AND revoked_at IS NULL
         AND expires_at > CURRENT_TIMESTAMP
       LIMIT 1`,
    )
    .bind(organizationId, email)
    .first<{ id: string }>();
  if (pending) {
    throw new TeamValidationError(
      "Ya hay una invitación pendiente para este correo.",
    );
  }

  const invitationId = crypto.randomUUID();
  const deliveryId = crypto.randomUUID();
  const scope = isLimitedRole(role) ? "property" : "organization";
  const expiresAt = sqliteTimestamp(
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  );
  const tokenHash = await sha256(crypto.randomUUID());
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO invitations (
          id, organization_id, email_normalized, role, scope,
          token_hash, expires_at, invited_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        invitationId,
        organizationId,
        email,
        role,
        scope,
        tokenHash,
        expiresAt,
        membership.userId,
      ),
    db
      .prepare(
        `INSERT INTO notification_deliveries (
          id, organization_id, channel, template_key, recipient_email,
          entity_type, entity_id, status, deduplication_key, payload_json
        ) VALUES (
          ?, ?, 'email', 'team_invitation', ?, 'invitation', ?,
          'pending_provider', ?, ?
        )`,
      )
      .bind(
        deliveryId,
        organizationId,
        email,
        invitationId,
        `invitation:${invitationId}`,
        JSON.stringify({
          propertyCount: propertyIds.length,
          role,
          scope,
        }),
      ),
  ];
  for (const propertyId of propertyIds) {
    statements.push(
      db
        .prepare(
          `INSERT INTO invitation_property_scopes (
            invitation_id, organization_id, property_id
          ) VALUES (?, ?, ?)`,
        )
        .bind(invitationId, organizationId, propertyId),
    );
  }
  statements.push(
    auditStatement(
      db,
      membership,
      "invitation.created",
      "invitation",
      invitationId,
      { propertyCount: propertyIds.length, role, scope },
    ),
  );
  await db.batch(statements);
  return { deliveryId, kind: "invitation" };
}

export async function updateTeamMember(
  actor: ActorInput,
  organizationId: string,
  membershipId: string,
  input: UpdateMemberInput,
): Promise<void> {
  await ensureTeamSchema();
  const membership = await authorizeTeamManagement(actor, organizationId);
  const db = database();
  const role = validateRole(input.role);
  const propertyIds = await validatePropertyScope(
    db,
    organizationId,
    role,
    input.propertyIds,
  );
  const expiresAt = validateAccessExpiry(input.expiresAt);
  const target = await memberTarget(db, organizationId, membershipId);
  assertEditableMember(membership, target);

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE memberships
         SET role = ?, status = 'active',
             mfa_required = CASE
               WHEN ? IN ('organization_admin', 'professional') THEN 1 ELSE 0
             END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND organization_id = ?`,
      )
      .bind(role, role, membershipId, organizationId),
    db
      .prepare(
        `UPDATE property_access_grants
         SET revoked_at = CURRENT_TIMESTAMP
         WHERE organization_id = ? AND user_id = ? AND revoked_at IS NULL`,
      )
      .bind(organizationId, target.userId),
    ...propertyGrantStatements(
      db,
      organizationId,
      target.userId,
      role,
      propertyIds,
      membership.userId,
      expiresAt,
    ),
    auditStatement(
      db,
      membership,
      "membership.updated",
      "membership",
      membershipId,
      {
        expiresAt,
        propertyCount: propertyIds.length,
        role,
      },
    ),
  ];
  await db.batch(statements);
}

export async function revokeTeamMember(
  actor: ActorInput,
  organizationId: string,
  membershipId: string,
): Promise<void> {
  await ensureTeamSchema();
  const membership = await authorizeTeamManagement(actor, organizationId);
  const db = database();
  const target = await memberTarget(db, organizationId, membershipId);
  assertEditableMember(membership, target);

  await db.batch([
    db
      .prepare(
        `UPDATE memberships
         SET status = 'revoked', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND organization_id = ?`,
      )
      .bind(membershipId, organizationId),
    db
      .prepare(
        `UPDATE property_access_grants
         SET revoked_at = CURRENT_TIMESTAMP
         WHERE organization_id = ? AND user_id = ? AND revoked_at IS NULL`,
      )
      .bind(organizationId, target.userId),
    auditStatement(
      db,
      membership,
      "membership.revoked",
      "membership",
      membershipId,
      { previousRole: target.role },
    ),
  ]);
}

export async function revokeTeamInvitation(
  actor: ActorInput,
  organizationId: string,
  invitationId: string,
): Promise<void> {
  await ensureTeamSchema();
  const membership = await authorizeTeamManagement(actor, organizationId);
  const db = database();
  const invitation = await db
    .prepare(
      `SELECT id
       FROM invitations
       WHERE id = ? AND organization_id = ?
         AND accepted_at IS NULL AND revoked_at IS NULL
       LIMIT 1`,
    )
    .bind(invitationId, organizationId)
    .first<{ id: string }>();
  if (!invitation) {
    throw new TeamValidationError(
      "La invitación ya no está disponible.",
    );
  }

  await db.batch([
    db
      .prepare(
        `UPDATE invitations
         SET revoked_at = CURRENT_TIMESTAMP
         WHERE id = ? AND organization_id = ?`,
      )
      .bind(invitationId, organizationId),
    db
      .prepare(
        `UPDATE notification_deliveries
         SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
         WHERE organization_id = ?
           AND entity_type = 'invitation'
           AND entity_id = ?
           AND status IN ('pending_provider', 'queued', 'failed')`,
      )
      .bind(organizationId, invitationId),
    auditStatement(
      db,
      membership,
      "invitation.revoked",
      "invitation",
      invitationId,
      {},
    ),
  ]);
}

export async function prepareTeamInvitationResend(
  actor: ActorInput,
  organizationId: string,
  invitationId: string,
): Promise<{ deliveryId: string }> {
  await ensureTeamSchema();
  const membership = await authorizeTeamManagement(actor, organizationId);
  const db = database();
  const delivery = await db
    .prepare(
      `SELECT
        nd.id AS deliveryId,
        nd.status,
        nd.attempt_count AS attemptCount
       FROM invitations i
       INNER JOIN notification_deliveries nd
         ON nd.organization_id = i.organization_id
        AND nd.entity_type = 'invitation'
        AND nd.entity_id = i.id
        AND nd.template_key = 'team_invitation'
       WHERE i.id = ? AND i.organization_id = ?
         AND i.accepted_at IS NULL AND i.revoked_at IS NULL
         AND i.expires_at > CURRENT_TIMESTAMP
       LIMIT 1`,
    )
    .bind(invitationId, organizationId)
    .first<{
      attemptCount: number;
      deliveryId: string;
      status: string;
    }>();
  if (!delivery) {
    throw new TeamValidationError(
      "La invitación ya no está disponible para reenviar.",
    );
  }

  const reset = await db
    .prepare(
      `UPDATE notification_deliveries
       SET status = 'pending_provider', attempt_count = 0,
           scheduled_at = CURRENT_TIMESTAMP, sent_at = NULL,
           error_code = NULL, last_attempt_at = NULL,
           next_attempt_at = NULL, provider_message_id = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND organization_id = ?
         AND (status <> 'queued'
           OR last_attempt_at < datetime('now', '-30 minutes'))
         AND (last_attempt_at IS NULL
           OR last_attempt_at <= datetime('now', '-1 minute'))`,
    )
    .bind(delivery.deliveryId, organizationId)
    .run();
  if (Number(reset.meta.changes ?? 0) !== 1) {
    throw new TeamValidationError(
      "El correo ya se está enviando. Espera un minuto antes de reintentarlo.",
    );
  }

  await auditStatement(
    db,
    membership,
    "invitation.resend_requested",
    "invitation",
    invitationId,
    {
      previousAttemptCount: Number(delivery.attemptCount),
      previousStatus: delivery.status,
    },
  ).run();
  return { deliveryId: delivery.deliveryId };
}

async function ensureTeamSchema(): Promise<void> {
  await ensureCoreSchema();
}

async function authorizeTeamManagement(
  actor: ActorInput,
  organizationId: string,
): Promise<MembershipContext> {
  const membership = await getMembershipContext(actor, organizationId);
  if (
    !membership ||
    !can(membership.role as Role, "membership.manage")
  ) {
    throw new TeamAuthorizationError(
      "No tienes permiso para gestionar este equipo.",
    );
  }
  return membership;
}

async function memberTarget(
  db: D1Database,
  organizationId: string,
  membershipId: string,
) {
  const target = await db
    .prepare(
      `SELECT id, user_id AS userId, role
       FROM memberships
       WHERE id = ? AND organization_id = ?
         AND status IN ('active', 'suspended')
       LIMIT 1`,
    )
    .bind(membershipId, organizationId)
    .first<{ id: string; role: OrganizationRole; userId: string }>();
  if (!target) {
    throw new TeamValidationError(
      "La persona ya no forma parte del espacio.",
    );
  }
  return target;
}

function assertEditableMember(
  actorMembership: MembershipContext,
  target: { role: OrganizationRole; userId: string },
) {
  if (target.userId === actorMembership.userId) {
    throw new TeamValidationError(
      "No puedes cambiar ni revocar tu propio acceso desde esta pantalla.",
    );
  }
}

async function validatePropertyScope(
  db: D1Database,
  organizationId: string,
  role: OrganizationRole,
  requestedPropertyIds: string[] | undefined,
): Promise<string[]> {
  if (!isLimitedRole(role)) return [];
  const propertyIds = [
    ...new Set(
      (requestedPropertyIds ?? []).filter(
        (propertyId): propertyId is string =>
          typeof propertyId === "string" && propertyId.length > 0,
      ),
    ),
  ];
  if (propertyIds.length === 0) {
    throw new TeamValidationError(
      "Selecciona al menos una vivienda para este rol.",
    );
  }
  if (propertyIds.length > 100) {
    throw new TeamValidationError(
      "No puedes conceder más de 100 viviendas a la vez.",
    );
  }

  const placeholders = propertyIds.map(() => "?").join(", ");
  const result = await db
    .prepare(
      `SELECT id
       FROM properties
       WHERE organization_id = ?
         AND archived_at IS NULL
         AND id IN (${placeholders})`,
    )
    .bind(organizationId, ...propertyIds)
    .all<{ id: string }>();
  if ((result.results?.length ?? 0) !== propertyIds.length) {
    throw new TeamValidationError(
      "Alguna vivienda seleccionada no pertenece a este espacio.",
    );
  }
  return propertyIds;
}

function propertyGrantStatements(
  db: D1Database,
  organizationId: string,
  userId: string,
  role: OrganizationRole,
  propertyIds: string[],
  grantedBy: string,
  expiresAt: string | null,
): D1PreparedStatement[] {
  if (!isLimitedRole(role)) return [];
  return propertyIds.map((propertyId) =>
    db
      .prepare(
        `INSERT INTO property_access_grants (
          organization_id, property_id, user_id, access_role,
          expires_at, revoked_at, granted_by, created_at
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (organization_id, property_id, user_id) DO UPDATE SET
          access_role = excluded.access_role,
          expires_at = excluded.expires_at,
          revoked_at = NULL,
          granted_by = excluded.granted_by,
          created_at = CURRENT_TIMESTAMP`,
      )
      .bind(
        organizationId,
        propertyId,
        userId,
        role,
        expiresAt,
        grantedBy,
      ),
  );
}

function auditStatement(
  db: D1Database,
  membership: MembershipContext,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown>,
) {
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

function validateEmail(value: string): string {
  const email = normalizeEmail(value);
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new TeamValidationError(
      "Introduce un correo electrónico válido.",
    );
  }
  return email;
}

function validateRole(value: OrganizationRole): OrganizationRole {
  if (!assignableRoles.includes(value)) {
    throw new TeamValidationError("Selecciona un rol válido.");
  }
  return value;
}

function validateAccessExpiry(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TeamValidationError("La fecha de acceso no es válida.");
  }
  const expiresAt = `${value} 23:59:59`;
  if (expiresAt < sqliteTimestamp(new Date())) {
    throw new TeamValidationError("La fecha de acceso debe ser futura.");
  }
  return expiresAt;
}

function isLimitedRole(
  role: OrganizationRole,
): role is "professional" | "owner" {
  return role === "professional" || role === "owner";
}

function sqliteTimestamp(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
