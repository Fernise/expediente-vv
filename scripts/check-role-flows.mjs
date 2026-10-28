// Run only against `npm run dev`; all identities and files are fictitious.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
const origin = "http://localhost:3000";
// Refuse any local configuration that could send real Gmail messages.
for (const path of [".env", ".env.local", ".env.development", ".dev.vars"]) {
  const config = await readFile(new URL(`../${path}`, import.meta.url), "utf8").catch(() => "");
  assert.ok(!/^GMAIL_OAUTH_(?:CLIENT_ID|CLIENT_SECRET|REFRESH_TOKEN)\s*=\s*[^\s#]+/m.test(config), "Disable local Gmail before role tests");
}
const actors = Object.fromEntries(["organization_admin", "manager", "professional", "owner"].map(role => {
  const id = `role-qa-${randomUUID()}`;
  return [role, { id, email: `${id}@example.invalid` }];
}));
let org;
function headers(role) {
  return { "oai-authenticated-user-id": actors[role].id, "oai-authenticated-user-email": actors[role].email,
    origin, "sec-fetch-site": "same-origin", ...(org ? { cookie: `expediente-vv-active-organization=${org}` } : {}) };
}
async function request(role, path, body, method = "POST", extra = {}) {
  const response = await fetch(`${origin}${path}`, { method, headers: { ...headers(role), ...(body instanceof FormData ? {} : { "content-type": "application/json" }), ...extra },
    ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }) });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  let result; try { result = JSON.parse(text); } catch { result = text; }
  return { status: response.status, result, text, bytes };
}
const admin = "organization_admin";
const created = await request(admin, "/api/organizations", { name: "Roles QA anonimizado" });
assert.equal(created.status, 201, created.text);
org = created.result.organization.id;
const property = alias => ({ alias, organizationId: org, dataProfile: "pilot_anonymized", islandCode: "TF", municipality: "Santa Cruz de Tenerife", postalCode: "38001", ownerName: "Propietario 01", activityStatus: "not_started" });
const one = await request(admin, "/api/properties", property("Vivienda asignada QA"));
assert.equal(one.status, 201, one.text);
const propertyId = one.result.property.id;
const initialDossier = await request(admin, `/app/properties/${propertyId}`, undefined, "GET");
const checklistItemId = initialDossier.text.match(/data-checklist-item-id="([^"]+)"/)?.[1];
assert.ok(checklistItemId, "Initial checklist must be rendered");
const other = await request(admin, "/api/properties", property("Vivienda no asignada QA"));
assert.equal(other.status, 201, other.text);
const otherId = other.result.property.id;
for (const role of ["manager", "professional", "owner"]) {
  const invited = await request(admin, "/api/team/invitations", { organizationId: org, email: actors[role].email, role,
    propertyIds: role === "manager" ? [] : [propertyId] });
  assert.equal(invited.status, 201, invited.text);
  assert.notEqual(invited.result.deliveryStatus, "sent", "No actual email should be sent");
  const entered = await request(role, "/app", undefined, "GET");
  assert.equal(entered.status, 200);
  assert.ok(entered.text.includes("Roles QA anonimizado"), `${role} invitation acceptance`);
}
const png = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
const outcomes = [];
let evidenceDocumentId;
let ownerUpload;
let ownerUploadKey;
for (const role of Object.keys(actors)) {
  const dossier = await request(role, `/app/properties/${propertyId}`, undefined, "GET");
  assert.equal(dossier.status, 200);
  assert.ok(dossier.text.includes("Vivienda asignada QA"));
  const team = await request(role, "/app/team", undefined, "GET");
  assert.equal(team.status, 200);
  assert.equal(team.text.includes("Equipo restringido"), role !== admin);
  const csv = await request(role, `/api/exports/properties?organizationId=${org}`, undefined, "GET");
  assert.equal(csv.status, [admin, "manager"].includes(role) ? 200 : 403);
  const ownCreate = await request(role, "/api/properties", property(`Alta QA ${role}`));
  assert.equal(ownCreate.status, [admin, "manager"].includes(role) ? 201 : 403, ownCreate.text);
  const comment = await request(role, `/api/properties/${propertyId}/comments`, { organizationId: org, body: "Nota interna ficticia para comprobar permisos." });
  assert.equal(comment.status, role === "owner" ? 403 : 201, comment.text);
  const file = new FormData(); file.set("organizationId", org); file.set("documentType", `Prueba QA ${role}`);
  if (role === admin) file.append("checklistItemIds", checklistItemId);
  file.set("anonymizationConfirmed", "yes"); file.set("file", new File([png], "ficticio.png", { type: "image/png" }));
  const uploadKey = randomUUID();
  const upload = await request(role, `/api/properties/${propertyId}/documents`, file, "POST", { "idempotency-key": uploadKey });
  assert.equal(upload.status, role === "professional" ? 403 : 201, upload.text);
  if (role === "owner") { ownerUpload = file; ownerUploadKey = uploadKey; }
  if (role === admin) {
    const refreshed = await request(admin, `/app/properties/${propertyId}`, undefined, "GET");
    evidenceDocumentId = refreshed.text.match(/\/api\/properties\/[\w-]+\/documents\/([\w-]+)\?organizationId=/)?.[1];
    assert.ok(evidenceDocumentId, "Uploaded evidence must be downloadable");
  }
  const review = await request(role, `/api/properties/${propertyId}/reviews`, { organizationId: org, checklistItemId, documentId: evidenceDocumentId,
    decision: "approved", observation: "Revisión ficticia de una evidencia de prueba sin información personal." });
  assert.equal(review.status, role === "professional" ? 201 : 403, review.text);
  const download = await request(role, `/api/properties/${propertyId}/documents/${evidenceDocumentId}?organizationId=${org}`, undefined, "GET");
  assert.equal(download.status, 200);
  assert.deepEqual(download.bytes, png, "Allowed download must return the exact private object bytes");
  if (["professional", "owner"].includes(role)) {
    const forbidden = await request(role, `/app/properties/${otherId}`, undefined, "GET");
    assert.ok(!forbidden.text.includes("<h1>Vivienda no asignada QA"), "Unassigned dossier must not be rendered");
    const deniedComment = await request(role, `/api/properties/${otherId}/comments`, { organizationId: org, body: "No debe aparecer en otra vivienda." });
    assert.ok([403, 404].includes(deniedComment.status));
    const deniedArchive = await request(role, `/api/properties/${propertyId}`, { organizationId: org, action: "archive" }, "PATCH");
    assert.equal(deniedArchive.status, 403);
  }
  if (role === "owner") assert.ok(!dossier.text.includes("Nota interna ficticia para comprobar permisos."), "Owner cannot read internal comments");
  outcomes.push({ role, dossier: "allowed", team: role === admin ? "allowed" : "denied", csv: csv.status, create: ownCreate.status, upload: upload.status, internalComment: comment.status, review: review.status, download: download.status });
}
const team = await request(admin, "/app/team", undefined, "GET");
const ownerCard = [...team.text.matchAll(/<article\b[^>]*data-member-id="([^"]+)"[^>]*>[\s\S]*?<\/article>/g)].find(match=>match[0].includes(actors.owner.email));
assert.ok(ownerCard, "Owner membership should be visible to admin");
assert.equal((await request(admin, `/api/team/members/${ownerCard[1]}`, { organizationId: org, action: "revoke" }, "PATCH")).status, 200);
assert.equal((await request("owner", `/api/properties/${propertyId}/documents`, ownerUpload, "POST", { "idempotency-key": ownerUploadKey })).status, 403,
  "Revoked member cannot replay an earlier successful receipt");
assert.equal((await request("owner", `/api/properties/${propertyId}/documents/${evidenceDocumentId}?organizationId=${org}`, undefined, "GET")).status, 403);
console.log(JSON.stringify({ result: "passed", outcomes, scope: "local HTTP routes and server-rendered pages; not production authentication or MFA" }, null, 2));
