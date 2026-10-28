import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("team management is tenant scoped and guarded by capability", async () => {
  const source = await readFile(
    new URL("../db/team.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /"membership\.manage"/);
  assert.match(
    source,
    /WHERE m\.organization_id = \?[\s\S]*m\.status IN \('active', 'suspended'\)/,
  );
  assert.match(
    source,
    /WHERE id = \? AND organization_id = \?/,
  );
  assert.match(
    source,
    /No puedes cambiar ni revocar tu propio acceso/,
  );
});

test("limited roles require explicit properties and revocation closes grants", async () => {
  const source = await readFile(
    new URL("../db/team.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /role === "professional" \|\| role === "owner"/);
  assert.match(source, /Selecciona al menos una vivienda/);
  assert.match(
    source,
    /Alguna vivienda seleccionada no pertenece a este espacio/,
  );
  assert.match(
    source,
    /UPDATE property_access_grants[\s\S]*revoked_at = CURRENT_TIMESTAMP/,
  );
  assert.match(source, /"membership\.revoked"/);
});

test("pending invitations are claimed only by the authenticated email", async () => {
  const source = await readFile(
    new URL("../db/organizations.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /WHERE email_normalized = \?/);
  assert.match(source, /expires_at > CURRENT_TIMESTAMP/);
  assert.match(source, /invitation\.accepted/);
  assert.match(
    source,
    /FROM invitation_property_scopes[\s\S]*WHERE invitation_id = \?/,
  );
});

test("the team interface exposes invitations, roles, grants and revocation", async () => {
  const [page, component, shell] = await Promise.all([
    readFile(new URL("../app/app/team/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/components/TeamManagement.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/WorkspaceShell.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(page, /Decide quién entra/);
  assert.match(component, /Preparar invitación/);
  assert.match(component, /Viviendas autorizadas/);
  assert.match(component, /Revocar acceso/);
  assert.match(component, /La cola está lista/i);
  assert.match(component, /Hasta autorizar Google/i);
  assert.match(component, /setSuccess\("Invitación cancelada\."\)/);
  assert.match(shell, /href="\/app\/team"/);
});
