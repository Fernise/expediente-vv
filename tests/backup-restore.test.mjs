import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { decryptBackup, encryptBackup } from "../scripts/backup-crypto.mjs";
import { randomBytes } from "node:crypto";

const TABLES = [
  "app_users",
  "organizations",
  "memberships",
  "owners",
  "properties",
  "property_checklists",
  "checklist_items",
  "documents",
  "document_versions",
  "evidence_links",
  "professional_reviews",
];

test("a representative D1 and R2 backup restores into an isolated environment", async () => {
  const source = createMiniflare();
  const target = createMiniflare();
  const startedAt = Date.now();
  try {
    const sourceDb = await source.getD1Database("DB");
    const targetDb = await target.getD1Database("DB");
    const sourceBucket = await source.getR2Bucket("DOCUMENTS");
    const targetBucket = await target.getR2Bucket("DOCUMENTS");
    await applyMigrations(sourceDb);
    await applyMigrations(targetDb);
    await seedRepresentativeDossier(sourceDb, sourceBucket);

    const inventory = await sourceDb.prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name",
    ).all();
    const tables = await dependencyOrder(sourceDb, inventory.results.map(({ name }) => name));
    for (const table of TABLES) assert.ok(tables.includes(table), `${table} is included`);

    const structuredBackup = {};
    for (const table of tables) {
      const result = await sourceDb.prepare(`SELECT * FROM ${table}`).all();
      structuredBackup[table] = result.results ?? [];
    }
    const key = randomBytes(32);
    const sealed = encryptBackup(Buffer.from(JSON.stringify(structuredBackup)), key);
    const restoredData = JSON.parse(decryptBackup(sealed, key).toString("utf8"));
    for (const table of tables) {
      await restoreRows(targetDb, table, restoredData[table]);
    }

    const sourceObjects = await sourceBucket.list();
    assert.equal(sourceObjects.truncated, false);
    for (const listed of sourceObjects.objects) {
      const object = await sourceBucket.get(listed.key);
      assert.ok(object);
      const originalBytes = new Uint8Array(await object.arrayBuffer());
      const restoredBytes = decryptBackup(encryptBackup(originalBytes, key), key);
      await targetBucket.put(listed.key, restoredBytes, {
        customMetadata: object.customMetadata,
        httpMetadata: object.httpMetadata,
      });
      const copied = await targetBucket.get(listed.key);
      assert.ok(copied);
      assert.equal(sha256(new Uint8Array(await copied.arrayBuffer())), sha256(originalBytes));
      assert.deepEqual(copied.customMetadata, object.customMetadata);
      assert.deepEqual(copied.httpMetadata, object.httpMetadata);
    }
    key.fill(0);

    for (const table of tables) {
      const sourceCount = await countRows(sourceDb, table);
      const targetCount = await countRows(targetDb, table);
      assert.equal(targetCount, sourceCount, `${table} count`);
      const sourceRows = (await sourceDb.prepare(`SELECT * FROM ${table}`).all()).results;
      const targetRows = (await targetDb.prepare(`SELECT * FROM ${table}`).all()).results;
      const canonical = (rows) => rows.map((row) => JSON.stringify(row)).sort();
      assert.deepEqual(canonical(targetRows), canonical(sourceRows), `${table} content`);
    }
    assert.deepEqual((await targetDb.prepare("PRAGMA foreign_key_check").all()).results, []);
    assert.equal((await targetBucket.list()).objects.length, sourceObjects.objects.length);
    const links = await targetDb.prepare(
      "SELECT checklist_item_id AS itemId, sufficiency FROM evidence_links WHERE document_id = ? ORDER BY checklist_item_id",
    ).bind("document-1").all();
    assert.deepEqual(links.results?.map((row) => [row.itemId, row.sufficiency]), [
      ["item-1", "sufficient"],
      ["item-2", "unassessed"],
    ]);
    const itemDocuments = await targetDb.prepare(
      "SELECT document_id AS documentId FROM evidence_links WHERE checklist_item_id = ? ORDER BY document_id",
    ).bind("item-1").all();
    assert.deepEqual(itemDocuments.results?.map((row) => row.documentId), ["document-1", "document-2"]);
    const version = await targetDb
      .prepare("SELECT storage_key AS storageKey, sha256 FROM document_versions WHERE id = ?")
      .bind("version-1")
      .first();
    assert.ok(version);
    const securityStates = await targetDb.prepare(
      "SELECT id, malware_scan_status AS status FROM document_versions ORDER BY id",
    ).all();
    assert.deepEqual(securityStates.results, [
      { id: "version-1", status: "structural_only" },
      { id: "version-2", status: "pending" },
    ]);
    const restored = await targetBucket.get(String(version.storageKey));
    assert.ok(restored);
    const restoredBytes = new Uint8Array(await restored.arrayBuffer());
    assert.equal(sha256(restoredBytes), version.sha256);
    assert.equal(restored.customMetadata?.organizationId, "org-1");
    assert.ok(Date.now() - startedAt < 4 * 60 * 60 * 1000);
  } finally {
    await Promise.all([source.dispose(), target.dispose()]);
  }
});

