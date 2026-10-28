import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { can } from "../lib/permissions.ts";

test("only the professional role can close a formal evidence review", () => {
  assert.equal(can("professional", "review.close"), true);
  assert.equal(can("manager", "review.close"), false);
  assert.equal(can("organization_admin", "review.close"), false);
  assert.equal(can("owner", "review.close"), false);
});

test("formal reviews bind an immutable decision to the current evidence version", async () => {
  const [database, schema, route, interfaceSource] = await Promise.all([
    readFile(new URL("../db/properties.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/properties/[id]/reviews/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/PropertyActions.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(schema, /professionalReviews/);
  assert.match(schema, /documentVersionId/);
  assert.match(schema, /reviewerUserId/);
  assert.match(schema, /invalidatedAt/);
  assert.match(database, /INSERT INTO professional_reviews/);
  assert.match(database, /tiene una decisión profesional vigente y su estado no puede modificarse manualmente/);
  assert.match(database, /membership\.role !== "professional"/);
  assert.match(database, /La observación debe tener entre 12 y 800 caracteres/);
  assert.match(route, /guardMutationRequest/);
  assert.match(route, /createProfessionalReview/);
  assert.match(interfaceSource, /la decisión no se puede editar/);
  assert.match(interfaceSource, /Registrar decisión/);
  assert.match(interfaceSource, /submitting \|\| !decision/);
});

test("replacing reviewed evidence invalidates the decision and reopens the item", async () => {
  const database = await readFile(
    new URL("../db/properties.ts", import.meta.url),
    "utf8",
  );

  assert.match(database, /invalidation_reason = 'evidence_replaced'/);
  assert.match(database, /invalidated_by_version_id = \?/);
  assert.match(database, /SET workflow_status = 'evidence_added'/);
  assert.match(database, /"review\.invalidated"/);
  assert.match(database, /dossier_status = 'requires_professional_review'/);
});

test("expiry invalidation is part of the daily operational cycle", async () => {
  const [database, reminders, migration] = await Promise.all([
    readFile(new URL("../db/properties.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/reminders.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../drizzle/0016_smiling_zeigeist.sql", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(database, /invalidation_reason = 'evidence_expired'/);
  assert.match(database, /actor_type, action[\s\S]*'system', 'review\.invalidated'/);
  assert.match(reminders, /invalidateExpiredProfessionalReviewsIn/);
  assert.match(migration, /professional_reviews_active_item_uidx/);
  assert.match(migration, /WHERE "professional_reviews"\."invalidated_at" IS NULL/);
});
