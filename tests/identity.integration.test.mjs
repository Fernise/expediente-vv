import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { bindAttestedLegacyIdentityIn, createIdentityAccountIn, findIdentityAccountIn, getIdentityMembershipIn, IdentityConflictError } from "../db/identity-core.ts";

const strict = { allowLegacy: false };
const pilot = { allowLegacy: true };
const actor = (id, email) => ({ id, email, displayName: "Cuenta ficticia" });

async function fixture(work) {
  const runtime = new Miniflare(convertV4MiniflareOptions({
    compatibilityDate: "2026-09-04", d1Databases: ["DB"], modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
  }));
  try {
    const db = await runtime.getD1Database("DB");
    const directory = new URL("../drizzle/", import.meta.url);
    for (const file of (await readdir(directory)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()) {
      const sql = await readFile(new URL(file, directory), "utf8");
      for (const statement of sql.split("--> statement-breakpoint")) {
        if (statement.trim()) await db.prepare(statement.trim()).run();
      }
    }
    await work(db);
  } finally {
    await runtime.dispose();
  }
}

test("stable identity survives email changes and does not inherit another account", () => fixture(async (db) => {
  const original = await createIdentityAccountIn(db, actor("subject-a", "one@example.invalid"), strict);
  const changed = await findIdentityAccountIn(db, actor("subject-a", "two@example.invalid"), strict);
  assert.equal(changed.id, original.id);
  const cached = await db.prepare("SELECT email FROM app_users WHERE id = ?").bind(original.id).first();
  assert.equal(cached.email, "two@example.invalid");
  await assert.rejects(findIdentityAccountIn(db, actor("subject-b", "two@example.invalid"), pilot), IdentityConflictError);
  const recycled = await createIdentityAccountIn(db, actor("subject-b", "one@example.invalid"), strict);
  assert.notEqual(recycled.id, original.id);
  assert.notEqual(recycled.sitesSubject, original.sitesSubject);
}));

test("legacy accounts are not auto-bound; attested linking preserves IDs and memberships", () => fixture(async (db) => {
  await db.batch([
    db.prepare("INSERT INTO app_users (id, email, display_name) VALUES ('legacy', 'legacy@example.invalid', 'Legacy')"),
    db.prepare("INSERT INTO organizations (id, name, slug) VALUES ('org', 'Pilot', 'pilot')"),
    db.prepare("INSERT INTO memberships (id, organization_id, user_id, role) VALUES ('membership', 'org', 'legacy', 'organization_admin')"),
  ]);
  const legacyActor = actor("attested-subject", "legacy@example.invalid");
  assert.equal((await findIdentityAccountIn(db, legacyActor, pilot)).sitesSubject, null);
  await assert.rejects(findIdentityAccountIn(db, legacyActor, strict), IdentityConflictError);
  await bindAttestedLegacyIdentityIn(db, "legacy", "attested-subject");
  assert.equal((await findIdentityAccountIn(db, legacyActor, strict)).id, "legacy");
  assert.equal((await db.prepare("SELECT user_id FROM memberships WHERE id = 'membership'").first()).user_id, "legacy");
  await assert.rejects(bindAttestedLegacyIdentityIn(db, "legacy", "different-subject"), IdentityConflictError);
  await assert.rejects(findIdentityAccountIn(db, actor("different-subject", "legacy@example.invalid"), pilot), IdentityConflictError);
}));

test("disabled accounts, missing subjects and uniqueness conflicts fail closed", () => fixture(async (db) => {
  const created = await createIdentityAccountIn(db, actor("disabled-subject", "disabled@example.invalid"), strict);
  await db.prepare("UPDATE app_users SET status = 'disabled' WHERE id = ?").bind(created.id).run();
  await assert.rejects(findIdentityAccountIn(db, actor("disabled-subject", "changed@example.invalid"), pilot), IdentityConflictError);
  await assert.rejects(createIdentityAccountIn(db, actor("different", "disabled@example.invalid"), pilot), IdentityConflictError);
  await assert.rejects(findIdentityAccountIn(db, actor("", "disabled@example.invalid"), pilot), IdentityConflictError);
  await assert.rejects(findIdentityAccountIn(db, actor(" padded ", "disabled@example.invalid"), pilot), IdentityConflictError);
  await db.prepare("INSERT INTO app_users (id, email, display_name) VALUES ('other', 'other@example.invalid', 'Other')").run();
  await assert.rejects(bindAttestedLegacyIdentityIn(db, "other", "disabled-subject"));
  assert.equal((await db.prepare("SELECT sites_subject FROM app_users WHERE id = 'other'").first()).sites_subject, null);
}));

test("email collisions never transfer an established identity", () => fixture(async (db) => {
  const one = await createIdentityAccountIn(db, actor("one", "one@example.invalid"), strict);
  const two = await createIdentityAccountIn(db, actor("two", "two@example.invalid"), strict);
  assert.equal((await findIdentityAccountIn(db, actor("one", "two@example.invalid"), strict)).id, one.id);
  assert.equal((await findIdentityAccountIn(db, actor("two", "two@example.invalid"), strict)).id, two.id);
  assert.equal((await db.prepare("SELECT email FROM app_users WHERE id = ?").bind(one.id).first()).email, "one@example.invalid");
}));

test("concurrent registration creates one stable account", () => fixture(async (db) => {
  const input = actor("same-subject", "same@example.invalid");
  const [one, two] = await Promise.all([createIdentityAccountIn(db, input, strict), createIdentityAccountIn(db, input, strict)]);
  assert.equal(one.id, two.id);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM app_users").first()).n, 1);
}));

test("actual membership resolution keeps tenants isolated despite an email collision", () => fixture(async (db) => {
  const one = await createIdentityAccountIn(db, actor("one", "one@example.invalid"), strict);
  const two = await createIdentityAccountIn(db, actor("two", "two@example.invalid"), strict);
  await db.batch([
    db.prepare("INSERT INTO organizations (id, name, slug) VALUES ('org-a', 'A', 'a'), ('org-b', 'B', 'b')"),
    db.prepare("INSERT INTO memberships (id, organization_id, user_id, role) VALUES ('ma', 'org-a', ?, 'organization_admin'), ('mb', 'org-b', ?, 'manager')").bind(one.id, two.id),
  ]);
  const membership = await getIdentityMembershipIn(db, actor("one", "changed@example.invalid"), "org-a", strict);
  assert.equal(membership.userId, one.id);
  assert.equal(membership.role, "organization_admin");
  assert.equal(await getIdentityMembershipIn(db, actor("one", "changed@example.invalid"), "org-b", strict), null);
  assert.equal(await getIdentityMembershipIn(db, actor("two", "changed@example.invalid"), "org-a", strict), null);
  await db.prepare("UPDATE memberships SET status = 'revoked' WHERE id = 'ma'").run();
  assert.equal(await getIdentityMembershipIn(db, actor("one", "changed@example.invalid"), "org-a", strict), null);
}));
