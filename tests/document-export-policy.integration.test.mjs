import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";

test("the actual export query excludes real, quarantined and cross-tenant files", async () => {
  const source = await readFile(new URL("../db/privacy.ts", import.meta.url), "utf8");
  const body = source.slice(source.indexOf("async function exportDocumentFiles("));
  const sql = body.match(/\.prepare\(\s*`([\s\S]*?)`/)[1];
  const runtime = new Miniflare(convertV4MiniflareOptions({
    compatibilityDate: "2026-09-04", d1Databases: ["DB"], modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
  }));
  try {
    const db = await runtime.getD1Database("DB");
    await db.batch([
      db.prepare("CREATE TABLE properties (id TEXT, organization_id TEXT, data_profile TEXT, internal_reference TEXT)"),
      db.prepare("CREATE TABLE documents (id TEXT, organization_id TEXT, property_id TEXT)"),
      db.prepare("CREATE TABLE document_versions (id TEXT, organization_id TEXT, document_id TEXT, storage_key TEXT, original_filename TEXT, mime_type TEXT, size_bytes INTEGER, sha256 TEXT, malware_scan_status TEXT, uploaded_at TEXT)"),
    ]);
    const cases = [
      ["pilot-clean", "org-a", "pilot_anonymized", "clean"],
      ["pilot-structural", "org-a", "pilot_anonymized", "structural_only"],
      ["pilot-pending", "org-a", "pilot_anonymized", "pending"],
      ["pilot-infected", "org-a", "pilot_anonymized", "infected"],
      ["real-clean", "org-a", "standard", "clean"],
      ["real-structural", "org-a", "standard", "structural_only"],
      ["other-tenant", "org-b", "pilot_anonymized", "clean"],
    ];
    for (const [id, org, profile, status] of cases) {
      await db.batch([
        db.prepare("INSERT INTO properties VALUES (?, ?, ?, ?)").bind(id, org, profile, id),
        db.prepare("INSERT INTO documents VALUES (?, ?, ?)").bind(id, org, id),
        db.prepare("INSERT INTO document_versions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(id, org, id, id, "fictitious.pdf", "application/pdf", 10, "sample-hash", status, "2026-10-08"),
      ]);
    }
    const result = await db.prepare(sql).bind("org-a").all();
    assert.deepEqual(result.results.map((row) => row.versionId).sort(), ["pilot-clean", "pilot-structural"]);
  } finally {
    await runtime.dispose();
  }
});
