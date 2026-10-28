import {
  database,
  getMembershipContext,
  type ActorInput,
} from "@/db/organizations";
import { ensurePropertySchema } from "@/db/properties";
import { can, type Role } from "@/lib/permissions";

export type AuditCategory =
  | "access"
  | "checklist"
  | "documents"
  | "organization"
  | "properties"
  | "rules";

export type AuditFilters = {
  actorId?: string;
  category?: AuditCategory | "all";
  page?: number;
  period?: 7 | 30 | 90 | "all";
  query?: string;
};

export type AuditEventView = {
  action: string;
  actorName: string;
  actorType: "support" | "system" | "user";
  category: AuditCategory;
  description: string;
  entityHref: string | null;
  entityLabel: string | null;
  id: string;
  occurredAt: string;
  title: string;
};

export type AuditActorOption = {
  id: string;
  name: string;
};

export type AuditOverview = {
  actors: AuditActorOption[];
  events: AuditEventView[];
  page: number;
  pageSize: number;
  stats: {
    access: number;
    documents: number;
    rules: number;
    total: number;
  };
  total: number;
};

type AuditRow = {
  action: string;
  actorName: string | null;
  actorType: AuditEventView["actorType"];
  entityLabel: string | null;
  entityType: string;
  id: string;
  metadataJson: string;
  occurredAt: string;
  propertyId: string | null;
};

const PAGE_SIZE = 40;

export class AuditAuthorizationError extends Error {}

