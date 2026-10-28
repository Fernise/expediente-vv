import type { MembershipContext } from "@/db/organizations";

export async function hasPropertyAccessIn(
  db: D1Database,
  membership: MembershipContext,
  propertyId: string,
): Promise<boolean> {
  const property = await db
    .prepare(
      `SELECT id
       FROM properties
       WHERE organization_id = ? AND id = ?
       LIMIT 1`,
    )
    .bind(membership.organizationId, propertyId)
    .first();
  if (!property) return false;

  if (membership.role !== "professional" && membership.role !== "owner") {
    return true;
  }

  const grant = await db
    .prepare(
      `SELECT property_id
       FROM property_access_grants
       WHERE organization_id = ?
         AND property_id = ?
         AND user_id = ?
         AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
       LIMIT 1`,
    )
    .bind(membership.organizationId, propertyId, membership.userId)
    .first();
  return Boolean(grant);
}
