import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the dossier status model covers the manual workflow", async () => {
  const source = await readFile(
    new URL("../lib/property-status.ts", import.meta.url),
    "utf8",
  );

  for (const status of [
    "incomplete",
    "pending_documents",
    "requires_professional_review",
    "ready_for_review",
    "professionally_reviewed",
  ]) {
    assert.match(source, new RegExp(`"${status}"`));
  }

  assert.match(source, /every\(\(status\) => status === "reviewed"\)/);
  assert.match(source, /status === "observed"/);
  assert.match(source, /status === "in_review"/);
});

test("property access and document storage remain tenant scoped", async () => {
  const source = await readFile(
    new URL("../db/properties.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /pag\.organization_id = p\.organization_id[\s\S]*pag\.property_id = p\.id[\s\S]*pag\.user_id = \?/,
  );
  assert.match(
    source,
    /storageKey = `\$\{input\.organizationId\}\/\$\{input\.propertyId\}\/\$\{documentId\}\/\$\{versionId\}`/,
  );
  assert.match(source, /malware_scan_status[\s\S]*pending/);
  assert.doesNotMatch(source, /publicUrl|public_url/);
});

test("external dashboard metrics require an active property grant", async () => {
  const source = await readFile(
    new URL("../db/properties.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /getDashboardMetrics[\s\S]*membership\.role === "professional"[\s\S]*property_access_grants[\s\S]*revoked_at IS NULL/,
  );
});
