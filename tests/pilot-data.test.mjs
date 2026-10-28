import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  directIdentifierLabel,
  isPilotOwnerAlias,
  syntheticPropertyError,
} from "../lib/pilot-data.ts";

test("the pilot detector recognizes direct identifiers without blocking normal notes", () => {
  assert.equal(directIdentifierLabel("Contactar en persona la próxima semana"), null);
  assert.equal(directIdentifierLabel("correo persona@example.com"), "un correo electrónico");
  assert.equal(directIdentifierLabel("DNI 12345678Z"), "un DNI o NIE");
  assert.equal(directIdentifierLabel("NIE X1234567L"), "un DNI o NIE");
  assert.equal(directIdentifierLabel("Tel. +34 612 345 678"), "un teléfono");
  assert.equal(
    directIdentifierLabel("ES91 2100 0418 4502 0005 1332".replaceAll(" ", "")),
    "un IBAN",
  );
});

test("pilot owners must use a deliberate pseudonym", () => {
  assert.equal(isPilotOwnerAlias("Propietario 01"), true);
  assert.equal(isPilotOwnerAlias("Titular A-2"), true);
  assert.equal(isPilotOwnerAlias("María Pérez"), false);
});

test("the anonymized workflow is enforced by both the interface and server", async () => {
  const [form, actions, propertyDb, propertyRoute, documentRoute, dossier, migration] =
    await Promise.all([
      readFile(new URL("../app/components/PropertyForm.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/components/PropertyActions.tsx", import.meta.url), "utf8"),
      readFile(new URL("../db/properties.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/properties/route.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../app/api/properties/[id]/documents/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/app/properties/[id]/page.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../drizzle/0009_dark_dark_phoenix.sql", import.meta.url),
        "utf8",
      ),
    ]);

  assert.match(form, /const pilotAnonymized = true/);
  assert.match(form, /name="dataProfile"/);
  assert.match(form, /pilot_anonymized/);
  assert.doesNotMatch(form, /readOnly=\{pilotAnonymized\}|disabled=\{pilotAnonymized\}/);
  assert.match(actions, /name="anonymizationConfirmed"/);
  assert.match(actions, /no contiene\s+nombres, DNI\/NIE/);
  assert.match(propertyRoute, /dataProfile: stringValue/);
  assert.match(documentRoute, /anonymizationConfirmed/);
  assert.match(propertyDb, /assertPilotTextAllowed/);
  assert.match(propertyDb, /assertPilotDocumentAllowed/);
  assert.match(propertyDb, /syntheticPropertyError\(input\)/);
  assert.match(dossier, /Prueba anonimizada/);
  assert.match(migration, /data_profile/);
});
test("synthetic fields reject real or ambiguous identifiers", () => {
  assert.equal(syntheticPropertyError({}), null);
  assert.equal(syntheticPropertyError({addressLine:"Calle Ejemplo 12",cadastralReference:"DEMO-A001",ownerEmail:"propietario02@example.invalid",ownerPhone:"000000000"}), null);
  for (const input of [{addressLine:"Avenida de Anaga 1"},{cadastralReference:"12345678901234567890"},{ownerEmail:"persona@gmail.com"},{ownerEmail:"persona@example.invalid.evil.com"},{ownerPhone:"612345678"}]) assert.ok(syntheticPropertyError(input));
});

test("real data remains closed until identity and malware controls are verifiable", async () => {
  const [form, properties, team] = await Promise.all([
    readFile(new URL("../app/components/PropertyForm.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/properties.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/team.ts", import.meta.url), "utf8"),
  ]);

  assert.match(form, /Obligatorio en el piloto/);
  assert.match(form, /value="pilot_anonymized"/);
  assert.match(properties, /Los datos reales permanecen desactivados/);
  assert.match(properties, /MFA verificable y análisis antimalware externo/);
  assert.match(team, /'organization_admin', 'professional'/);
});
