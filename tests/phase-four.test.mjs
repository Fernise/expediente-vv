import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { buildPropertiesCsv } from "../lib/csv-export.ts";
import { createPropertyReport } from "../lib/property-report.ts";

const property = {
  activityStatus: "active",
  alias: "Casa Atlántico",
  dossierStatus: "pending_documents",
  dataProfile: "standard",
  id: "property-1",
  internalReference: "VV-2026-001",
  islandCode: "TF",
  managerName: "Equipo piloto",
  managerUserId: "user-1",
  municipality: "Santa Cruz de Tenerife",
  nextAction: "Solicitar documento; confirmar fecha",
  nextActionDueAt: "2026-08-10",
  ownerId: "owner-1",
  ownerName: 'María "Norte"',
  pendingItems: 2,
};

test("the CSV export is UTF-8, spreadsheet-safe and includes operational fields", () => {
  const csv = buildPropertiesCsv([property]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.match(csv, /Referencia;Alias;Isla;Municipio/);
  assert.match(csv, /Tenerife/);
  assert.match(csv, /"Solicitar documento; confirmar fecha"/);
  assert.match(csv, /"María ""Norte"""/);
});

test("the generated dossier report is a valid PDF with metadata", async () => {
  const pdf = await createPropertyReport({
    dossier: {
      activityStatus: "active",
      addressLine: "Calle del Mar, 4",
      alias: property.alias,
      archivedAt: null,
      cadastralReference: "1234567CS7413S0001AA",
      checklist: {
        generatedAt: "2026-07-30T12:00:00Z",
        id: "checklist-1",
        ruleVersionLabel: "VV-DEMO · 0.3",
        validationStatus: "draft_unvalidated",
      },
      checklistItems: [
        {
          assigneeName: "Equipo piloto",
          category: "Evidencias",
          dueAt: "2026-08-10",
          explanation: "Reunir la documentación disponible.",
          id: "item-1",
          position: 1,
          title: "Reunir documentación identificativa",
          workflowStatus: "document_requested",
        },
      ],
      comments: [],
      dossierStatus: property.dossierStatus,
      dataProfile: property.dataProfile,
      documents: [
        {
          documentDate: "2026-07-01",
          documentType: "Documento identificativo",
          expiresAt: "2027-07-01",
          id: "document-1",
          malwareScanStatus: "pending",
          mimeType: "application/pdf",
          originalFilename: "evidencia.pdf",
          sizeBytes: 1800,
          uploadedAt: "2026-07-30T12:00:00Z",
          workflowStatus: "quarantined",
        },
      ],
      id: property.id,
      internalReference: property.internalReference,
      islandCode: property.islandCode,
      managerName: property.managerName,
      municipality: property.municipality,
      nextAction: property.nextAction,
      nextActionDueAt: property.nextActionDueAt,
      organizationId: "org-1",
      ownerEmail: null,
      ownerName: property.ownerName,
      ownerPhone: null,
      postalCode: "38001",
    },
    generatedAt: new Date("2026-07-30T12:00:00Z"),
    organizationName: "Gestoría Atlántico",
  });

  assert.equal(Buffer.from(pdf.slice(0, 4)).toString(), "%PDF");
  const parsed = await PDFDocument.load(pdf);
  assert.equal(parsed.getTitle(), "Informe orientativo - Casa Atlántico");
  assert.ok(parsed.getPageCount() >= 1);
});

test("phase four downloads enforce explicit capabilities and quarantine", async () => {
  const { readFile } = await import("node:fs/promises");
  const [propertiesSource, reportRoute, exportRoute] = await Promise.all([
    readFile(new URL("../db/properties.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/properties/[id]/report/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/api/exports/properties/route.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(
    propertiesSource,
    /authorize\(actor, organizationId, "document\.read"\)/,
  );
  assert.match(propertiesSource, /isDownloadableSecurityState/);
  assert.match(propertiesSource, /dataProfile/);
  assert.match(reportRoute, /"report\.generate"/);
  assert.match(exportRoute, /"export\.csv"/);
});

test("document replacement preserves versions and repeats the security gate", async () => {
  const { readFile } = await import("node:fs/promises");
  const [propertiesSource, actionsSource, routeSource] = await Promise.all([
    readFile(new URL("../db/properties.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/components/PropertyActions.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/api/properties/[id]/documents/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assert.match(propertiesSource, /supersedes_id/);
  assert.match(
    propertiesSource,
    /AND current_version_id = \?/,
  );
  assert.match(
    propertiesSource,
    /workflow_status = 'available'/,
  );
  assert.match(
    propertiesSource,
    /document\.version_uploaded_after_security_check/,
  );
  assert.match(actionsSource, /La versión anterior se conservará/);
  assert.match(actionsSource, /deberá superar de nuevo el control técnico/);
  assert.match(routeSource, /replaceDocumentVersion/);
});

test("legacy quarantined documents can be checked only by authorized roles", async () => {
  const [propertiesSource, permissions, routeSource] = await Promise.all([
    readFile(new URL("../db/properties.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/permissions.ts", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../app/api/properties/[id]/documents/[documentId]/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(propertiesSource, /"document\.security\.manage"/);
  assert.match(propertiesSource, /document\.security_check_passed/);
  assert.match(propertiesSource, /document\.security_check_failed/);
  assert.match(permissions, /manager:[\s\S]*"document\.security\.manage"/);
  assert.doesNotMatch(permissions, /owner:[\s\S]*"document\.security\.manage"/);
  assert.match(routeSource, /export async function PATCH/);
  assert.match(routeSource, /recheckDocumentSecurity/);
  assert.match(propertiesSource, /structural_only/);
});

test("optional document notes satisfy the persisted non-null contract", async () => {
  const properties = await readFile(
    new URL("../db/properties.ts", import.meta.url),
    "utf8",
  );

  assert.match(properties, /cleanOptional\(input\.notes, 500\) \?\? ""/);
});
