
import { I18nText, LocalizedControl } from "@/app/components/Language";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCircle2,
  Mail,
} from "lucide-react";
import { WorkspaceShell } from "@/app/components/WorkspaceShell";
import { listOrganizationsForActor } from "@/db/organizations";
import {
  listOperationalAlerts,
  type OperationalAlert,
} from "@/db/properties";
import {
  synchronizeOperationalReminders,
  type ReminderSyncSummary,
} from "@/db/reminders";
import { activeOrganizationFrom } from "@/lib/active-organization";
import { requireActor } from "@/lib/auth";
import { gmailProviderStatus } from "@/lib/email/gmail";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ view?: string }>;
type ReminderSyncState =
  | ReminderSyncSummary
  | {
      activeCount: 0;
      lastRunAt: null;
      status: "unavailable";
    };

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const actor = await requireActor("/app/alerts");
  const organizations = await listOrganizationsForActor(actor);
  const organization = await activeOrganizationFrom(organizations);

  if (!organization) {
    return (
      <main className="app-gate">
        <section className="gate-card">
          <h1><I18nText>Primero crea una organización</I18nText></h1>
          <Link className="button button-primary" href="/app"><I18nText>
            Volver al inicio
          </I18nText></Link>
        </section>
      </main>
    );
  }

  const [{ view }, alerts, reminderSync] = await Promise.all([
    searchParams,
    listOperationalAlerts(actor, organization.id),
    synchronizeOperationalReminders(actor, organization.id).catch(
      (): ReminderSyncState => ({
        activeCount: 0,
        lastRunAt: null,
        status: "unavailable",
      }),
    ),
  ]);
  const activeView = ["overdue", "soon", "attention"].includes(view ?? "")
    ? (view as OperationalAlert["severity"])
    : "all";
  const visibleAlerts =
    activeView === "all"
      ? alerts
      : alerts.filter((alert) => alert.severity === activeView);
  const counts = {
    attention: alerts.filter((alert) => alert.severity === "attention").length,
    overdue: alerts.filter((alert) => alert.severity === "overdue").length,
    soon: alerts.filter((alert) => alert.severity === "soon").length,
  };
  const emailProvider = gmailProviderStatus();

  return (
    <WorkspaceShell
      active="alerts"
      actor={actor}
      organization={organization}
      organizations={organizations}
    >
      <div className="workspace-content alerts-content">
        <header className="page-heading alerts-heading">
          <div>
            <span className="eyebrow"><I18nText>Control operativo</I18nText></span>
            <h1><I18nText>Avisos</I18nText></h1>
            <p><I18nText>
              Fechas, tareas y revisiones que requieren atención en</I18nText>{" "}
              {organization.name}.
            </p>
          </div>
          <div className="alerts-channel-status">
            <span><Bell aria-hidden="true" /><I18nText> Recordatorios internos persistentes</I18nText></span>
            <small>
              <CalendarClock aria-hidden="true" />
              {reminderSyncLabel(reminderSync, alerts.length)}
            </small>
            <small>
              <Mail aria-hidden="true" />
              {emailProvider.configured
                ? `Gmail activo · ${emailProvider.sender}`
                : `Gmail preparado · falta autorizar ${emailProvider.sender}`}
            </small>
          </div>
        </header>

        <LocalizedControl as="section" aria-label="Resumen de avisos" className="alert-summary-grid">
          <Link
            aria-current={activeView === "overdue" ? "page" : undefined}
            className="alert-summary-card overdue"
            href="/app/alerts?view=overdue"
          >
            <AlertTriangle aria-hidden="true" />
            <span><I18nText>Vencidos</I18nText></span>
            <strong>{counts.overdue}</strong>
          </Link>
          <Link
            aria-current={activeView === "soon" ? "page" : undefined}
            className="alert-summary-card soon"
            href="/app/alerts?view=soon"
          >
            <CalendarClock aria-hidden="true" />
            <span><I18nText>Próximos 30 días</I18nText></span>
            <strong>{counts.soon}</strong>
          </Link>
          <Link
            aria-current={activeView === "attention" ? "page" : undefined}
            className="alert-summary-card attention"
            href="/app/alerts?view=attention"
          >
            <Bell aria-hidden="true" />
            <span><I18nText>Revisión</I18nText></span>
            <strong>{counts.attention}</strong>
          </Link>
          <Link
            aria-current={activeView === "all" ? "page" : undefined}
            className="alert-summary-card all"
            href="/app/alerts"
          >
            <CheckCircle2 aria-hidden="true" />
            <span><I18nText>Total operativo</I18nText></span>
            <strong>{alerts.length}</strong>
          </Link>
        </LocalizedControl>

        <section className="alerts-list-card">
          <div className="section-heading">
            <div>
              <h2>{alertViewTitle(activeView)}</h2>
              <p><I18nText>Ordenados por urgencia y fecha objetivo.</I18nText></p>
            </div>
          </div>

          {visibleAlerts.length === 0 ? (
            <div className="empty-state compact-empty alerts-empty">
              <span><CheckCircle2 aria-hidden="true" /></span>
              <div>
                <h3><I18nText>No hay avisos en esta categoría</I18nText></h3>
                <p><I18nText>Las nuevas fechas y revisiones aparecerán aquí automáticamente.</I18nText></p>
              </div>
            </div>
          ) : (
            <div className="operational-alert-list">
              {visibleAlerts.map((alert) => (
                <article className={`operational-alert ${alert.severity}`} key={alert.id}>
                  <span className="operational-alert-icon">
                    {alert.severity === "overdue" ? (
                      <AlertTriangle aria-hidden="true" />
                    ) : alert.severity === "soon" ? (
                      <CalendarClock aria-hidden="true" />
                    ) : (
                      <Bell aria-hidden="true" />
                    )}
                  </span>
                  <div className="operational-alert-copy">
                    <span>{alert.propertyAlias}</span>
                    <h3>{alert.title}</h3>
                    <p>{alert.description}</p>
                  </div>
                  <div className="operational-alert-meta">
                    <span>{alert.dueAt ? dueLabel(alert) : "Sin fecha límite"}</span>
                    <small><I18nText>Responsable: </I18nText>{alert.responsible}</small>
                  </div>
                  <Link href={`/app/properties/${alert.propertyId}`}><I18nText>
                    Abrir expediente
                  </I18nText></Link>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </WorkspaceShell>
  );
}

function dueLabel(alert: OperationalAlert): string {
  if (!alert.dueAt) return "Sin fecha límite";
  const date = new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${alert.dueAt.slice(0, 10)}T12:00:00Z`));
  return alert.severity === "overdue" ? `Venció: ${date}` : `Objetivo: ${date}`;
}

function alertViewTitle(view: OperationalAlert["severity"] | "all") {
  return {
    all: "Todos los avisos",
    attention: "Revisiones necesarias",
    overdue: "Avisos vencidos",
    soon: "Próximos 30 días",
  }[view];
}

function reminderSyncLabel(
  sync: ReminderSyncState,
  visibleCount: number,
) {
  if (sync.status === "unavailable") {
    return "Los avisos siguen disponibles · sincronización pendiente";
  }
  if (sync.status === "read_only") {
    return `${visibleCount} aviso${visibleCount === 1 ? "" : "s"} según tus accesos`;
  }
  return `Ejecución diaria programada · ${sync.activeCount} activo${sync.activeCount === 1 ? "" : "s"}`;
}
