import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  detectRuleConflicts,
  evaluateRules,
  summarizeEvaluations,
} from "../lib/rules-engine.ts";

const rules = [
  {
    condition: {
      factKey: "demo.available",
      operator: "equals",
      value: false,
    },
    displayExplanation: "Demo",
    displayTitle: "Demo",
    id: "rule-version-1",
    requirementId: "requirement-1",
  },
];

test("missing facts produce unknown rather than a positive conclusion", () => {
  const [evaluation] = evaluateRules({}, rules);
  assert.equal(evaluation.result, "unknown");
  assert.equal(evaluation.trace.reason, "fact_missing");
  assert.equal(evaluation.trace.actualValue, null);
});

test("the same fact snapshot produces the same deterministic result", () => {
  const first = evaluateRules({ "demo.available": false }, rules);
  const second = evaluateRules({ "demo.available": false }, rules);
  assert.deepEqual(first, second);
  assert.equal(first[0].result, "applies");
});

test("a non-matching condition does not suggest a task", () => {
  const [evaluation] = evaluateRules({ "demo.available": true }, rules);
  assert.equal(evaluation.result, "not_applies");
  assert.equal(evaluation.trace.reason, "condition_not_matched");
});

test("evaluation summaries keep unknowns separate", () => {
  const summary = summarizeEvaluations([
    ...evaluateRules({ "demo.available": false }, rules),
    {
      ...evaluateRules({}, rules)[0],
      ruleVersionId: "rule-version-2",
    },
  ]);
  assert.deepEqual(summary, {
    applies: 1,
    not_applies: 0,
    unknown: 1,
  });
});

test("persisted evaluations and facts are tenant scoped", async () => {
  const source = await readFile(
    new URL("../db/rules.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /WHERE organization_id = \? AND property_id = \?/,
  );
  assert.match(
    source,
    /UNIQUE \(organization_id, property_id, fact_key\)/,
  );
  assert.match(
    source,
    /FOREIGN KEY \(organization_id, property_id\) REFERENCES properties\(organization_id, id\)/,
  );
});

test("demo rules cannot masquerade as published professional rules", async () => {
  const source = await readFile(
    new URL("../db/rules.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /draft_unvalidated/);
  assert.match(source, /Sin valor jurídico/);
  assert.doesNotMatch(source, /'published'/);
});

test("rule governance separates author, reviewer, and approver", async () => {
  const source = await readFile(
    new URL("../db/rules.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /membership\.userId === catalog\.ruleSet\.createdByUserId/,
  );
  assert.match(
    source,
    /membership\.userId === professionalReview\?\.actorUserId/,
  );
  assert.match(source, /rule_review_events/);
  assert.match(source, /rule_workflow\.\$\{input\.action\}/);
});

test("opposite outcomes for the same requirement and condition conflict", () => {
  const conflicts = detectRuleConflicts([
    rules[0],
    {
      ...rules[0],
      id: "rule-version-2",
      matchedResult: "not_applies",
    },
  ]);
  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0].ruleVersionIds, [
    "rule-version-1",
    "rule-version-2",
  ]);
});

test("different requirements do not produce a false conflict", () => {
  const conflicts = detectRuleConflicts([
    rules[0],
    {
      ...rules[0],
      id: "rule-version-2",
      matchedResult: "not_applies",
      requirementId: "requirement-2",
    },
  ]);
  assert.deepEqual(conflicts, []);
});
