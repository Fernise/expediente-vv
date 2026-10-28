import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("audit queries require capability and stay organization scoped", async () => {
  const source = await readFile(
    new URL("../db/audit.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /"audit\.read"/);
  assert.match(source, /ae\.organization_id = \?/);
  assert.match(source, /\.bind\(organizationId\)/);
  assert.match(source, /ORDER BY ae\.occurred_at DESC, ae\.id DESC/);
  assert.match(source, /LIMIT \? OFFSET \?/);
});

test("audit filters cover actors, periods and operational categories", async () => {
  const source = await readFile(
    new URL("../db/audit.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /ae\.actor_user_id = \?/);
  assert.match(source, /datetime\('now', \?\)/);
  assert.match(source, /membership\.%/);
  assert.match(source, /document\.%/);
  assert.match(source, /checklist_item\.%/);
  assert.match(source, /rule_%/);
  assert.match(source, /document\.security_check_passed/);
  assert.match(source, /document\.security_check_failed/);
});

test("audit search understands the Spanish labels shown to users", async () => {
  const source = await readFile(
    new URL("../db/audit.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /function auditActionAliases/);
  assert.match(source, /"archivo"[\s\S]*"rechazada"[\s\S]*"seguridad"/);
  assert.match(source, /\["expediente", "vivienda"\]/);
  assert.match(source, /bindings\.push\(\.\.\.actionAliases\)/);
});

test("audit copy does not expose raw document or comment contents", async () => {
  const [source, page] = await Promise.all([
    readFile(new URL("../db/audit.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/app/audit/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(source, /safeMetadata/);
  assert.match(source, /Su contenido no se muestra en auditoría/);
  assert.match(page, /No replica el\s+contenido de archivos, comentarios/);
  assert.doesNotMatch(page, /metadataJson|addressLine|cadastralReference/);
});

test("audit is a real protected navigation destination", async () => {
  const [page, shell] = await Promise.all([
    readFile(new URL("../app/app/audit/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/components/WorkspaceShell.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(page, /Trazabilidad operativa/);
  assert.match(page, /Buscar persona, vivienda o acción/);
  assert.match(page, /Historial del espacio/);
  assert.match(shell, /href="\/app\/audit"/);
  assert.doesNotMatch(shell, /Auditoría <small>Próximamente/);
});
