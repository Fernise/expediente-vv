
import { I18nText, LocalizedControl } from "@/app/components/Language";
import Link from "next/link";
import {
  Bell,
  Building2,
  ChevronLeft,
  ChevronRight,
  FileText,
  History,
  Home,
  MessageSquare,
  Scale,
  Search,
  ShieldCheck,
  ShieldX,
  UsersRound,
} from "lucide-react";
import { PremiumSelect } from "@/app/components/PremiumSelect";
import { WorkspaceShell } from "@/app/components/WorkspaceShell";
import {
  listAuditEvents,
  type AuditCategory,
  type AuditEventView,
  type AuditFilters,
} from "@/db/audit";
import { listOrganizationsForActor } from "@/db/organizations";
import { activeOrganizationFrom } from "@/lib/active-organization";
import { requireActor } from "@/lib/auth";
import { can, type Role } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  actor?: string;
  category?: string;
  page?: string;
  period?: string;
  q?: string;
}>;

const categoryOptions: Array<{
  label: string;
  value: AuditCategory | "all";
}> = [
  { label: "Toda la actividad", value: "all" },
  { label: "Equipo y accesos", value: "access" },
  { label: "Viviendas", value: "properties" },
  { label: "Documentos", value: "documents" },
  { label: "Checklist y notas", value: "checklist" },
  { label: "Reglas y revisión", value: "rules" },
  { label: "Espacio de trabajo", value: "organization" },
];

