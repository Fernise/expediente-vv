export type RuleWorkflowStatus =
  | "draft_unvalidated"
  | "in_review"
  | "reviewed"
  | "approved"
  | "published"
  | "retired";

export type RuleWorkflowAction =
  | "submitted"
  | "withdrawn"
  | "changes_requested"
  | "professionally_reviewed"
  | "approved";

export function nextRuleWorkflowStatus(
  currentStatus: RuleWorkflowStatus,
  action: RuleWorkflowAction,
): RuleWorkflowStatus | null {
  if (action === "submitted" && currentStatus === "draft_unvalidated") {
    return "in_review";
  }
  if (
    (action === "withdrawn" || action === "changes_requested") &&
    currentStatus === "in_review"
  ) {
    return "draft_unvalidated";
  }
  if (
    action === "professionally_reviewed" &&
    currentStatus === "in_review"
  ) {
    return "reviewed";
  }
  if (action === "approved" && currentStatus === "reviewed") {
    return "approved";
  }
  return null;
}
