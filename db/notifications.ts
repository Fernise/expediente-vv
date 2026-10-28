import { database, ensureCoreSchema } from "@/db/organizations";
import {
  GmailProviderError,
  gmailProviderStatus,
  sendWithGmail,
} from "@/lib/email/gmail";

type DeliveryRow = {
  attemptCount: number;
  id: string;
  organizationId: string;
  organizationName: string;
  payloadJson: string;
  recipientEmail: string;
  relatedDueAt: string | null;
  templateKey: "operational_reminder" | "team_invitation";
};

export type NotificationDispatchSummary = {
  configured: boolean;
  failed: number;
  sent: number;
};

export async function processPendingNotificationDeliveries(
  limit = 25,
): Promise<NotificationDispatchSummary> {
  return processNotificationDeliveries({ limit });
}

export async function processNotificationDeliveryNow(
  deliveryId: string,
): Promise<NotificationDispatchSummary> {
  return processNotificationDeliveries({ deliveryId, limit: 1 });
}

async function processNotificationDeliveries({
  deliveryId,
  limit,
}: {
  deliveryId?: string;
  limit: number;
}): Promise<NotificationDispatchSummary> {
  await ensureCoreSchema();
  const provider = gmailProviderStatus();
  if (!provider.configured) {
    return { configured: false, failed: 0, sent: 0 };
  }

  const db = database();
  const deliveryFilter = deliveryId ? "AND nd.id = ?" : "";
  const statement = db.prepare(
      `SELECT
        nd.id,
        nd.organization_id AS organizationId,
        nd.template_key AS templateKey,
        nd.recipient_email AS recipientEmail,
        nd.payload_json AS payloadJson,
        nd.attempt_count AS attemptCount,
        o.name AS organizationName,
        i.expires_at AS relatedDueAt
      FROM notification_deliveries nd
      INNER JOIN organizations o ON o.id = nd.organization_id
      LEFT JOIN invitations i
        ON nd.entity_type = 'invitation' AND i.id = nd.entity_id
      WHERE nd.scheduled_at <= CURRENT_TIMESTAMP
        ${deliveryFilter}
        AND nd.attempt_count < 5
        AND (
          nd.status = 'pending_provider'
          OR (
            nd.status = 'failed'
            AND nd.next_attempt_at IS NOT NULL
            AND nd.next_attempt_at <= CURRENT_TIMESTAMP
          )
          OR (
            nd.status = 'queued'
            AND nd.last_attempt_at < datetime('now', '-30 minutes')
          )
        )
      ORDER BY nd.scheduled_at, nd.created_at
      LIMIT ?`,
    );
  const boundedLimit = Math.max(1, Math.min(limit, 100));
  const deliveries = await (deliveryId
    ? statement.bind(deliveryId, boundedLimit)
    : statement.bind(boundedLimit)
  ).all<DeliveryRow>();

  let failed = 0;
  let sent = 0;
  for (const delivery of deliveries.results ?? []) {
    const claimed = await claimDelivery(db, delivery);
    if (!claimed) continue;
    const attemptNumber = Number(delivery.attemptCount) + 1;
    try {
      const message = renderDelivery(delivery);
      const result = await sendWithGmail({
        ...message,
        deliveryId: delivery.id,
        to: delivery.recipientEmail,
      });
      await db.batch([
        db
          .prepare(
            `UPDATE notification_deliveries
             SET status = 'sent', sent_at = CURRENT_TIMESTAMP,
                 next_attempt_at = NULL, error_code = NULL,
                 provider_message_id = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND organization_id = ? AND status = 'queued'`,
          )
          .bind(
            result.providerMessageId,
            delivery.id,
            delivery.organizationId,
          ),
        auditDeliveryStatement(
          db,
          delivery,
          "notification.sent",
          { attemptNumber, provider: "gmail", templateKey: delivery.templateKey },
        ),
      ]);
      sent += 1;
    } catch (error) {
      const providerError = normalizeProviderError(error);
      const nextAttemptAt = retryAt(providerError.retryable, attemptNumber);
      await db.batch([
        db
          .prepare(
            `UPDATE notification_deliveries
             SET status = 'failed', error_code = ?, next_attempt_at = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND organization_id = ? AND status = 'queued'`,
          )
          .bind(
            providerError.code,
            nextAttemptAt,
            delivery.id,
            delivery.organizationId,
          ),
        auditDeliveryStatement(
          db,
          delivery,
          "notification.failed",
          {
            attemptNumber,
            errorCode: providerError.code,
            retryScheduled: Boolean(nextAttemptAt),
            templateKey: delivery.templateKey,
          },
        ),
      ]);
      failed += 1;
    }
  }

  return { configured: true, failed, sent };
}

