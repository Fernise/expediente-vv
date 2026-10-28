import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the public pilot funnel connects pricing, demo requests and the checker", async () => {
  const [home, chrome, pricing, demo, checker] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/PublicChrome.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/precios/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/solicitar-demo/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/comprobador/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(chrome, /href="\/comprobador"/);
  assert.match(chrome, /href="\/precios"/);
  assert.match(chrome, /href="\/solicitar-demo"/);
  assert.match(home, /Solicitar demostración/);
  assert.match(pricing, /0 €/);
  assert.match(pricing, /no hay pagos ni permanencia/i);
  assert.match(demo, /No pedimos documentos, direcciones ni información de propietarios/);
  assert.match(checker, /no evaluaremos su situación jurídica/i);
  assert.match(checker, /sede\.gobiernodecanarias\.org\/sede\/tramites\/5548/);
});

test("demo requests are minimized, deduplicated, retained and notified safely", async () => {
  const [schema, leads, route, form, scheduled, migration] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/pilot-leads.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/pilot/demo-requests/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/components/DemoRequestForm.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/scheduled-operations.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0010_superb_terrax.sql", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /pilot_demo_requests/);
  assert.match(migration, /CREATE TABLE `pilot_demo_requests`/);
  assert.match(leads, /created_at >= datetime\('now', '-15 minutes'\)/);
  assert.match(leads, /setUTCMonth\(retentionDate\.getUTCMonth\(\) \+ 12\)/);
  assert.match(leads, /sendWithGmail/);
  assert.match(leads, /DELETE FROM pilot_demo_requests/);
  assert.match(route, /guardMutationRequest/);
  assert.match(route, /stringValue\(body\.website\)/);
  assert.match(form, /privacyAccepted/);
  assert.match(form, /communicationsConsent/);
  assert.match(scheduled, /purgeExpiredPilotDemoRequests/);
});

test("the public checker stays local and avoids legal conclusions", async () => {
  const [checker, checkerPage] = await Promise.all([
    readFile(
      new URL("../app/components/PublicDossierChecker.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/comprobador/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(checker, /fetch\(/);
  assert.doesNotMatch(checker, /localStorage|sessionStorage/);
  assert.match(checkerPage, /Una respuesta positiva nunca significa/);
  assert.match(checker, /No revisa documentos, normativa ni la situación de una vivienda/);
  assert.match(checker, /Preparado para revisión/);
  assert.doesNotMatch(checker, /cumple correctamente|vivienda legal/i);
});
