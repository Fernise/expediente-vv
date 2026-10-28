export type FactValue = boolean | string | null;

export type RuleCondition = {
  factKey: string;
  operator: "equals";
  value: boolean | string;
};

export type RuleDefinition = {
  condition: RuleCondition;
  displayExplanation: string;
  displayTitle: string;
  id: string;
  matchedResult?: "applies" | "not_applies";
  requirementId: string;
};

export type RuleEvaluationResult =
  | "applies"
  | "not_applies"
  | "unknown";

export type RuleEvaluation = {
  ruleVersionId: string;
  requirementId: string;
  result: RuleEvaluationResult;
  trace: {
    actualValue: FactValue;
    expectedValue: boolean | string;
    factKey: string;
    operator: "equals";
    reason: "fact_missing" | "condition_matched" | "condition_not_matched";
  };
};

export const RULE_ENGINE_VERSION = "vv-engine-0.1";

export function evaluateRules(
  facts: Record<string, FactValue>,
  rules: RuleDefinition[],
): RuleEvaluation[] {
  return rules.map((rule) => {
    const actualValue = facts[rule.condition.factKey] ?? null;
    if (actualValue === null) {
      return {
        requirementId: rule.requirementId,
        result: "unknown",
        ruleVersionId: rule.id,
        trace: {
          actualValue,
          expectedValue: rule.condition.value,
          factKey: rule.condition.factKey,
          operator: rule.condition.operator,
          reason: "fact_missing",
        },
      };
    }

    const matched = actualValue === rule.condition.value;
    const matchedResult = rule.matchedResult ?? "applies";
    const unmatchedResult =
      matchedResult === "applies" ? "not_applies" : "applies";
    return {
      requirementId: rule.requirementId,
      result: matched ? matchedResult : unmatchedResult,
      ruleVersionId: rule.id,
      trace: {
        actualValue,
        expectedValue: rule.condition.value,
        factKey: rule.condition.factKey,
        operator: rule.condition.operator,
        reason: matched ? "condition_matched" : "condition_not_matched",
      },
    };
  });
}

export function summarizeEvaluations(evaluations: RuleEvaluation[]) {
  return evaluations.reduce(
    (summary, evaluation) => {
      summary[evaluation.result] += 1;
      return summary;
    },
    { applies: 0, not_applies: 0, unknown: 0 },
  );
}

export type RuleConflict = {
  conditionKey: string;
  requirementId: string;
  ruleVersionIds: string[];
};

export function detectRuleConflicts(
  rules: RuleDefinition[],
): RuleConflict[] {
  const groups = new Map<string, RuleDefinition[]>();
  for (const rule of rules) {
    const conditionKey = JSON.stringify({
      factKey: rule.condition.factKey,
      operator: rule.condition.operator,
      value: rule.condition.value,
    });
    const key = `${rule.requirementId}|${conditionKey}`;
    groups.set(key, [...(groups.get(key) ?? []), rule]);
  }

  const conflicts: RuleConflict[] = [];
  for (const [key, groupedRules] of groups) {
    const outcomes = new Set(
      groupedRules.map((rule) => rule.matchedResult ?? "applies"),
    );
    if (groupedRules.length > 1 && outcomes.size > 1) {
      const separator = key.indexOf("|");
      conflicts.push({
        conditionKey: key.slice(separator + 1),
        requirementId: key.slice(0, separator),
        ruleVersionIds: groupedRules.map((rule) => rule.id).sort(),
      });
    }
  }
  return conflicts.sort((left, right) =>
    left.requirementId.localeCompare(right.requirementId),
  );
}
