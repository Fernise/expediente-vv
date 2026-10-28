import type { OrganizationSummary } from "./organizations.ts";

export class OrganizationCreationError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

// No tenant exists yet: scope the receipt to the verified account and commit
// it in the SAME D1 transaction as the workspace, membership and audit event.
export async function commitOrganizationCreationIn(
  db: D1Database, userId: string, key: string | null,
  organization: OrganizationSummary, statements: D1PreparedStatement[],
): Promise<OrganizationSummary> {
  if (!key) { await db.batch(statements); return organization; }
  if (!/^[a-f0-9-]{36}$/i.test(key)) {
    throw new OrganizationCreationError("Identificador de operación inválido.", 400);
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(organization.name));
  const fingerprint = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
  async function replay(): Promise<OrganizationSummary | null> {
    const receipt = await db.prepare(`SELECT fingerprint, organization_id AS organizationId
      FROM organization_creation_receipts WHERE user_id = ? AND request_key = ?`)
      .bind(userId, key).first<{ fingerprint: string; organizationId: string | null }>();
    if (!receipt) return null;
    if (receipt.fingerprint !== fingerprint) {
      throw new OrganizationCreationError("La operación cambió. Revisa los datos antes de enviarla de nuevo.", 409);
    }
    // Re-check access before returning a previous result, even after revocation.
    const accessible = await db.prepare(`SELECT o.id, o.name, o.slug, o.timezone, m.role
      FROM organizations o JOIN memberships m ON m.organization_id = o.id
      JOIN app_users u ON u.id = m.user_id
      WHERE o.id = ? AND m.user_id = ? AND o.status = 'active'
        AND m.status = 'active' AND u.status = 'active' LIMIT 1`)
      .bind(receipt.organizationId, userId).first<OrganizationSummary>();
    if (!accessible) {
      throw new OrganizationCreationError("Ya no tienes acceso al espacio creado. Revisa tus espacios antes de continuar.", 403);
    }
    return accessible;
  }
  const previous = await replay();
  if (previous) return previous;
  try {
    await db.batch([...statements, db.prepare(`INSERT INTO organization_creation_receipts
      (user_id, request_key, fingerprint, organization_id) VALUES (?, ?, ?, ?)`)
      .bind(userId, key, fingerprint, organization.id)]);
    return organization;
  } catch (error) {
    // A concurrent winner's unique receipt rolls back ALL our attempted inserts.
    const concurrent = await replay();
    if (concurrent) return concurrent;
    throw error;
  }
}