async function claimDelivery(
  db: D1Database,
  delivery: DeliveryRow,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE notification_deliveries
       SET status = 'queued', attempt_count = attempt_count + 1,
           last_attempt_at = CURRENT_TIMESTAMP, next_attempt_at = NULL,
           error_code = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND organization_id = ? AND attempt_count < 5
         AND (
           status = 'pending_provider'
           OR (
             status = 'failed' AND next_attempt_at IS NOT NULL
             AND next_attempt_at <= CURRENT_TIMESTAMP
           )
           OR (
             status = 'queued'
             AND last_attempt_at < datetime('now', '-30 minutes')
           )
         )`,
    )
    .bind(delivery.id, delivery.organizationId)
    .run();
  return Number(result.meta.changes ?? 0) === 1;
}

function renderDelivery(delivery: DeliveryRow): {
  body: string;
  subject: string;
} {
  const payload = safePayload(delivery.payloadJson);
  if (delivery.templateKey === "team_invitation") {
    const role = roleLabel(stringValue(payload.role));
    const scope =
      stringValue(payload.scope) === "property"
        ? `${numberValue(payload.propertyCount)} vivienda(s) asignada(s)`
        : "todo el espacio de trabajo";
    return {
      subject: "Invitación a Expediente VV",
      body: [
        "Hola:",
        "",
        `Te han invitado a colaborar en ${delivery.organizationName}.`,
        `Rol: ${role}.`,
        `Alcance: ${scope}.`,
        delivery.relatedDueAt
          ? `La invitación está disponible hasta el ${formatDate(delivery.relatedDueAt)}.`
          : "",
        "",
        "Entra en Expediente VV con esta misma dirección de correo para aceptar el acceso.",
        "",
        "Equipo de Expediente VV",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }

  const alias = stringValue(payload.propertyAlias) || "Vivienda sin alias";
  const reference = stringValue(payload.internalReference);
  const dueAt = stringValue(payload.dueAt);
  return {
    subject: "Aviso pendiente en Expediente VV",
    body: [
      "Hola:",
      "",
      `Hay un aviso que requiere atención en ${delivery.organizationName}.`,
      `Vivienda: ${alias}${reference ? ` · ${reference}` : ""}.`,
      `Tipo: ${reminderKindLabel(stringValue(payload.kind))}.`,
      dueAt ? `Fecha objetivo: ${formatDate(dueAt)}.` : "",
      "",
      "Abre Expediente VV desde tu acceso habitual para revisar el expediente.",
      "Este correo no contiene documentos ni la dirección de la vivienda.",
      "",
      "Equipo de Expediente VV",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

function auditDeliveryStatement(
  db: D1Database,
  delivery: DeliveryRow,
  action: "notification.failed" | "notification.sent",
  metadata: Record<string, unknown>,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO audit_events (
        id, organization_id, actor_user_id, actor_type, action,
        entity_type, entity_id, metadata_json
      ) VALUES (?, ?, NULL, 'system', ?, 'notification_delivery', ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      delivery.organizationId,
      action,
      delivery.id,
      JSON.stringify(metadata),
    );
}

function normalizeProviderError(error: unknown): GmailProviderError {
  if (error instanceof GmailProviderError) return error;
  return new GmailProviderError("gmail_unexpected_failure", true);
}

function retryAt(retryable: boolean, attemptNumber: number): string | null {
  if (!retryable || attemptNumber >= 5) return null;
  const delays = [15, 60, 360, 1_440];
  const minutes = delays[Math.min(attemptNumber - 1, delays.length - 1)];
  return sqliteTimestamp(new Date(Date.now() + minutes * 60 * 1000));
}

function safePayload(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 160) : "";
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function roleLabel(value: string): string {
  const labels: Record<string, string> = {
    manager: "Gestor/a",
    organization_admin: "Administrador/a",
    owner: "Propietario/a",
    professional: "Profesional",
  };
  return labels[value] ?? "Colaborador/a";
}

function reminderKindLabel(value: string): string {
  const labels: Record<string, string> = {
    checklist_due: "tarea del expediente",
    document_expiry: "vencimiento documental",
    next_action_due: "siguiente acción",
    professional_review: "revisión profesional",
  };
  return labels[value] ?? "seguimiento del expediente";
}

function formatDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "fecha pendiente de revisar";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Atlantic/Canary",
  }).format(date);
}

function sqliteTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}
