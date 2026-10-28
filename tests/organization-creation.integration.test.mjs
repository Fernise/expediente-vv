import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { commitOrganizationCreationIn, OrganizationCreationError } from "../db/organization-creation-core.ts";

async function fixture(work) {
  const runtime = new Miniflare(convertV4MiniflareOptions({ compatibilityDate: "2026-09-04",
    d1Databases: ["DB"], modules: true, script: "export default {fetch(){return new Response('ok')}}" }));
  try {
    const db = await runtime.getD1Database("DB");
    const directory = new URL("../drizzle/", import.meta.url);
    for (const file of (await readdir(directory)).filter(name => /^\d{4}_.+\.sql$/.test(name)).sort()) {
      for (const sql of (await readFile(new URL(file, directory), "utf8")).split("--> statement-breakpoint")) {
        if (sql.trim()) await db.prepare(sql.trim()).run();
      }
    }
    await db.prepare("INSERT INTO app_users (id,email,display_name) VALUES ('one','one@example.invalid','One'),('two','two@example.invalid','Two')").run();
    await work(db);
  } finally { await runtime.dispose(); }
}
function draft(db, userId, name = "Oficina ficticia") {
  const id = crypto.randomUUID();
  const organization = { id, name, slug: id, timezone: "Atlantic/Canary", role: "organization_admin" };
  const statements = [
    db.prepare("INSERT INTO organizations (id,name,slug) VALUES (?,?,?)").bind(id, name, id),
    db.prepare("INSERT INTO memberships (id,organization_id,user_id,role) VALUES (?,?,?,'organization_admin')").bind(crypto.randomUUID(), id, userId),
    db.prepare("INSERT INTO audit_events (id,organization_id,actor_user_id,actor_type,action,entity_type,entity_id) VALUES (?,?,?,'user','organization.created','organization',?)").bind(crypto.randomUUID(), id, userId, id),
  ];
  return { organization, statements };
}
const submit = (db, user, key, name) => {
  const { organization, statements } = draft(db, user, name);
  return commitOrganizationCreationIn(db, user, key, organization, statements);
};
const hasStatus = status => error => error instanceof OrganizationCreationError && error.status === status;

test("lost responses and concurrent retries create exactly one workspace, membership and audit event", () => fixture(async db => {
  const key = crypto.randomUUID();
  const first = await submit(db, "one", key);
  assert.deepEqual(await submit(db, "one", key), first); // Successful response was lost.
  const concurrentKey = crypto.randomUUID();
  const concurrent = await Promise.all([submit(db, "one", concurrentKey), submit(db, "one", concurrentKey)]);
  assert.deepEqual(concurrent[0], concurrent[1]);
  for (const table of ["organizations", "memberships", "audit_events", "organization_creation_receipts"]) {
    assert.equal((await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n, 2, table);
  }
  await assert.rejects(submit(db, "one", key, "Otra oficina"), hasStatus(409));
  // A distinct user cannot receive someone else's workspace through the same key.
  assert.notEqual((await submit(db, "two", key)).id, first.id);
  await assert.rejects(submit(db, "one", "invalid"), hasStatus(400));
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM organizations").first()).n, 3);
}));

test("receipts re-check revocation, disabled tenants/accounts and preserve deletion without recreating a workspace", () => fixture(async db => {
  const key = crypto.randomUUID();
  const first = await submit(db, "one", key);
  await db.prepare("UPDATE memberships SET status='revoked' WHERE organization_id=?").bind(first.id).run();
  await assert.rejects(submit(db, "one", key), hasStatus(403));
  await db.prepare("UPDATE memberships SET status='active' WHERE organization_id=?").bind(first.id).run();
  await db.prepare("UPDATE organizations SET status='inactive' WHERE id=?").bind(first.id).run();
  await assert.rejects(submit(db, "one", key), hasStatus(403));
  await db.prepare("UPDATE organizations SET status='active' WHERE id=?").bind(first.id).run();
  await db.prepare("UPDATE app_users SET status='disabled' WHERE id='one'").run();
  await assert.rejects(submit(db, "one", key), hasStatus(403));
  await db.prepare("UPDATE app_users SET status='active' WHERE id='one'").run();
  await db.batch([db.prepare("DELETE FROM audit_events WHERE organization_id=?").bind(first.id),
    db.prepare("DELETE FROM organizations WHERE id=?").bind(first.id)]);
  assert.equal((await db.prepare("SELECT organization_id FROM organization_creation_receipts").first()).organization_id, null);
  await assert.rejects(submit(db, "one", key), hasStatus(403));
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM organizations").first()).n, 0);
}));

test("failed transactions roll back all inserts and allow a safe retry; old clients remain compatible", () => fixture(async db => {
  const key = crypto.randomUUID();
  const { organization, statements } = draft(db, "one");
  await assert.rejects(commitOrganizationCreationIn(db, "one", key, organization,
    [...statements, db.prepare("INSERT INTO organizations (id,name,slug) VALUES (?,?,?)").bind(organization.id, "Conflict", "conflict")]));
  for (const table of ["organizations", "memberships", "audit_events", "organization_creation_receipts"]) {
    assert.equal((await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n, 0);
  }
  assert.ok((await submit(db, "one", key)).id);
  assert.notEqual((await submit(db, "one", null)).id, (await submit(db, "one", null)).id);
}));
