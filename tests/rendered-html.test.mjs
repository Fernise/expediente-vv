import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

test("defines product copy without legal-certification claims", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Expediente VV/);
  assert.match(page, /Cada vivienda/);
  assert.match(page, /con todo su expediente/);
  assert.match(page, /Hecho para trabajar, no para adivinar/);
  assert.match(page, /No certifica la legalidad/);
  assert.match(layout, /lang=\{locale\}/);
  assert.match(layout, /expediente-vv-language/);
  assert.match(layout, /=== "en" \? "en" : "es"/);
  assert.doesNotMatch(page, /codex-preview|react-loading-skeleton/i);
  assert.doesNotMatch(page, />Cumple</i);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("removes the temporary starter preview", async () => {
  await assert.rejects(access(new URL("../app/_sites-preview", templateRoot)));
});

test("button-like landing controls are real links", async () => {
  const [page, chrome] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/PublicChrome.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Abrir la demostración desde Casa Atlántico/);
  assert.match(chrome, /href="\/legal\/aviso-legal"/);
  assert.match(chrome, /href="\/legal\/privacidad"/);
  assert.match(chrome, /href="\/legal\/fuentes-oficiales"/);
  assert.doesNotMatch(page, /<span>Aviso legal<\/span>/);
});

test("workspace creation is available from the active workspace selector", async () => {
  const [shell, form, route] = await Promise.all([
    readFile(
      new URL("../app/components/WorkspaceShell.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/components/CreateOrganizationForm.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../app/api/organizations/route.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(shell, /Crear otro espacio/);
  assert.match(shell, /changeOrganization\(createdOrganization\.id\)/);
  assert.match(shell, /viviendas, documentos,\s+equipo y permisos/);
  assert.match(form, /Crear y entrar/);
  assert.match(form, /onCreated\(payload\.organization\)/);
  assert.match(route, /organization.*status: 201/s);
});
