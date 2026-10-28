export type IdentityActor = { id: string; email: string; displayName: string };
export type IdentityAccount = {
  id: string;
  email: string;
  sitesSubject: string | null;
  status: string;
  displayName: string;
};

export class IdentityConflictError extends Error {
  constructor() {
    super("No se ha podido verificar el vínculo de esta cuenta. Contacta con la administración.");
  }
}

function subjectOf(actor: IdentityActor): string {
  const subject = actor.id.trim();
  if (!subject || subject !== actor.id || subject.length > 512) throw new IdentityConflictError();
  return subject;
}

const ACCOUNT_SELECT = "SELECT id, email, display_name AS displayName, sites_subject AS sitesSubject, status FROM app_users";

export async function findIdentityAccountIn(
  db: D1Database,
  actor: IdentityActor,
  options: { allowLegacy: boolean },
): Promise<IdentityAccount | null> {
  const subject = subjectOf(actor);
  const bound = await db.prepare(`${ACCOUNT_SELECT} WHERE sites_subject = ? LIMIT 1`)
    .bind(subject).first<IdentityAccount>();
  if (bound) {
    if (bound.status !== "active") throw new IdentityConflictError();
    // Email is a contact attribute; a collision must never transfer an identity.
    const email = actor.email.trim().toLocaleLowerCase("en-US");
    if (email !== bound.email || actor.displayName.slice(0, 120) !== bound.displayName) {
      await db.prepare(`UPDATE app_users SET
      email = CASE WHEN NOT EXISTS (
        SELECT 1 FROM app_users other WHERE other.email = ? AND other.id != ?
      ) THEN ? ELSE email END,
      display_name = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND sites_subject = ? AND status = 'active'`)
      .bind(email, bound.id, email, actor.displayName.slice(0, 120), bound.id, subject).run();
    }
    return bound;
  }
  const byEmail = await db.prepare(`${ACCOUNT_SELECT} WHERE email = ? LIMIT 1`)
    .bind(actor.email.trim().toLocaleLowerCase("en-US")).first<IdentityAccount>();
  if (!byEmail) return null;
  if (byEmail.status !== "active" || byEmail.sitesSubject !== null || !options.allowLegacy) {
    throw new IdentityConflictError();
  }
  // Compatibility for the existing anonymized pilot only. Never auto-bind by email.
  return byEmail;
}

export async function createIdentityAccountIn(
  db: D1Database,
  actor: IdentityActor,
  options: { allowLegacy: boolean },
): Promise<IdentityAccount> {
  const existing = await findIdentityAccountIn(db, actor, options);
  if (existing) return existing;
  const subject = subjectOf(actor);
  const email = actor.email.trim().toLocaleLowerCase("en-US");
  await db.prepare(`INSERT INTO app_users (id, email, display_name, sites_subject)
    VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`)
    .bind(crypto.randomUUID(), email, actor.displayName.slice(0, 120), subject).run();
  const account = await db.prepare(`${ACCOUNT_SELECT} WHERE sites_subject = ? LIMIT 1`)
    .bind(subject).first<IdentityAccount>();
  if (!account || account.status !== "active") throw new IdentityConflictError();
  return account;
}

export async function getIdentityMembershipIn(
  db: D1Database,
  actor: IdentityActor,
  organizationId: string,
  options: { allowLegacy: boolean },
): Promise<MembershipContext | null> {
  const account = await findIdentityAccountIn(db, actor, options);
  if (!account) return null;
  return db.prepare(`SELECT
      m.organization_id AS organizationId, m.user_id AS userId, m.role,
      o.name AS organizationName, o.slug AS organizationSlug
      FROM memberships m
      INNER JOIN app_users u ON u.id = m.user_id
      INNER JOIN organizations o ON o.id = m.organization_id
      WHERE u.id = ? AND m.organization_id = ?
        AND m.status = 'active' AND u.status = 'active' AND o.status = 'active'
      LIMIT 1`)
    .bind(account.id, organizationId).first<MembershipContext>();
}

/** Operator-only migration primitive. Caller must separately attest the legacy-user/subject mapping. */
export async function bindAttestedLegacyIdentityIn(
  db: D1Database,
  legacyUserId: string,
  attestedSubject: string,
): Promise<void> {
  const subject = subjectOf({ id: attestedSubject, email: "", displayName: "" });
  const result = await db.prepare(`UPDATE app_users
    SET sites_subject = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND sites_subject IS NULL AND status = 'active'`)
    .bind(subject, legacyUserId).run();
  if (result.meta.changes !== 1) throw new IdentityConflictError();
}
import type { MembershipContext } from "./organizations.ts";
