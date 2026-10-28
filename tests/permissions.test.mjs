import assert from "node:assert/strict";
import test from "node:test";
import { can } from "../lib/permissions.ts";

test("an owner cannot read internal comments or administer an organization", () => {
  assert.equal(can("owner", "comment.internal.read"), false);
  assert.equal(can("owner", "organization.manage"), false);
  assert.equal(can("owner", "membership.manage"), false);
  assert.equal(can("owner", "operations.read"), false);
});

test("a professional can review but cannot publish rules", () => {
  assert.equal(can("professional", "review.create"), true);
  assert.equal(can("professional", "review.close"), true);
  assert.equal(can("professional", "rules.review"), true);
  assert.equal(can("professional", "rules.approve"), false);
  assert.equal(can("professional", "rules.publish"), false);
});

test("a manager cannot close a professional review", () => {
  assert.equal(can("manager", "review.create"), true);
  assert.equal(can("manager", "review.close"), false);
  assert.equal(can("manager", "document.security.manage"), true);
  assert.equal(can("manager", "operations.read"), false);
});

test("an owner cannot release a quarantined document", () => {
  assert.equal(can("owner", "document.security.manage"), false);
});

test("the platform administrator has no routine document access", () => {
  assert.equal(can("platform_admin", "document.read"), false);
  assert.equal(can("platform_admin", "document.delete"), false);
  assert.equal(can("platform_admin", "rules.approve"), true);
});

test("an organization administrator cannot publish platform rules", () => {
  assert.equal(can("organization_admin", "rules.draft"), true);
  assert.equal(can("organization_admin", "rules.review"), false);
  assert.equal(can("organization_admin", "rules.approve"), true);
  assert.equal(can("organization_admin", "rules.publish"), false);
  assert.equal(can("organization_admin", "operations.read"), true);
  assert.equal(can("organization_admin", "review.close"), false);
});
