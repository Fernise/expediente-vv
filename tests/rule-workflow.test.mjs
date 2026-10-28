import assert from "node:assert/strict";
import test from "node:test";
import { nextRuleWorkflowStatus } from "../lib/rule-workflow.ts";

test("the editorial workflow follows the guarded sequence", () => {
  assert.equal(
    nextRuleWorkflowStatus("draft_unvalidated", "submitted"),
    "in_review",
  );
  assert.equal(
    nextRuleWorkflowStatus("in_review", "professionally_reviewed"),
    "reviewed",
  );
  assert.equal(nextRuleWorkflowStatus("reviewed", "approved"), "approved");
});

test("review can return safely to a draft", () => {
  assert.equal(
    nextRuleWorkflowStatus("in_review", "changes_requested"),
    "draft_unvalidated",
  );
  assert.equal(
    nextRuleWorkflowStatus("in_review", "withdrawn"),
    "draft_unvalidated",
  );
});

test("invalid editorial shortcuts are rejected", () => {
  assert.equal(nextRuleWorkflowStatus("draft_unvalidated", "approved"), null);
  assert.equal(
    nextRuleWorkflowStatus("draft_unvalidated", "professionally_reviewed"),
    null,
  );
  assert.equal(nextRuleWorkflowStatus("in_review", "approved"), null);
});
