export type DossierStatus =
  | "incomplete"
  | "pending_documents"
  | "requires_professional_review"
  | "ready_for_review"
  | "professionally_reviewed";

export type ChecklistWorkflowStatus =
  | "pending"
  | "document_requested"
  | "evidence_added"
  | "in_review"
  | "observed"
  | "reviewed"
  | "in_progress"
  | "completed";

export type ChecklistItemKind = "operational" | "professional_requirement";

export const dossierStatusLabels: Record<DossierStatus, string> = {
  incomplete: "Incompleto",
  pending_documents: "Pendiente de documentación",
  requires_professional_review: "Requiere revisión profesional",
  ready_for_review: "Preparado para revisión",
  professionally_reviewed: "Revisado por profesional",
};

export const checklistStatusLabels: Record<ChecklistWorkflowStatus, string> = {
  pending: "Pendiente",
  document_requested: "Documento solicitado",
  evidence_added: "Evidencia añadida",
  in_review: "En revisión",
  observed: "Observado",
  reviewed: "Revisado",
  in_progress: "En curso",
  completed: "Completada",
};

export function deriveDossierStatus(
  items: (ChecklistWorkflowStatus | {workflowStatus:ChecklistWorkflowStatus; itemKind?:ChecklistItemKind})[],
): DossierStatus {
  const normalized=items.map(item=>typeof item==="string"?{workflowStatus:item,itemKind:"professional_requirement"}:item);
  const requirements=normalized.filter(item=>item.itemKind!=="operational");
  const statuses=requirements.map(item=>item.workflowStatus);
  const openOperations=normalized.some(item=>item.itemKind==="operational" && item.workflowStatus!=="completed");
  if(statuses.some(status=>status==="observed"))return "requires_professional_review";
  if(openOperations)return "incomplete";
  if(normalized.length && !requirements.length)return "requires_professional_review";
  if (statuses.length === 0) return "incomplete";
  if (statuses.every((status) => status === "reviewed")) {
    return "professionally_reviewed";
  }
  if (statuses.some((status) => status === "observed")) {
    return "requires_professional_review";
  }
  if (statuses.some((status) => status === "pending" || status === "document_requested")) {
    return "pending_documents";
  }
  if (statuses.every((status) => status === "in_review" || status === "reviewed")) {
    return "ready_for_review";
  }
  if (
    statuses.some(
      (status) => status === "evidence_added" || status === "reviewed",
    ) &&
    !statuses.some(
      (status) => status === "pending" || status === "document_requested",
    )
  ) {
    return "requires_professional_review";
  }
  if (
    statuses.some(
      (status) => status === "pending" || status === "document_requested",
    )
  ) {
    return "pending_documents";
  }
  return "incomplete";
}

export function statusTone(status: DossierStatus): string {
  switch (status) {
    case "pending_documents":
      return "amber";
    case "requires_professional_review":
      return "violet";
    case "ready_for_review":
      return "blue";
    case "professionally_reviewed":
      return "green";
    default:
      return "slate";
  }
}
