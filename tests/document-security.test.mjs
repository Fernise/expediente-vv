import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { inspectDocumentSecurity } from "../lib/document-security.ts";
import { isDownloadableSecurityState } from "../lib/document-access-policy.ts";

const encoder = new TextEncoder();

test("real documents remain blocked even with a clean legacy status", () => {
  for (const status of ["clean", "structural_only", "pending", "failed", "infected", "unknown", ""]) {
    assert.equal(isDownloadableSecurityState(status, "standard"), false);
    assert.equal(isDownloadableSecurityState(status, "pilot_anonymized"),
      status === "clean" || status === "structural_only");
  }
});

test("portable exports apply the same anonymized-only boundary", async () => {
  const privacy = await readFile(new URL("../db/privacy.ts", import.meta.url), "utf8");
  assert.match(privacy, /WHERE dv.organization_id = o.id\s+AND p.data_profile = 'pilot_anonymized'/);
  assert.match(privacy, /WHERE dv.organization_id = \?\s+AND p.data_profile = 'pilot_anonymized'/);
});

test("a passive PDF passes the built-in structural security gate", () => {
  const result = inspectDocumentSecurity({
    bytes: encoder.encode(
      "%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF\n",
    ),
    filename: "expediente.pdf",
    mimeType: "application/pdf",
  });

  assert.deepEqual(result, {
    accepted: true,
    engine: "builtin-structural-v1",
  });
});

test("PDF actions and embedded files are rejected", () => {
  for (const token of ["/JavaScript", "/Launch", "/EmbeddedFile", "/XFA"]) {
    const result = inspectDocumentSecurity({
      bytes: encoder.encode(`%PDF-1.7\n<< ${token} 1 0 R >>\n%%EOF`),
      filename: "expediente.pdf",
      mimeType: "application/pdf",
    });
    assert.equal(result.accepted, false);
  }
});

test("declared file type must match the filename and real signature", () => {
  const mismatch = inspectDocumentSecurity({
    bytes: encoder.encode("%PDF-1.7\n%%EOF"),
    filename: "expediente.png",
    mimeType: "application/pdf",
  });
  const fake = inspectDocumentSecurity({
    bytes: encoder.encode("not a pdf"),
    filename: "expediente.pdf",
    mimeType: "application/pdf",
  });

  assert.equal(mismatch.accepted, false);
  assert.equal(fake.accepted, false);
});

test("PNG and JPEG structures are accepted without trailing payloads", () => {
  const png = new Uint8Array(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  const jpeg = new Uint8Array([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    0x00, 0xff, 0xd9,
  ]);

  assert.equal(
    inspectDocumentSecurity({
      bytes: png,
      filename: "evidencia.png",
      mimeType: "image/png",
    }).accepted,
    true,
  );
  assert.equal(
    inspectDocumentSecurity({
      bytes: jpeg,
      filename: "evidencia.jpg",
      mimeType: "image/jpeg",
    }).accepted,
    true,
  );
});

test("product copy distinguishes the pilot structural check from antivirus", async () => {
  const [dashboard, report, properties] = await Promise.all([
    readFile(new URL("../app/app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/property-report.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/properties.ts", import.meta.url), "utf8"),
  ]);

  assert.match(dashboard, /Evidencia privada con control técnico/);
  assert.match(report, /Control estructural del piloto/);
  assert.match(properties, /structural_only/);
  assert.match(properties, /análisis antimalware externo/);
  assert.doesNotMatch(dashboard, /Evidencia privada en cuarentena/);
  assert.doesNotMatch(properties, /quarantine: "cleared"/);
});

test("rejected uploads are audited without persisting their filenames", async () => {
  const [properties, audit] = await Promise.all([
    readFile(new URL("../db/properties.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/audit.ts", import.meta.url), "utf8"),
  ]);

  assert.match(properties, /document\.upload_rejected_by_security/);
  assert.match(properties, /document\.version_rejected_by_security/);
  assert.match(
    properties,
    /document\.upload_rejected_by_security[\s\S]{0,120}"property"[\s\S]{0,120}input\.propertyId/,
  );
  assert.match(audit, /Subida rechazada por seguridad/);
  assert.doesNotMatch(
    properties,
    /document\.upload_rejected_by_security[\s\S]{0,400}originalFilename/,
  );
});
