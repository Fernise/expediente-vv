import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { can } from "../lib/permissions.ts";
import { createStoredZip, crc32, safeZipSegment } from "../lib/zip-stream.ts";

test("only organization administrators can export and delete all workspace data", () => {
  assert.equal(can("organization_admin", "data.export"), true);
  assert.equal(can("organization_admin", "data.delete"), true);
  assert.equal(can("manager", "data.export"), false);
  assert.equal(can("manager", "data.delete"), false);
  assert.equal(can("professional", "data.export"), false);
  assert.equal(can("owner", "data.delete"), false);
});

test("the portability archive uses valid ZIP records and safe paths", async () => {
  async function* entries() {
    yield { bytes: new TextEncoder().encode("hola"), path: "datos.json" };
    yield {
      bytes: new Uint8Array([1, 2, 3]),
      path: "documentos/VV-1/contrato.pdf",
    };
  }
  const bytes = new Uint8Array(
    await new Response(createStoredZip(entries())).arrayBuffer(),
  );
  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50);
  const text = new TextDecoder().decode(bytes);
  assert.match(text, /datos\.json/);
  assert.match(text, /documentos\/VV-1\/contrato\.pdf/);
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  assert.equal(safeZipSegment("../../contrato?.pdf"), "contrato-.pdf");
});

test("privacy controls provide recovery, portability and an automated purge", async () => {
  const [page, controls, privacyDb, exportRoute, scheduled, migration] =
    await Promise.all([
      readFile(new URL("../app/app/privacy/page.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../app/components/DataPrivacyControls.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../db/privacy.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../app/api/exports/organization/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../lib/scheduled-operations.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../drizzle/0008_polite_slapstick.sql", import.meta.url),
        "utf8",
      ),
    ]);

  assert.match(page, /Datos y privacidad/);
  assert.match(page, /Mientras el espacio siga activo/);
  assert.match(controls, /Descargar paquete ZIP/);
  assert.match(controls, /periodo de recuperación de 30 días/);
  assert.match(controls, /confirmation !== organizationName/);
  assert.match(privacyDb, /"data\.export"/);
  assert.match(privacyDb, /"data\.delete"/);
  assert.match(privacyDb, /malware_scan_status = 'clean'/);
  assert.doesNotMatch(privacyDb, /SELECT[^\n]*token_hash/i);
  assert.match(privacyDb, /env\.DOCUMENTS\.delete/);
  assert.match(privacyDb, /DELETE FROM organizations/);
  assert.match(exportRoute, /cache-control": "private, no-store"/);
  assert.match(exportRoute, /MAX_PORTABILITY_EXPORT_BYTES/);
  assert.match(scheduled, /processScheduledOrganizationDeletions/);
  assert.match(migration, /deletion_requested_at/);
  assert.match(migration, /deletion_scheduled_at/);
});
