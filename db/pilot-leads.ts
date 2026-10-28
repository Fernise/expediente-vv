import { database, ensureCoreSchema } from "@/db/organizations";
import {
  gmailProviderStatus,
  sendWithGmail,
} from "@/lib/email/gmail";

const profiles = ["gestoria", "gestor", "arquitectura", "legal", "otro"] as const;
const propertyRanges = ["1-5", "6-20", "21-50", "51+"] as const;

export class PilotLeadValidationError extends Error {}

export type PilotDemoRequestInput = {
  communicationsConsent?: boolean;
  email: string;
  fullName: string;
  message?: string;
  organizationName: string;
  privacyAccepted?: boolean;
  professionalProfile: string;
  propertyRange: string;
  source?: string;
};

let pilotLeadInitialization: Promise<void> | null = null;

export async function ensurePilotLeadSchema(): Promise<void> {
  if (process.env.NODE_ENV !== "development") return;
  await ensureCoreSchema();
  if (pilotLeadInitialization) return pilotLeadInitialization;
  const db = database();
  pilotLeadInitialization = db
    .batch([
      db.prepare(
        `CREATE TABLE IF NOT EXISTS pilot_demo_requests (
          id TEXT PRIMARY KEY NOT NULL,
          full_name TEXT NOT NULL,
          email_normalized TEXT NOT NULL,
          organization_name TEXT NOT NULL,
          professional_profile TEXT NOT NULL,
          property_range TEXT NOT NULL,
          message TEXT,
          communications_consent INTEGER NOT NULL DEFAULT 0,
          privacy_accepted_at TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'public_demo_form',
          status TEXT NOT NULL DEFAULT 'new',
          notification_status TEXT NOT NULL DEFAULT 'pending',
          retention_until TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
      ),
      db.prepare(
        `CREATE INDEX IF NOT EXISTS pilot_demo_requests_email_time_idx
         ON pilot_demo_requests(email_normalized, created_at)`,
      ),
      db.prepare(
        `CREATE INDEX IF NOT EXISTS pilot_demo_requests_status_time_idx
         ON pilot_demo_requests(status, created_at)`,
      ),
      db.prepare(
        `CREATE INDEX IF NOT EXISTS pilot_demo_requests_retention_idx
         ON pilot_demo_requests(retention_until)`,
      ),
    ])
    .then(() => undefined)
    .catch((error) => {
      pilotLeadInitialization = null;
      throw error;
    });
  return pilotLeadInitialization;
}

export async function submitPilotDemoRequest(
  input: PilotDemoRequestInput,
): Promise<{ duplicate: boolean }> {
  await ensurePilotLeadSchema();
  const values = validateRequest(input);
  const db = database();
  const duplicate = await db
    .prepare(
      `SELECT id
       FROM pilot_demo_requests
       WHERE email_normalized = ?
         AND created_at >= datetime('now', '-15 minutes')
       LIMIT 1`,
    )
    .bind(values.email)
    .first<{ id: string }>();
  if (duplicate) return { duplicate: true };

  const requestId = crypto.randomUUID();
  const retentionDate = new Date();
  retentionDate.setUTCMonth(retentionDate.getUTCMonth() + 12);
  const retentionUntil = sqliteTimestamp(retentionDate);
  await db
    .prepare(
      `INSERT INTO pilot_demo_requests (
        id, full_name, email_normalized, organization_name,
        professional_profile, property_range, message,
        communications_consent, privacy_accepted_at, source,
        notification_status, retention_until
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, 'pending', ?)`,
    )
    .bind(
      requestId,
      values.fullName,
      values.email,
      values.organizationName,
      values.professionalProfile,
      values.propertyRange,
      values.message,
      values.communicationsConsent ? 1 : 0,
      values.source,
      retentionUntil,
    )
    .run();

  const provider = gmailProviderStatus();
  if (!provider.configured) return { duplicate: false };
  try {
    await sendWithGmail({
      body: [
        "Nueva solicitud de demostración de Expediente VV.",
        "",
        `Nombre: ${values.fullName}`,
        `Correo: ${values.email}`,
        `Organización: ${values.organizationName}`,
        `Perfil: ${profileLabel(values.professionalProfile)}`,
        `Viviendas gestionadas: ${values.propertyRange}`,
        `Comunicaciones del piloto: ${values.communicationsConsent ? "sí" : "no"}`,
        values.message ? `\nContexto:\n${values.message}` : "",
        "",
        `Referencia interna: ${requestId}`,
      ]
        .filter(Boolean)
        .join("\n"),
      deliveryId: requestId,
      subject: `Solicitud de demostración · ${values.organizationName}`,
      to: provider.sender,
    });
    await db
      .prepare(
        `UPDATE pilot_demo_requests
         SET notification_status = 'sent', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(requestId)
      .run();
  } catch {
    await db
      .prepare(
        `UPDATE pilot_demo_requests
         SET notification_status = 'failed', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(requestId)
      .run();
  }
  return { duplicate: false };
}

export async function purgeExpiredPilotDemoRequests(): Promise<number> {
  await ensurePilotLeadSchema();
  const result = await database()
    .prepare(
      `DELETE FROM pilot_demo_requests
       WHERE retention_until <= CURRENT_TIMESTAMP`,
    )
    .run();
  return Number(result.meta.changes ?? 0);
}

function validateRequest(input: PilotDemoRequestInput) {
  if (!input.privacyAccepted) {
    throw new PilotLeadValidationError(
      "Acepta la información de privacidad para enviar la solicitud.",
    );
  }
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[\r\n]/.test(email)) {
    throw new PilotLeadValidationError("Introduce un correo válido.");
  }
  const professionalProfile = input.professionalProfile.trim();
  if (!profiles.includes(professionalProfile as (typeof profiles)[number])) {
    throw new PilotLeadValidationError("Selecciona tu perfil profesional.");
  }
  const propertyRange = input.propertyRange.trim();
  if (!propertyRanges.includes(propertyRange as (typeof propertyRanges)[number])) {
    throw new PilotLeadValidationError("Selecciona cuántas viviendas gestionas.");
  }
  return {
    communicationsConsent: Boolean(input.communicationsConsent),
    email,
    fullName: cleanRequired(input.fullName, "Nombre", 80),
    message: cleanOptional(input.message, 600),
    organizationName: cleanRequired(input.organizationName, "Organización", 120),
    professionalProfile: professionalProfile as (typeof profiles)[number],
    propertyRange: propertyRange as (typeof propertyRanges)[number],
    source: cleanOptional(input.source, 60) ?? "public_demo_form",
  };
}

function cleanRequired(value: string, label: string, maxLength: number): string {
  const cleaned = cleanOptional(value, maxLength);
  if (!cleaned || cleaned.length < 2) {
    throw new PilotLeadValidationError(`${label} debe tener al menos 2 caracteres.`);
  }
  return cleaned;
}

function cleanOptional(value: string | undefined, maxLength: number): string | null {
  const cleaned = value
    ?.replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  if (cleaned.length > maxLength) {
    throw new PilotLeadValidationError(`El campo supera ${maxLength} caracteres.`);
  }
  return cleaned;
}

function profileLabel(value: (typeof profiles)[number]): string {
  return {
    arquitectura: "Arquitectura / técnico",
    gestor: "Gestor de viviendas",
    gestoria: "Gestoría",
    legal: "Asesoría legal",
    otro: "Otro perfil profesional",
  }[value];
}

function sqliteTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}