export default async function AuditPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const actor = await requireActor("/app/audit");
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

  const role = organization.role as Role;
  if (!can(role, "audit.read")) {
    return (
      <WorkspaceShell
        active="audit"
        actor={actor}
        organization={organization}
        organizations={organizations}
      >
        <div className="workspace-content narrow-content">
          <section className="empty-state">
            <span><ShieldX aria-hidden="true" /></span>
            <div>
              <h1><I18nText>Auditoría restringida</I18nText></h1>
              <p><I18nText>
                Solo una persona administradora puede consultar el historial
                completo del espacio.
              </I18nText></p>
            </div>
            <Link className="button button-primary" href="/app"><I18nText>
              Volver al resumen
            </I18nText></Link>
          </section>
        </div>
      </WorkspaceShell>
    );
  }

  const params = await searchParams;
  const filters = auditFilters(params);
  const overview = await listAuditEvents(actor, organization.id, filters);
  const groups = groupEventsByDay(overview.events);
  const totalPages = Math.max(1, Math.ceil(overview.total / overview.pageSize));

  return (
    <WorkspaceShell
      active="audit"
      actor={actor}
      organization={organization}
      organizations={organizations}
    >
      <div className="workspace-content audit-content">
        <header className="page-heading audit-heading">
          <div>
            <span className="eyebrow"><I18nText>Trazabilidad operativa</I18nText></span>
            <h1><I18nText>Auditoría</I18nText></h1>
            <p><I18nText>
              Revisa la actividad de </I18nText>{organization.name}<I18nText> sin mostrar el
              contenido de documentos ni comentarios.
            </I18nText></p>
          </div>
          <div className="audit-integrity-label">
            <ShieldCheck aria-hidden="true" />
            <span>
              <strong><I18nText>Registro por organización</I18nText></strong>
              <small><I18nText>Ordenado de más reciente a más antiguo</I18nText></small>
            </span>
          </div>
        </header>

        <LocalizedControl as="section" aria-label="Actividad de los últimos 30 días" className="audit-summary">
          <article>
            <span><History aria-hidden="true" /><I18nText> Actividad</I18nText></span>
            <strong>{overview.stats.total}</strong>
            <small><I18nText>Eventos en los últimos 30 días</I18nText></small>
          </article>
          <article>
            <span><UsersRound aria-hidden="true" /><I18nText> Accesos</I18nText></span>
            <strong>{overview.stats.access}</strong>
            <small><I18nText>Invitaciones, roles y revocaciones</I18nText></small>
          </article>
          <article>
            <span><FileText aria-hidden="true" /><I18nText> Documentos</I18nText></span>
            <strong>{overview.stats.documents}</strong>
            <small><I18nText>Subidas, versiones y descargas</I18nText></small>
          </article>
          <article>
            <span><Scale aria-hidden="true" /><I18nText> Reglas</I18nText></span>
            <strong>{overview.stats.rules}</strong>
            <small><I18nText>Edición, revisión y evaluaciones</I18nText></small>
          </article>
        </LocalizedControl>

        <form className="audit-filters" method="get">
          <label className="audit-search">
            <Search aria-hidden="true" />
            <span className="sr-only"><I18nText>Buscar en auditoría</I18nText></span>
            <LocalizedControl as="input"
              defaultValue={params.q ?? ""}
              maxLength={80}
              name="q"
              placeholder="Buscar persona, vivienda o acción"
            />
          </label>
          <div className="audit-filter-field">
            <span><I18nText>Actividad</I18nText></span>
            <PremiumSelect
              ariaLabel="Filtrar por tipo de actividad"
              defaultValue={filters.category}
              key={`category-${filters.category}`}
              name="category"
              options={categoryOptions}
            />
          </div>
          <div className="audit-filter-field">
            <span><I18nText>Persona</I18nText></span>
            <PremiumSelect
              ariaLabel="Filtrar por persona"
              defaultValue={filters.actorId ?? ""}
              key={`actor-${filters.actorId ?? "all"}`}
              name="actor"
              options={[
                { label: "Todas las personas", value: "" },
                ...overview.actors.map((option) => ({
                  label: option.name,
                  translate: false,
                  value: option.id,
                })),
              ]}
            />
          </div>
          <div className="audit-filter-field">
            <span><I18nText>Periodo</I18nText></span>
            <PremiumSelect
              ariaLabel="Filtrar por periodo"
              defaultValue={String(filters.period)}
              key={`period-${filters.period}`}
              name="period"
              options={[
                { label: "Últimos 7 días", value: "7" },
                { label: "Últimos 30 días", value: "30" },
                { label: "Últimos 90 días", value: "90" },
                { label: "Todo el historial", value: "all" },
              ]}
            />
          </div>
          <button className="button button-primary" type="submit"><I18nText>
            Filtrar
          </I18nText></button>
          {hasFilters(params) ? (
            <Link className="button button-secondary" href="/app/audit"><I18nText>
              Limpiar
            </I18nText></Link>
          ) : null}
        </form>

        <section className="audit-log-card">
          <div className="section-heading audit-log-heading">
            <div>
              <h2><I18nText>Historial del espacio</I18nText></h2>
              <p>
                {overview.total}<I18nText> evento</I18nText><I18nText>{overview.total === 1 ? "" : "s"}</I18nText><I18nText> con
                los filtros actuales.
              </I18nText></p>
            </div>
            <span className="audit-page-count"><I18nText>
              Página </I18nText>{overview.page}<I18nText> de </I18nText>{totalPages}
            </span>
          </div>

          {overview.events.length === 0 ? (
            <div className="empty-state compact-empty audit-empty">
              <span><History aria-hidden="true" /></span>
              <div>
                <h3><I18nText>No hay actividad con estos filtros</I18nText></h3>
                <p><I18nText>Prueba otro periodo, persona o tipo de acción.</I18nText></p>
              </div>
              <Link className="button button-secondary" href="/app/audit"><I18nText>
                Ver toda la actividad
              </I18nText></Link>
            </div>
          ) : (
            <div className="audit-day-groups">
              {groups.map((group) => (
                <section className="audit-day" key={group.day}>
                  <h3>{formatDay(group.day)}</h3>
                  <ol className="audit-event-list">
                    {group.events.map((event) => (
                      <AuditEvent event={event} key={event.id} />
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          )}

          {totalPages > 1 ? (
            <LocalizedControl as="nav" aria-label="Páginas de auditoría" className="audit-pagination">
              {overview.page > 1 ? (
                <Link
                  className="button button-secondary"
                  href={auditHref(params, overview.page - 1)}
                >
                  <ChevronLeft aria-hidden="true" /><I18nText> Anterior
                </I18nText></Link>
              ) : (
                <span />
              )}
              <span>
                {Math.min(
                  (overview.page - 1) * overview.pageSize + 1,
                  overview.total,
                )}
                –
                {Math.min(
                  overview.page * overview.pageSize,
                  overview.total,
                )}{" "}<I18nText>
                de </I18nText>{overview.total}
              </span>
              {overview.page < totalPages ? (
                <Link
                  className="button button-secondary"
                  href={auditHref(params, overview.page + 1)}
                ><I18nText>
                  Siguiente </I18nText><ChevronRight aria-hidden="true" />
                </Link>
              ) : (
                <span />
              )}
            </LocalizedControl>
          ) : null}
        </section>

        <p className="audit-privacy-note"><I18nText>
          El historial conserva metadatos operativos mínimos. No replica el
          contenido de archivos, comentarios, direcciones ni datos catastrales.
        </I18nText></p>
      </div>
    </WorkspaceShell>
  );
}

function AuditEvent({ event }: { event: AuditEventView }) {
  return (
    <li className={`audit-event ${event.category}`}>
      <span className="audit-event-icon">{eventIcon(event.category)}</span>
      <div className="audit-event-copy">
        <div>
          <strong>{event.title}</strong>
          <time dateTime={event.occurredAt}>
            {formatTime(event.occurredAt)}
          </time>
        </div>
        <p>{event.description}</p>
        <span className="audit-event-actor">
          {event.actorName}
          {event.actorType !== "user"
            ? ` · ${event.actorType === "system" ? "Sistema" : "Soporte"}`
            : ""}
        </span>
      </div>
      <div className="audit-event-context">
        <code>{event.action}</code>
        {event.entityHref ? (
          <Link href={event.entityHref}>
            {event.entityLabel ?? contextLabel(event.category)}
          </Link>
        ) : event.entityLabel ? (
          <span>{event.entityLabel}</span>
        ) : null}
      </div>
    </li>
  );
}

function eventIcon(category: AuditCategory) {
  if (category === "access") return <UsersRound aria-hidden="true" />;
  if (category === "documents") return <FileText aria-hidden="true" />;
  if (category === "rules") return <Scale aria-hidden="true" />;
  if (category === "properties") return <Building2 aria-hidden="true" />;
  if (category === "checklist") return <MessageSquare aria-hidden="true" />;
  if (category === "organization") return <Home aria-hidden="true" />;
  return <Bell aria-hidden="true" />;
}

function contextLabel(category: AuditCategory) {
  if (category === "access") return "Abrir equipo";
  if (category === "rules") return "Abrir reglas";
  return "Abrir detalle";
}

function auditFilters(params: Awaited<SearchParams>): AuditFilters {
  const category = categoryOptions.some(
    (option) => option.value === params.category,
  )
    ? (params.category as AuditCategory | "all")
    : "all";
  const period =
    params.period === "7" || params.period === "90"
      ? (Number(params.period) as 7 | 90)
      : params.period === "all"
        ? "all"
        : 30;
  const page = Number.parseInt(params.page ?? "1", 10);
  return {
    actorId: params.actor,
    category,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    period,
    query: params.q,
  };
}

function groupEventsByDay(events: AuditEventView[]) {
  const groups = new Map<string, AuditEventView[]>();
  for (const event of events) {
    const day = event.occurredAt.slice(0, 10);
    groups.set(day, [...(groups.get(day) ?? []), event]);
  }
  return [...groups.entries()].map(([day, dayEvents]) => ({
    day,
    events: dayEvents,
  }));
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    timeZone: "Atlantic/Canary",
    weekday: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Atlantic/Canary",
  }).format(new Date(`${value.replace(" ", "T")}Z`));
}

function auditHref(params: Awaited<SearchParams>, page: number) {
  const next = new URLSearchParams();
  if (params.q) next.set("q", params.q);
  if (params.category) next.set("category", params.category);
  if (params.actor) next.set("actor", params.actor);
  if (params.period) next.set("period", params.period);
  next.set("page", String(page));
  return `/app/audit?${next.toString()}`;
}

function hasFilters(params: Awaited<SearchParams>) {
  return Boolean(
    params.q ||
      params.actor ||
      (params.category && params.category !== "all") ||
      (params.period && params.period !== "30"),
  );
}