export async function listAuditEvents(
  actor: ActorInput,
  organizationId: string,
  requestedFilters: AuditFilters = {},
): Promise<AuditOverview> {
  await ensurePropertySchema();
  const membership = await getMembershipContext(actor, organizationId);
  if (!membership || !can(membership.role as Role, "audit.read")) {
    throw new AuditAuthorizationError(
      "No tienes permiso para consultar la auditoría.",
    );
  }

  const db = database();
  const filters = normalizeFilters(requestedFilters);
  const { bindings, sql } = auditWhere(organizationId, filters);
  const offset = (filters.page - 1) * PAGE_SIZE;
  const joins = `
    LEFT JOIN app_users actor_user ON actor_user.id = ae.actor_user_id
    LEFT JOIN properties direct_property
      ON ae.entity_type = 'property'
     AND direct_property.organization_id = ae.organization_id
     AND direct_property.id = ae.entity_id
    LEFT JOIN documents document_entity
      ON ae.entity_type = 'document'
     AND document_entity.organization_id = ae.organization_id
     AND document_entity.id = ae.entity_id
    LEFT JOIN properties document_property
      ON document_property.organization_id = document_entity.organization_id
     AND document_property.id = document_entity.property_id
    LEFT JOIN checklist_items checklist_entity
      ON ae.entity_type = 'checklist_item'
     AND checklist_entity.organization_id = ae.organization_id
     AND checklist_entity.id = ae.entity_id
    LEFT JOIN property_checklists checklist
      ON checklist.organization_id = checklist_entity.organization_id
     AND checklist.id = checklist_entity.checklist_id
    LEFT JOIN properties checklist_property
      ON checklist_property.organization_id = checklist.organization_id
     AND checklist_property.id = checklist.property_id
    LEFT JOIN memberships target_membership
      ON ae.entity_type = 'membership'
     AND target_membership.organization_id = ae.organization_id
     AND target_membership.id = ae.entity_id
    LEFT JOIN app_users target_user ON target_user.id = target_membership.user_id
    LEFT JOIN organizations event_organization
      ON ae.entity_type = 'organization'
     AND event_organization.id = ae.entity_id`;

  const [eventResult, totalRow, statsRow, actorResult] = await Promise.all([
    db
      .prepare(
        `SELECT
          ae.id,
          ae.occurred_at AS occurredAt,
          ae.actor_type AS actorType,
          ae.action,
          ae.entity_type AS entityType,
          ae.metadata_json AS metadataJson,
          COALESCE(
            actor_user.display_name,
            CASE ae.actor_type
              WHEN 'system' THEN 'Sistema'
              WHEN 'support' THEN 'Soporte autorizado'
              ELSE 'Usuario no disponible'
            END
          ) AS actorName,
          COALESCE(
            direct_property.alias,
            document_property.alias,
            checklist_property.alias,
            target_user.display_name,
            event_organization.name
          ) AS entityLabel,
          COALESCE(
            direct_property.id,
            document_property.id,
            checklist_property.id
          ) AS propertyId
        FROM audit_events ae
        ${joins}
        WHERE ${sql}
        ORDER BY ae.occurred_at DESC, ae.id DESC
        LIMIT ? OFFSET ?`,
      )
      .bind(...bindings, PAGE_SIZE, offset)
      .all<AuditRow>(),
    db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM audit_events ae
         ${joins}
         WHERE ${sql}`,
      )
      .bind(...bindings)
      .first<{ total: number }>(),
    db
      .prepare(
        `SELECT
          COUNT(*) AS total,
          SUM(CASE
            WHEN ae.action LIKE 'membership.%'
              OR ae.action LIKE 'invitation.%'
            THEN 1 ELSE 0 END) AS access,
          SUM(CASE
            WHEN ae.action LIKE 'document.%' OR ae.action LIKE 'evidence.%'
            THEN 1 ELSE 0 END) AS documents,
          SUM(CASE
            WHEN ae.action LIKE 'rule_%'
              OR ae.action LIKE 'rules.%'
            THEN 1 ELSE 0 END) AS rules
         FROM audit_events ae
         WHERE ae.organization_id = ?
           AND ae.occurred_at >= datetime('now', '-30 days')`,
      )
      .bind(organizationId)
      .first<{
        access: number | null;
        documents: number | null;
        rules: number | null;
        total: number;
      }>(),
    db
      .prepare(
        `SELECT DISTINCT
          u.id,
          u.display_name AS name
         FROM audit_events ae
         INNER JOIN app_users u ON u.id = ae.actor_user_id
         WHERE ae.organization_id = ?
         ORDER BY u.display_name COLLATE NOCASE`,
      )
      .bind(organizationId)
      .all<AuditActorOption>(),
  ]);

  return {
    actors: actorResult.results ?? [],
    events: (eventResult.results ?? []).map(toAuditEvent),
    page: filters.page,
    pageSize: PAGE_SIZE,
    stats: {
      access: Number(statsRow?.access ?? 0),
      documents: Number(statsRow?.documents ?? 0),
      rules: Number(statsRow?.rules ?? 0),
      total: Number(statsRow?.total ?? 0),
    },
    total: Number(totalRow?.total ?? 0),
  };
}

function normalizeFilters(filters: AuditFilters) {
  const validCategories: Array<AuditCategory | "all"> = [
    "access",
    "all",
    "checklist",
    "documents",
    "organization",
    "properties",
    "rules",
  ];
  const validPeriods: Array<AuditFilters["period"]> = [7, 30, 90, "all"];
  return {
    actorId:
      typeof filters.actorId === "string"
        ? filters.actorId.trim().slice(0, 80)
        : "",
    category:
      filters.category !== undefined &&
      validCategories.includes(filters.category)
      ? filters.category
      : "all",
    page:
      Number.isInteger(filters.page) && Number(filters.page) > 0
        ? Number(filters.page)
        : 1,
    period:
      filters.period !== undefined && validPeriods.includes(filters.period)
        ? filters.period
        : 30,
    query:
      typeof filters.query === "string"
        ? filters.query.trim().slice(0, 80)
        : "",
  } as const;
}

function auditWhere(
  organizationId: string,
  filters: ReturnType<typeof normalizeFilters>,
) {
  const clauses = ["ae.organization_id = ?"];
  const bindings: unknown[] = [organizationId];

  if (filters.period !== "all") {
    clauses.push("ae.occurred_at >= datetime('now', ?)");
    bindings.push(`-${filters.period} days`);
  }
  if (filters.actorId) {
    clauses.push("ae.actor_user_id = ?");
    bindings.push(filters.actorId);
  }
  if (filters.category !== "all") {
    clauses.push(categoryClause(filters.category));
  }
  if (filters.query) {
    const query = `%${filters.query}%`;
    const actionAliases = auditActionAliases(filters.query);
    clauses.push(`(
      actor_user.display_name LIKE ? COLLATE NOCASE
      OR ae.action LIKE ? COLLATE NOCASE
      OR direct_property.alias LIKE ? COLLATE NOCASE
      OR document_property.alias LIKE ? COLLATE NOCASE
      OR checklist_property.alias LIKE ? COLLATE NOCASE
      OR target_user.display_name LIKE ? COLLATE NOCASE
      OR event_organization.name LIKE ? COLLATE NOCASE
      ${actionAliases.map(() => "OR ae.action LIKE ? COLLATE NOCASE").join("\n      ")}
    )`);
    bindings.push(query, query, query, query, query, query, query);
    bindings.push(...actionAliases);
  }

  return { bindings, sql: clauses.join(" AND ") };
}

function auditActionAliases(query: string) {
  const normalized = query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
  const aliases: Array<{ actions: string[]; words: string[] }> = [
    {
      actions: ["document.%", "evidence.%"],
      words: [
        "archivo",
        "documental",
        "documento",
        "rechazada",
        "seguridad",
        "subida",
      ],
    },
    {
      actions: ["invitation.%", "membership.%"],
      words: ["acceso", "equipo", "invitacion", "miembro"],
    },
    {
      actions: ["property.%"],
      words: ["expediente", "vivienda"],
    },
    {
      actions: ["rule_%", "rules.%"],
      words: ["evaluacion", "regla", "traza"],
    },
    {
      actions: ["checklist_item.%", "comment.%", "review.%"],
      words: ["checklist", "comentario", "decision", "nota", "revision", "tarea"],
    },
    {
      actions: ["data.%", "organization.%"],
      words: ["borrado", "datos", "eliminacion", "espacio", "exportacion", "organizacion", "privacidad"],
    },
  ];

  return aliases
    .filter(({ words }) => words.some((word) => normalized.includes(word)))
    .flatMap(({ actions }) => actions.map((action) => `%${action}%`));
}

function categoryClause(category: AuditCategory) {
  return {
    access:
      "(ae.action LIKE 'membership.%' OR ae.action LIKE 'invitation.%')",
    checklist:
      "(ae.action LIKE 'checklist_item.%' OR ae.action LIKE 'comment.%' OR ae.action LIKE 'review.%')",
    documents: "(ae.action LIKE 'document.%' OR ae.action LIKE 'evidence.%')",
    organization:
      "(ae.action LIKE 'organization.%' OR ae.action LIKE 'data.%')",
    properties: "ae.action LIKE 'property.%'",
    rules:
      "(ae.action LIKE 'rule_%' OR ae.action LIKE 'rules.%')",
  }[category];
}

function toAuditEvent(row: AuditRow): AuditEventView {
  const metadata = safeMetadata(row.metadataJson);
  const copy = auditCopy(row.action, metadata);
  const category = auditCategory(row.action);
  return {
    action: row.action,
    actorName: row.actorName ?? "Usuario no disponible",
    actorType: row.actorType,
    category,
    description: copy.description,
    entityHref: row.propertyId
      ? `/app/properties/${row.propertyId}`
      : category === "access"
        ? "/app/team"
        : category === "rules"
          ? "/app/rules"
          : row.action.startsWith("data.")
            ? "/app/privacy"
          : null,
    entityLabel: row.entityLabel,
    id: row.id,
    occurredAt: row.occurredAt,
    title: copy.title,
  };
}

function auditCategory(action: string): AuditCategory {
  if (action.startsWith("membership.") || action.startsWith("invitation.")) {
    return "access";
  }
  if (action.startsWith("document.") || action.startsWith("evidence.")) return "documents";
  if (
    action.startsWith("rule_") ||
    action.startsWith("rules.")
  ) {
    return "rules";
  }
  if (
    action.startsWith("checklist_item.") ||
    action.startsWith("comment.") ||
    action.startsWith("review.")
  ) {
    return "checklist";
  }
  if (action.startsWith("property.")) return "properties";
  return "organization";
}

function auditCopy(
  action: string,
  metadata: Record<string, unknown>,
): { description: string; title: string } {
  const role =
    typeof metadata.role === "string" ? roleLabel(metadata.role) : null;
  const propertyCount =
    typeof metadata.propertyCount === "number"
      ? metadata.propertyCount
      : null;
  const copies: Record<
    string,
    { description: string; title: string }
  > = {
    "checklist_item.status_changed": {
      description:
        "Se actualizó el estado operativo de un elemento del checklist.",
      title: "Estado del checklist actualizado",
    },
    "comment.created": {
      description:
        "Se añadió una nota interna. Su contenido no se muestra en auditoría.",
      title: "Comentario interno añadido",
    },
    "document.downloaded": {
      description:
        "Se autorizó y registró la descarga de un archivo disponible.",
      title: "Documento descargado",
    },
    "evidence.linked": {
      description: "Se vinculó un documento a un requisito de esta vivienda.",
      title: "Evidencia vinculada",
    },
    "evidence.unlinked": {
      description: "Se retiró el vínculo entre un documento y un requisito.",
      title: "Evidencia desvinculada",
    },
    "document.security_check_failed": {
      description:
        "El archivo no superó el control técnico y dejó de estar disponible.",
      title: "Documento rechazado por seguridad",
    },
    "document.security_check_passed": {
      description:
        "Un archivo en cuarentena superó el control técnico y quedó disponible.",
      title: "Control técnico superado",
    },
    "document.uploaded_after_security_check": {
      description:
        "Se incorporó un archivo privado después de superar el control técnico.",
      title: "Documento comprobado y guardado",
    },
    "document.upload_rejected_by_security": {
      description:
        "Un archivo no superó el control técnico y no llegó a almacenarse.",
      title: "Subida rechazada por seguridad",
    },
    "document.uploaded_to_quarantine": {
      description:
        "Se incorporó un archivo privado y quedó pendiente del análisis de seguridad.",
      title: "Documento subido a cuarentena",
    },
    "document.version_uploaded_to_quarantine": {
      description:
        "Se añadió una nueva versión sin eliminar la anterior.",
      title: "Nueva versión documental",
    },
    "document.version_uploaded_after_security_check": {
      description:
        "Se añadió una nueva versión comprobada sin eliminar la anterior.",
      title: "Nueva versión comprobada",
    },
    "document.version_rejected_by_security": {
      description:
        "Una nueva versión no superó el control técnico y no llegó a almacenarse.",
      title: "Nueva versión rechazada",
    },
    "data.deletion_cancelled": {
      description:
        "Se canceló la eliminación programada y el espacio seguirá activo.",
      title: "Eliminación cancelada",
    },
    "data.deletion_requested": {
      description:
        "Se programó la eliminación completa con un periodo de recuperación de 30 días.",
      title: "Eliminación programada",
    },
    "data.exported": {
      description:
        "Se preparó una copia portable de los datos y archivos disponibles del espacio.",
      title: "Datos exportados",
    },
    "invitation.accepted": {
      description: role
        ? `La invitación se aceptó con el rol ${role}.`
        : "La invitación se aceptó y se activó el acceso.",
      title: "Invitación aceptada",
    },
    "invitation.created": {
      description:
        propertyCount && propertyCount > 0
          ? `Se preparó una invitación limitada a ${propertyCount} vivienda${propertyCount === 1 ? "" : "s"}.`
          : "Se preparó una invitación para el espacio.",
      title: "Invitación preparada",
    },
    "invitation.revoked": {
      description: "Se canceló una invitación que todavía no se había aceptado.",
      title: "Invitación cancelada",
    },
    "membership.created": {
      description: role
        ? `Se concedió acceso con el rol ${role}.`
        : "Se concedió acceso al espacio.",
      title: "Miembro añadido",
    },
    "membership.revoked": {
      description:
        "Se revocaron la membresía y sus concesiones activas por vivienda.",
      title: "Acceso revocado",
    },
    "membership.updated": {
      description: role
        ? `Se actualizaron el alcance y el rol ${role}.`
        : "Se actualizaron el rol y el alcance del acceso.",
      title: "Acceso actualizado",
    },
    "organization.created": {
      description: "Se creó el espacio y su primera membresía administradora.",
      title: "Espacio creado",
    },
    "property.archived": {
      description:
        "La vivienda dejó de aparecer entre los expedientes activos.",
      title: "Vivienda archivada",
    },
    "property.created": {
      description: "Se abrió un nuevo expediente de vivienda.",
      title: "Vivienda añadida",
    },
    "property.updated": {
      description: "Se actualizaron los datos operativos del expediente.",
      title: "Vivienda actualizada",
    },
    "review.created": {
      description:
        "Se registró una decisión profesional sobre una evidencia y su versión exacta.",
      title: "Revisión profesional registrada",
    },
    "review.invalidated": {
      description:
        "La evidencia cambió y la decisión anterior dejó de ser vigente.",
      title: "Revisión profesional invalidada",
    },
    "rule_version.created": {
      description:
        "Se creó un borrador inmutable basado en la versión anterior.",
      title: "Versión de regla creada",
    },
    "rule_workflow.approved": {
      description:
        "Una persona autorizada aprobó la versión dentro del circuito editorial.",
      title: "Versión de reglas aprobada",
    },
    "rule_workflow.changes_requested": {
      description:
        "La revisión devolvió la versión para introducir cambios.",
      title: "Cambios solicitados",
    },
    "rule_workflow.professionally_reviewed": {
      description:
        "Se registró una revisión profesional independiente.",
      title: "Revisión profesional registrada",
    },
    "rule_workflow.submitted": {
      description: "El borrador se envió al circuito de revisión.",
      title: "Reglas enviadas a revisión",
    },
    "rule_workflow.withdrawn": {
      description: "La versión se retiró del circuito de revisión.",
      title: "Revisión retirada",
    },
    "rules.evaluated": {
      description:
        "El motor determinista generó una evaluación trazable del expediente.",
      title: "Reglas evaluadas",
    },
  };
  return (
    copies[action] ?? {
      description:
        "Se registró una acción operativa sin exponer contenido sensible.",
      title: "Actividad registrada",
    }
  );
}

function safeMetadata(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function roleLabel(role: string) {
  const labels: Record<string, string> = {
    manager: "gestor/a",
    organization_admin: "administrador/a",
    owner: "propietario/a",
    professional: "profesional",
  };
  return labels[role] ?? role;
}
