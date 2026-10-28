import assert from "node:assert/strict";
import test from "node:test";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { hasPropertyAccessIn } from "../db/property-access-core.ts";

test("D1 keeps organizations isolated and enforces scoped role grants", async () => {
  const miniflare = new Miniflare(
    convertV4MiniflareOptions({
      compatibilityDate: "2026-09-04",
      d1Databases: ["DB"],
      modules: true,
      script: "export default { fetch() { return new Response('ok') } }",
    }),
  );

  try {
    const database = await miniflare.getD1Database("DB");
    await database.batch([
      database.prepare(`CREATE TABLE properties (
        id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        PRIMARY KEY (organization_id, id)
      )`),
      database.prepare(`CREATE TABLE property_access_grants (
        organization_id TEXT NOT NULL,
        property_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        revoked_at TEXT,
        expires_at TEXT
      )`),
      database
        .prepare("INSERT INTO properties (id, organization_id) VALUES (?, ?), (?, ?)")
        .bind("property-a", "org-a", "property-b", "org-b"),
      database
        .prepare(`INSERT INTO property_access_grants (
          organization_id, property_id, user_id, expires_at
        ) VALUES (?, ?, ?, NULL), (?, ?, ?, '2020-01-01 00:00:00')`)
        .bind(
          "org-a",
          "property-a",
          "professional-a",
          "org-a",
          "property-a",
          "owner-expired",
        ),
    ]);

    const context = (organizationId, role, userId) => ({
      mfaRequired: role === "organization_admin" || role === "professional",
      organizationId,
      organizationName: organizationId,
      organizationSlug: organizationId,
      role,
      userId,
    });

    assert.equal(
      await hasPropertyAccessIn(
        database,
        context("org-a", "organization_admin", "admin-a"),
        "property-a",
      ),
      true,
    );
    assert.equal(
      await hasPropertyAccessIn(
        database,
        context("org-a", "organization_admin", "admin-a"),
        "property-b",
      ),
      false,
      "an administrator must not cross the tenant boundary",
    );
    assert.equal(
      await hasPropertyAccessIn(
        database,
        context("org-a", "professional", "professional-a"),
        "property-a",
      ),
      true,
    );
    assert.equal(
      await hasPropertyAccessIn(
        database,
        context("org-a", "professional", "professional-without-grant"),
        "property-a",
      ),
      false,
    );
    assert.equal(
      await hasPropertyAccessIn(
        database,
        context("org-a", "owner", "owner-expired"),
        "property-a",
      ),
      false,
      "expired grants must fail closed",
    );

    await database.prepare(
      "UPDATE property_access_grants SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ?",
    ).bind("professional-a").run();
    assert.equal(await hasPropertyAccessIn(database,
      context("org-a", "professional", "professional-a"), "property-a"), false,
      "revocation takes effect on the next access check");
    await database.prepare(
      "UPDATE property_access_grants SET revoked_at = NULL, expires_at = '2099-01-01 00:00:00' WHERE user_id = ?",
    ).bind("professional-a").run();
    assert.equal(await hasPropertyAccessIn(database,
      context("org-a", "professional", "professional-a"), "property-a"), true);
    assert.equal(await hasPropertyAccessIn(database,
      context("org-b", "professional", "professional-a"), "property-b"), false,
      "a grant in one organization never unlocks another organization");
  } finally {
    await miniflare.dispose();
  }
});
