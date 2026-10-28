import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("property creation opens a fresh dossier with a durable pending state", async () => {
  const [form, dossier, loading] = await Promise.all([
    readFile(
      new URL("../app/components/PropertyForm.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/app/properties/[id]/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/app/properties/[id]/loading.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(form, /router\.replace\(`\/app\/properties\/\$\{result\.property\.id\}\?created=1`\)/);
  assert.doesNotMatch(form, /router\.refresh\(\)/);
  assert.match(dossier, /query\.created === "1"/);
  assert.match(dossier, /Vivienda creada/);
  assert.match(loading, /Abriendo expediente/);
});

test("property links announce navigation and dossier rules reuse one verified dossier", async () => {
  const [dashboard, properties, dossier, rules] = await Promise.all([
    readFile(new URL("../app/app/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/app/properties/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/app/properties/[id]/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../db/rules.ts", import.meta.url), "utf8"),
  ]);

  assert.match(dashboard, /<PendingLink[\s\S]{0,220}Abrir expediente/);
  assert.match(properties, /<PendingLink[\s\S]{0,260}>\s*Abrir/);
  assert.match(dossier, /getPropertyDossierRulesWorkspace/);
  assert.match(rules, /const dossier = await getPropertyDossier/);
  assert.match(rules, /return \{ dossier, rulesWorkspace \}/);
  assert.match(rules, /await Promise\.all\(\[\s*db/);
});
