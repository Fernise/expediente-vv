import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {deriveDossierStatus} from "../lib/property-status.ts";
import {validTaskDate,checklistSuggestions,factGuides} from "../lib/checklist-plan.ts";
test("operational completion never impersonates professional review",()=>{
  const op=status=>({itemKind:"operational",workflowStatus:status});
  const req=status=>({itemKind:"professional_requirement",workflowStatus:status});
  assert.equal(deriveDossierStatus([op("completed")]),"requires_professional_review");
  assert.equal(deriveDossierStatus([op("pending"),req("reviewed")]),"incomplete");
  assert.equal(deriveDossierStatus([op("completed"),req("pending")]),"pending_documents");
  assert.equal(deriveDossierStatus([op("completed"),req("in_review")]),"ready_for_review");
  assert.equal(deriveDossierStatus([op("completed"),req("reviewed")]),"professionally_reviewed");
  assert.equal(deriveDossierStatus([op("pending"),req("observed")]),"requires_professional_review");
});
test("a single item in review cannot mark an unfinished dossier ready",()=>{
  assert.equal(deriveDossierStatus(["pending","in_review"]),"pending_documents");
  assert.equal(deriveDossierStatus(["document_requested","reviewed"]),"pending_documents");
  assert.equal(deriveDossierStatus(["evidence_added","in_review"]),"requires_professional_review");
  assert.equal(deriveDossierStatus(["reviewed","in_review"]),"ready_for_review");
  assert.equal(deriveDossierStatus(["reviewed"]),"professionally_reviewed");
  assert.equal(deriveDossierStatus(["observed","pending"]),"requires_professional_review");
  assert.equal(deriveDossierStatus([]),"incomplete");
});
test("task dates reject impossible dates; optional suggestions are distinct",()=>{
  for(const value of ["","2028-02-29","2026-10-09"])assert.equal(validTaskDate(value),true);
  for(const value of ["2026-02-29","2026-02-30","2026-13-01","2026-1-1"])assert.equal(validTaskDate(value),false);
  assert.equal(new Set(checklistSuggestions.map(s=>s.title)).size,checklistSuggestions.length);
  assert.equal(Object.keys(factGuides).length,3);
});
test("task edits preserve review history and require authorized property access",async()=>{
  const source=await readFile(new URL("../db/properties.ts",import.meta.url),"utf8");
  assert.match(source,/manageChecklistTask[\s\S]*authorize\(actor,input.organizationId,"property.update"\)/);
  assert.match(source,/No se puede cambiar el contenido de una tarea con historial de revisión/);
  assert.match(source,/No se puede eliminar una tarea con evidencias/);
  assert.match(source,/COUNT\(\*\)<50/);
  assert.match(source,/Vincula una evidencia disponible y vigente/);
});
