
import { I18nText, LocalizedControl } from "@/app/components/Language";
import Link from "next/link";
import {
  Activity,
  BellRing,
  CheckCircle2,
  Clock3,
  MailCheck,
  MailWarning,
  ServerCog,
  ShieldX,
  TriangleAlert,
} from "lucide-react";
import { WorkspaceShell } from "@/app/components/WorkspaceShell";
import { OperationsRunControls } from "@/app/components/OperationsRunControls";
import { getOperationalOverview } from "@/db/operations";
import { listOrganizationsForActor } from "@/db/organizations";
import { activeOrganizationFrom } from "@/lib/active-organization";
import { requireActor } from "@/lib/auth";
import { can, type Role } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const actor = await requireActor("/app/operations");
  const organizations = await listOrganizationsForActor(actor);
  const organization = await activeOrganizationFrom(organizations);

  if (!organization) {
    return (
      <main className="app-gate">
        <section className="gate-card">
          <h1><I18nText>Primero crea un espacio</I18nText></h1>
          <Link className="button button-primary" href="/app"><I18nText>Volver al inicio</I18nText></Link>
        </section>
      </main>
    );
  }

  if (!can(organization.role as Role, "operations.read")) {
    return (
      <WorkspaceShell
        active="operations"
        actor={actor}
        organization={organization}
        organizations={organizations}
      >
        <div className="workspace-content narrow-content">
          <section className="empty-state">
            <span><ShieldX aria-hidden="true" /></span>
            <div>
              <h1><I18nText>Estado operativo restringido</I18nText></h1>
              <p><I18nText>Solo la administración puede consultar la salud técnica del espacio.</I18nText></p>
            </div>
            <Link className="button button-primary" href="/app"><I18nText>Volver al resumen</I18nText></Link>
          </section>
        </div>
      </WorkspaceShell>
    );
  }

  const overview = await getOperationalOverview(actor, organization.id);
  const status = statusCopy(overview.status);

  return (
    <WorkspaceShell
      active="operations"
      actor={actor}
      organization={organization}
      organizations={organizations}
    >
      <div className="workspace-content operations-content">
        <header className="page-heading operations-heading">
          <div>
            <span className="eyebrow"><I18nText>Supervisión del piloto</I18nText></span>
            <h1><I18nText>Estado operativo</I18nText></h1>
            <p><I18nText>
              Señales técnicas de </I18nText>{organization.name}<I18nText> sin mostrar destinatarios,
              documentos ni datos personales.
            </I18nText></p>
          </div>
          <div className={`operations-status ${overview.status}`}>
            {overview.status === "healthy" ? (
              <CheckCircle2 aria-hidden="true" />
            ) : overview.status === "waiting" ? (
              <Clock3 aria-hidden="true" />
            ) : (
              <TriangleAlert aria-hidden="true" />
            )}
            <span><strong>{status.title}</strong><small>{status.detail}</small></span>
          </div>
        </header>

        <LocalizedControl as="section" aria-label="Resumen operativo" className="operations-summary">
          <article>
            {overview.emailConfigured ? <MailCheck aria-hidden="true" /> : <MailWarning aria-hidden="true" />}
            <span><I18nText>Proveedor de correo</I18nText><strong><I18nText>{overview.emailConfigured ? "Configurado" : "Pendiente"}</I18nText></strong></span>
          </article>
          <article>
            <BellRing aria-hidden="true" />
            <span><I18nText>En cola o reintento</I18nText><strong>{overview.notifications.pending + overview.notifications.retrying}</strong></span>
          </article>
          <article className={overview.notifications.failed > 0 ? "warning" : ""}>
            <TriangleAlert aria-hidden="true" />
            <span><I18nText>Fallos sin reintento</I18nText><strong>{overview.notifications.failed}</strong></span>
          </article>
          <article className={overview.notifications.stale > 0 || overview.reminders.stale > 0 ? "warning" : ""}>
            <Clock3 aria-hidden="true" />
            <span><I18nText>Procesos atascados</I18nText><strong>{overview.notifications.stale + overview.reminders.stale}</strong></span>
          </article>
        </LocalizedControl>

        <div className="operations-grid">
          <section className="operations-card operations-history">
            <div className="section-heading">
              <div>
                <span className="eyebrow"><I18nText>Últimas ejecuciones</I18nText></span>
                <h2><I18nText>Tareas automáticas</I18nText></h2>
              </div>
              <Activity aria-hidden="true" />
            </div>
            <OperationsRunControls organizationId={organization.id} />
            {overview.runs.length === 0 ? (
              <div className="operations-empty">
                <Clock3 aria-hidden="true" />
                <div><strong><I18nText>Esperando la primera ejecución</I18nText></strong><p><I18nText>El historial aparecerá tras el siguiente ciclo programado.</I18nText></p></div>
              </div>
            ) : (
              <ol className="operations-run-list">
                {overview.runs.map((run) => (
                  <li key={run.id}>
                    <span className={`run-state ${run.status}`} aria-hidden="true" />
                    <div>
                      <strong>{triggerLabel(run.trigger)}</strong>
                      <small>{formatDateTime(run.completedAt)} · {formatDuration(run.durationMs)}</small>
                      <div className="component-pills">
                        {run.components.map((component) => (
                          <span className={component.status} key={`${run.id}-${component.name}`}>
                            {componentLabel(component.name)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <aside className="operations-card operations-guidance">
            <div className="section-heading">
              <div><span className="eyebrow"><I18nText>Respuesta operativa</I18nText></span><h2><I18nText>Qué requiere atención</I18nText></h2></div>
              <ServerCog aria-hidden="true" />
            </div>
            <ul>
              <li><strong><I18nText>Inmediata</I18nText></strong><span><I18nText>Proceso automático fallido, cola bloqueada o entrega agotada.</I18nText></span></li>
              <li><strong><I18nText>Durante el día</I18nText></strong><span><I18nText>Correo sin configurar o mensajes esperando reintento.</I18nText></span></li>
              <li><strong><I18nText>Seguimiento</I18nText></strong><span><I18nText>Conserva el identificador de solicitud mostrado por soporte.</I18nText></span></li>
            </ul>
            <p><I18nText>
              El panel muestra señales operativas, no sustituye alertas externas ni
              demuestra por sí solo que una copia pueda restaurarse.
            </I18nText></p>
            <h3><I18nText>Datos reales: todavía bloqueados</I18nText></h3>
            <ul>
              <li>
                <strong><I18nText>Identidad de las cuentas</I18nText></strong>
                <span>
                  {overview.identity.stableAccounts}<I18nText> vinculadas a un identificador estable.
                  </I18nText>{overview.identity.legacyAccounts > 0
                    ? ` ${overview.identity.legacyAccounts} pendientes de vinculación verificada.`
                    : " Sin cuentas antiguas pendientes en este espacio."}
                </span>
              </li>
              <li><strong><I18nText>Segundo factor</I18nText></strong><span><I18nText>No verificado; iniciar sesión no acredita MFA.</I18nText></span></li>
              <li><strong><I18nText>Archivos</I18nText></strong><span><I18nText>Control estructural del piloto; antimalware externo pendiente.</I18nText></span></li>
              <li><strong><I18nText>Recuperación</I18nText></strong><span><I18nText>Ensayo local comprobado; copia automática de producción pendiente.</I18nText></span></li>
            </ul>
            <p><I18nText>
              Una operación estable no significa que el producto esté preparado
              para documentos reales. Siguen pendientes la verificación de MFA,
              la vinculación de las cuentas antiguas que aparezcan arriba,
              el antimalware externo y las copias
              periódicas independientes de producción.
            </I18nText></p>
          </aside>
        </div>
      </div>
    </WorkspaceShell>
  );
}

function statusCopy(status: "attention" | "healthy" | "waiting") {
  if (status === "healthy") return { title: "Operación estable", detail: "Sin incidencias detectadas" };
  if (status === "waiting") return { title: "Recogiendo señales", detail: "Pendiente del primer ciclo" };
  return { title: "Requiere revisión", detail: "Consulta las señales inferiores" };
}

function triggerLabel(trigger: string): string {
  return trigger === "daily" ? "Ciclo diario" : "Ciclo de notificaciones";
}

function componentLabel(name: string): string {
  return ({
    notifications: "Correo",
    reminders: "Avisos",
    "privacy-deletions": "Borrados",
    "pilot-lead-retention": "Solicitudes",
    "rate-limit-retention": "Abuso",
    "operations-retention": "Historial",
    "schedule-claims-retention": "Planificación",
  } as Record<string, string>)[name] ?? name;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Atlantic/Canary",
  }).format(new Date(value.replace(" ", "T") + "Z"));
}

function formatDuration(milliseconds: number): string {
  return milliseconds < 1000 ? `${milliseconds} ms` : `${(milliseconds / 1000).toFixed(1)} s`;
}
