import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pilotLicense } from "../lib/pilot-license.ts";
import { legalDocuments, LEGAL_APPROVED, LEGAL_VERSION } from "../lib/legal-documents.ts";

test("pilot licence is workspace-scoped and cannot enable payment", () => {
  const a = pilotLicense("workspace-a");
  const b = pilotLicense("workspace-b");
  assert.notEqual(a.organizationId, b.organizationId);
  assert.equal(a.billingEnabled, false);
  assert.equal(a.autoRenewal, false);
  assert.equal(a.commercialReady, false);
  assert.equal(a.amountDue, 0);
  assert.equal(a.dataScope, "fictional_or_anonymized");
  assert.throws(() => pilotLicense(" "));
});
test("legal drafts have full ES/EN content without claiming approval", () => {
  assert.equal(LEGAL_APPROVED, false);
  assert.match(LEGAL_VERSION, /draft$/);
  assert.deepEqual(Object.keys(legalDocuments).sort(), ["aviso-legal", "condiciones", "fuentes-oficiales", "privacidad"]);
  for (const doc of Object.values(legalDocuments)) {
    for (const language of ["es", "en"]) {
      assert.ok(doc.title[language] && doc.intro[language]);
      for (const section of doc.sections) assert.ok(section.heading[language] && section.body[language]);
    }
  }
});
test("private beta remains visibly provisional and is excluded from indexing", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const legal = await readFile(new URL("../app/legal/[document]/page.tsx", import.meta.url), "utf8");
  const chrome = await readFile(new URL("../app/components/PublicChrome.tsx", import.meta.url), "utf8");
  assert.match(layout, /index: false/);
  assert.match(legal, /identificación del titular y la revisión jurídica siguen pendientes/);
  assert.match(chrome, /Sin contratación ni cobros/);
});
test("licence centre requires identity and scopes counts to administrator", async () => {
  const page = await readFile(new URL("../app/app/license/page.tsx", import.meta.url), "utf8");
  assert.match(page, /requireActor\("\/app\/license"\)/);
  assert.match(page, /listOrganizationsForActor\(actor\)/);
  assert.match(page, /admin \? await getPrivacyOverview\(actor, organization.id\) : null/);
  assert.doesNotMatch(page, /<form|checkout|stripe/);
});
