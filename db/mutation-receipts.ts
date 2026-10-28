import { database, type ActorInput } from "@/db/organizations";
import { AuthorizationError, requireOrganizationCapability } from "@/db/properties";
import { hasPropertyAccessIn } from "@/db/property-access-core";
import { runOnceIn } from "@/db/mutation-receipt-core";

export async function mutationReceipt(actor: ActorInput, organizationId: string,
  key: string | null, payload: string | FormData, action: "property.create" | "document.upload" | "checklist.create",
  propertyId: string | null, work: () => Promise<Response>): Promise<Response> {
  // Authorization is checked on every retry, BEFORE returning any receipt.
  const membership = await requireOrganizationCapability(actor, organizationId, action === "checklist.create" ? "property.update" : action);
  const db = database();
  if (propertyId && !await hasPropertyAccessIn(db, membership, propertyId)) throw new AuthorizationError("No tienes acceso a esta vivienda.");
  if (!key) return work(); // Older clients retain their existing behavior.
  if (process.env.NODE_ENV === "development") await db.prepare(`CREATE TABLE IF NOT EXISTS mutation_receipts (
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    request_key TEXT NOT NULL, fingerprint TEXT NOT NULL, response_json TEXT, response_status INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (organization_id, user_id, request_key))`).run();
  const parts = [action, propertyId ?? ""];
  if (typeof payload === "string") parts.push(payload);
  else for (const [name, value] of payload.entries()) {
    if (typeof value === "string") parts.push(JSON.stringify([name, value]));
    else {
      if (value.size > 10 * 1024 * 1024) return Response.json({ error: "El archivo supera el máximo de 10 MB." }, { status: 400 });
      const hash = await crypto.subtle.digest("SHA-256", await value.arrayBuffer());
      parts.push(JSON.stringify([name, value.name, value.type, value.size, [...new Uint8Array(hash)]]));
    }
  }
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.join("\n")));
  const fingerprint = [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, "0")).join("");
  return runOnceIn(db, { organizationId, userId: membership.userId, key, fingerprint }, work);
}
