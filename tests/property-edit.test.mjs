import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("authorized managers can edit a tenant-scoped property with server validation", async () => {
  const [database, route] = await Promise.all([
    readFile(new URL("../db/properties.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/properties/[id]/route.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(database, /authorize\([\s\S]{0,120}"property\.update"/);
  assert.match(database, /await assertPropertyAccess\(db, membership, input\.propertyId\)/);
  assert.match(database, /current\.dataProfile !== values\.dataProfile/);
  assert.match(database, /WHERE organization_id = \? AND id = \? AND archived_at IS NULL/);
  assert.match(database, /"property\.updated"/);
  assert.match(database, /\{ changedFields \}/);
  assert.match(route, /body\.action === "archive"/);
  assert.match(route, /await updateProperty\(actor/);
  assert.match(route, /error instanceof ValidationError/);
});

test("the dossier exposes a constrained edit flow with Canary municipality search", async () => {
  const [dossier, editPage, form, audit] = await Promise.all([
    readFile(
      new URL("../app/app/properties/[id]/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/app/properties/[id]/edit/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/PropertyEditForm.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../db/audit.ts", import.meta.url), "utf8"),
  ]);

  assert.match(dossier, /Editar/);
  assert.match(dossier, /query\.updated === "1"/);
  assert.match(editPage, /can\(organization\.role as Role, "property\.update"\)/);
  assert.match(form, /municipalityNameForIsland/);
  assert.match(form, /municipalitiesMatchingIsland/);
  assert.match(form, /action: "update"/);
  assert.match(form, /Guardando cambios/);
  assert.match(audit, /"property\.updated"/);
  assert.match(audit, /Vivienda actualizada/);
});