function createMiniflare() {
  return new Miniflare(
    convertV4MiniflareOptions({
      compatibilityDate: "2026-09-04",
      d1Databases: ["DB"],
      r2Buckets: ["DOCUMENTS"],
      modules: true,
      script: "export default { fetch() { return new Response('ok') } }",
    }),
  );
}

async function applyMigrations(database) {
  const directory = new URL("../drizzle/", import.meta.url);
  const files = (await readdir(directory))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  for (const file of files) {
    const sql = await readFile(new URL(file, directory), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await database.prepare(statement.trim()).run();
    }
  }
}

async function seedRepresentativeDossier(database, bucket) {
  const bytes = new TextEncoder().encode("%PDF-1.7\nexpediente-vv-restore-drill\n%%EOF");
  const hash = sha256(bytes);
  await database.batch([
    database.prepare("INSERT INTO app_users (id, email, display_name) VALUES (?, ?, ?)").bind("user-1", "restore@example.invalid", "Ensayo"),
    database.prepare("INSERT INTO organizations (id, name, slug) VALUES (?, ?, ?)").bind("org-1", "Ensayo de restauración", "ensayo-restauracion"),
    database.prepare("INSERT INTO memberships (id, organization_id, user_id, role) VALUES (?, ?, ?, ?)").bind("membership-1", "org-1", "user-1", "organization_admin"),
    database.prepare("INSERT INTO owners (id, organization_id, display_name) VALUES (?, ?, ?)").bind("owner-1", "org-1", "Titular anonimizado"),
    database.prepare(`INSERT INTO properties (
      id, organization_id, alias, internal_reference, address_line, island_code,
      municipality, postal_code, data_profile, owner_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind("property-1", "org-1", "Vivienda ensayo", "VV-RESTORE-1", "Dirección anonimizada", "TF", "Santa Cruz de Tenerife", "38001", "pilot_anonymized", "owner-1"),
    database.prepare(`INSERT INTO property_checklists (
      id, organization_id, property_id, rule_version_label, generated_by,
      engine_version
    ) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind("checklist-1", "org-1", "property-1", "Ensayo 1", "user-1", "restore-test"),
    database.prepare(`INSERT INTO checklist_items (
      id, organization_id, checklist_id, title, category, explanation,
      workflow_status, position
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind("item-1", "org-1", "checklist-1", "Evidencia de ensayo", "Ensayo", "Validar la restauración", "reviewed", 1),
    database.prepare(`INSERT INTO checklist_items (
      id, organization_id, checklist_id, title, category, explanation,
      workflow_status, position
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind("item-2", "org-1", "checklist-1", "Segundo requisito", "Ensayo", "Probar documento compartido", "evidence_added", 2),
    database.prepare(`INSERT INTO documents (
      id, organization_id, property_id, checklist_item_id, document_type,
      workflow_status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind("document-1", "org-1", "property-1", "item-1", "restore-test", "available", "Ensayo aislado"),
    database.prepare(`INSERT INTO documents (
      id, organization_id, property_id, document_type, workflow_status, notes
    ) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind("document-2", "org-1", "property-1", "restore-test", "available", "Segunda evidencia"),
    database.prepare(`INSERT INTO document_versions (
      id, organization_id, document_id, storage_key, original_filename,
      mime_type, size_bytes, sha256, malware_scan_status, uploaded_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind("version-1", "org-1", "document-1", "org-1/property-1/document-1/version-1.pdf", "ensayo.pdf", "application/pdf", bytes.byteLength, hash, "structural_only", "user-1"),
    database.prepare(`INSERT INTO document_versions (
      id, organization_id, document_id, storage_key, original_filename,
      mime_type, size_bytes, sha256, malware_scan_status, uploaded_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind("version-2", "org-1", "document-2", "org-1/property-1/document-2/version-2.pdf", "ensayo-2.pdf", "application/pdf", bytes.byteLength, hash, "pending", "user-1"),
  ]);
  await database.prepare("UPDATE documents SET current_version_id = ? WHERE id = ?").bind("version-1", "document-1").run();
  await database.prepare("UPDATE documents SET current_version_id = ? WHERE id = ?").bind("version-2", "document-2").run();
  await database.prepare(`INSERT INTO professional_reviews (
    id, organization_id, property_id, checklist_item_id, document_id,
    document_version_id, reviewer_user_id, decision, observation
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind("review-1", "org-1", "property-1", "item-1", "document-1", "version-1", "user-1", "approved", "Evidencia revisada en el ensayo de restauración.")
    .run();
  await database.batch([
    database.prepare(`INSERT INTO evidence_links (
      id, organization_id, property_id, checklist_item_id, document_id,
      sufficiency, assessed_version_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind("link-1", "org-1", "property-1", "item-1", "document-1", "sufficient", "version-1"),
    database.prepare(`INSERT INTO evidence_links (
      id, organization_id, property_id, checklist_item_id, document_id
    ) VALUES (?, ?, ?, ?, ?)`)
      .bind("link-2", "org-1", "property-1", "item-2", "document-1"),
    database.prepare(`INSERT INTO evidence_links (
      id, organization_id, property_id, checklist_item_id, document_id
    ) VALUES (?, ?, ?, ?, ?)`)
      .bind("link-3", "org-1", "property-1", "item-1", "document-2"),
  ]);
  await bucket.put("org-1/property-1/document-1/version-1.pdf", bytes, {
    customMetadata: { organizationId: "org-1", sha256: hash },
    httpMetadata: { contentType: "application/pdf" },
  });
  await bucket.put("org-1/property-1/document-2/version-2.pdf", bytes, {
    customMetadata: { organizationId: "org-1", sha256: hash },
    httpMetadata: { contentType: "application/pdf" },
  });
}

async function restoreRows(database, table, rows) {
  for (const row of rows) {
    const columns = Object.keys(row);
    const placeholders = columns.map(() => "?").join(", ");
    await database
      .prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`)
      .bind(...columns.map((column) => row[column]))
      .run();
  }
}

async function countRows(database, table) {
  const row = await database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
  return Number(row?.count ?? 0);
}

async function dependencyOrder(database, tables) {
  const dependencies = new Map();
  for (const table of tables) {
    assert.match(table, /^[a-z_][a-z0-9_]*$/);
    const keys = await database.prepare(`PRAGMA foreign_key_list(${table})`).all();
    dependencies.set(table, new Set(keys.results.map((key) => key.table).filter((parent) => parent !== table)));
  }
  const ordered = [];
  while (dependencies.size) {
    const ready = [...dependencies].filter(([, parents]) => [...parents].every((parent) => ordered.includes(parent)));
    assert.ok(ready.length, "foreign-key cycles need an explicit recovery procedure");
    for (const [table] of ready) {
      ordered.push(table);
      dependencies.delete(table);
    }
  }
  return ordered;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
