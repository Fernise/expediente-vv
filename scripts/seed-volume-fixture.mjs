// Local-only metadata fixture. No real files, emails or production credentials.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

export async function seedVolumeFixture({ organizationId, propertyId, identity }) {
  assert.match(identity, /^local-browser-qa-[a-f0-9-]+$/);
  const directory = new URL("../.wrangler/state/v3/d1/miniflare-D1DatabaseObject/", import.meta.url);
  const files = (await readdir(directory)).filter(name => /^[a-f0-9]+\.sqlite$/.test(name));
  assert.equal(files.length, 1, "Require one unambiguous local D1 database");
  const db = new DatabaseSync(new URL(files[0], directory));
  try {
    db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
    const user = db.prepare("SELECT id FROM app_users WHERE sites_subject=?").get(identity);
    assert.ok(user);
    const property = db.prepare(`SELECT p.data_profile, o.name FROM properties p JOIN organizations o ON o.id=p.organization_id
      JOIN memberships m ON m.organization_id=o.id AND m.user_id=? AND m.status='active'
      WHERE p.id=? AND p.organization_id=?`).get(user.id, propertyId, organizationId);
    assert.equal(property?.data_profile, "pilot_anonymized");
    assert.equal(property?.name, "Espacio QA anonimizado");
    const insertDoc = db.prepare(`INSERT INTO documents (id,organization_id,property_id,document_type,workflow_status,current_version_id)
      VALUES (?,?,?,?,'quarantined',?)`);
    const insertVersion = db.prepare(`INSERT INTO document_versions
      (id,organization_id,document_id,storage_key,original_filename,mime_type,size_bytes,sha256,malware_scan_status,uploaded_by,uploaded_at,supersedes_id)
      VALUES (?,?,?,?,?,'image/png',68,?,'pending',?,?,?)`);
    const insertComment = db.prepare(`INSERT INTO comments (id,organization_id,property_id,body,author_user_id,created_at) VALUES (?,?,?,?,?,?)`);
    let versions = 0;
    db.exec("BEGIN IMMEDIATE");
    try {
      for (let index = 0; index < 236; index++) {
        const documentId = randomUUID();
        const count = index === 235 ? 50 : 8;
        const ids = Array.from({ length: count }, () => randomUUID());
        insertDoc.run(documentId, organizationId, propertyId, `Evidencia ficticia ${index + 1} · ${"Nombre largo ".repeat(12)}`, ids.at(-1));
        for (let version = 0; version < count; version++) {
          const stamp = new Date(Date.UTC(2026, 9, 8, 0, index, version)).toISOString();
          insertVersion.run(ids[version], organizationId, documentId, `qa-metadata-only/${ids[version]}`,
            `ficticio-${index}-v${version}-${"nombre_sin_espacios_".repeat(9)}.png`, "0".repeat(64), user.id, stamp, ids[version - 1] ?? null);
          versions++;
        }
      }
      for (let index = 0; index < 120; index++) insertComment.run(randomUUID(), organizationId, propertyId,
        `Comentario ficticio ${index + 1}: ${"Una nota larga para revisar la lectura sin datos personales. ".repeat(12)}`,
        user.id, new Date(Date.UTC(2026, 9, 8, 0, index)).toISOString());
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    return { documents: 236, versions, comments: 120, objects: "metadata only; downloads intentionally blocked" };
  } finally { db.close(); }
}
