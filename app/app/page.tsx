
import { I18nText, LocalizedControl } from "@/app/components/Language";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Check,
  Circle,
  Plus,
} from "lucide-react";
import { BrandMark } from "@/app/components/BrandMark";
import { CreateOrganizationForm } from "@/app/components/CreateOrganizationForm";
import { PendingLink } from "@/app/components/PendingLink";
import { WorkspaceShell } from "@/app/components/WorkspaceShell";
import {
  listOrganizationsForActor,
  type OrganizationSummary,
} from "@/db/organizations";
import {
  getDashboardMetrics,
  listProperties,
  propertyLocationLabel,
} from "@/db/properties";
import { getRuleCatalog } from "@/db/rules";
import { requireActor } from "@/lib/auth";
import { activeOrganizationFrom } from "@/lib/active-organization";
import { can, type Role } from "@/lib/permissions";
import {
  dossierStatusLabels,
  statusTone,
} from "@/lib/property-status";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const actor = await requireActor("/app");
  let organizations: OrganizationSummary[] = [];
  let databaseUnavailable = false;

  try {
    organizations = await listOrganizationsForActor(actor);
  } catch {
    databaseUnavailable = true;
  }

  if (databaseUnavailable) {
    return (
      <main className="app-gate">
        <div className="gate-brand">
          <BrandMark />
          <span><I18nText>Expediente VV</I18nText></span>
        </div>
        <section className="gate-card">
          <span className="eyebrow"><I18nText>Preparando el espacio</I18nText></span>
          <h1><I18nText>La base de datos aún no está disponible.</I18nText></h1>
          <p><I18nText>
            Vuelve a intentarlo en unos instantes cuando el entorno haya
            terminado de preparar el almacenamiento.
          </I18nText></p>
          <Link className="button button-primary" href="/app"><I18nText>
            Reintentar
          </I18nText></Link>
        </section>
      </main>
    );
  }

  if (organizations.length === 0) {
    return (
      <main className="app-gate">
        <div className="gate-brand">
          <BrandMark />
          <span><I18nText>Expediente VV</I18nText></span>
        </div>
        <section className="gate-card onboarding-card">
          <span className="eyebrow"><I18nText>Primer paso · 1 de 3</I18nText></span>
          <h1><I18nText>Crea tu espacio profesional</I18nText></h1>
          <p><I18nText>
            Aquí vivirán tus viviendas, equipo, reglas y trazabilidad. Los datos
            de cada organización permanecerán aislados.
          </I18nText></p>
          <div className="trust-row">
            <span><Check aria-hidden="true" /><I18nText> Aislamiento por organización</I18nText></span>
            <span><Check aria-hidden="true" /><I18nText> Auditoría desde el primer día</I18nText></span>
          </div>
          <CreateOrganizationForm />
          <p className="signed-in-note"><I18nText>
            Sesión iniciada como </I18nText><strong>{actor.email}</strong>
          </p>
        </section>
      </main>
    );
  }

  const organization = await activeOrganizationFrom(organizations);
  if (!organization) return null;
  const role = organization.role as Role;
  const [metrics, properties, ruleCatalog] = await Promise.all([
    getDashboardMetrics(actor, organization.id),
    listProperties(actor, organization.id),
    can(role, "rules.read")
      ? getRuleCatalog(actor, organization.id)
      : Promise.resolve(null),
  ]);
  const firstName = actor.displayName.split(" ")[0] || "equipo";
  const attentionCards = [
    {
      accent: "coral",
      count: metrics.incomplete,
      detail: `${metrics.total} ${metrics.total === 1 ? "vivienda activa" : "viviendas activas"}`,
      label: "Expedientes incompletos",
    },
    {
      accent: "amber",
      count: metrics.pendingDocuments,
      detail: "con documentación pendiente",
      label: "Pendientes de documentación",
    },
    {
      accent: "amber",
      count: metrics.expiringSoon,
      detail: "en los próximos 30 días",
      label: "Vencen pronto",
    },
    {
      accent: "violet",
      count: metrics.requiresReview,
      detail: "requieren criterio profesional",
      label: "Revisiones necesarias",
    },
  ];

  return (
    <WorkspaceShell
      active="dashboard"
      actor={actor}
      organization={organization}
      organizations={organizations}
    >
      <div className="workspace-content dashboard-workspace">
        <section className="dashboard-heading">
          <div>
            <span className="eyebrow"><I18nText>Tu mesa de trabajo</I18nText></span>
            <h1><I18nText>Buenos días, </I18nText>{firstName}.</h1>
            <p><I18nText>Estas son las viviendas que necesitan atención hoy.</I18nText></p>
            <span className="demo-pill"><I18nText>Piloto · reglas no validadas</I18nText></span>
          </div>
          <Link className="button button-primary" href="/app/properties/new">
            <Plus aria-hidden="true" /><I18nText> Añadir vivienda
          </I18nText></Link>
        </section>

        <LocalizedControl as="section" aria-label="Indicadores de atención" className="metric-grid">
          {attentionCards.map((card) => (
            <article className={`metric-card ${card.accent}`} key={card.label}>
              <div>
                <span className="metric-label">{card.label}</span>
                <strong>{card.count}</strong>
              </div>
              <span className="metric-detail">{card.detail}</span>
            </article>
          ))}
        </LocalizedControl>

        <div className="dashboard-desk">
        <section className="attention-section">
          <div className="section-heading">
            <div>
              <h2><I18nText>Atención prioritaria</I18nText></h2>
              <p><I18nText>Expedientes reales de tu organización, ordenados por estado.</I18nText></p>
            </div>
            <Link
              className="button button-secondary filter-button"
              href="/app/properties"
            ><I18nText>
              Ver todas
            </I18nText></Link>
          </div>

          {properties.length === 0 ? (
            <div className="empty-state compact-empty">
              <span><Building2 aria-hidden="true" /></span>
              <div>
                <h3><I18nText>Aún no hay viviendas</I18nText></h3>
                <p><I18nText>
                  Crea la primera para generar su expediente orientativo y
                  asignar la siguiente acción.
                </I18nText></p>
              </div>
              <Link className="button button-primary" href="/app/properties/new"><I18nText>
                Crear vivienda
              </I18nText></Link>
            </div>
          ) : (
            <div className="property-list">
              <div className="priority-list-heading" aria-hidden="true"><span><I18nText>Vivienda</I18nText></span><span><I18nText>Estado y responsable</I18nText></span></div>
              {properties.slice(0, 4).map((property) => (
                <article className="property-row" key={property.id}>
                  <div className="property-identity">
                    <span className="property-monogram" aria-hidden="true">
                      {property.alias.slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <h3>{property.alias}</h3>
                      <p>
                        {propertyLocationLabel(
                          property.islandCode,
                          property.municipality,
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="property-status">
                    <span
                      className={`status-badge ${statusTone(property.dossierStatus)}`}
                    >
                      <Circle aria-hidden="true" fill="currentColor" />{" "}
                      <I18nText>{dossierStatusLabels[property.dossierStatus]}</I18nText>
                    </span>
                    <small>{property.pendingItems}<I18nText> elementos pendientes</I18nText></small>
                    <span className="priority-owner"><I18nText>Responsable · </I18nText>{property.managerName}</span>
                  </div>
                  <PendingLink
                    className="row-action"
                    href={`/app/properties/${property.id}`}
                    prefetch
                  ><I18nText>
                    Abrir expediente </I18nText><ArrowRight aria-hidden="true" />
                  </PendingLink>
                </article>
              ))}
            </div>
          )}
        </section>

        <LocalizedControl as="aside" className="dashboard-lower-grid" aria-label="Contexto del espacio">
          <article className="lower-card">
            <div className="section-heading compact">
              <div>
                <h2><I18nText>Flujo operativo actual</I18nText></h2>
                <p><I18nText>Del expediente manual a una evaluación trazable.</I18nText></p>
              </div>
            </div>
            <ol className="phase-steps">
              <li><span>1</span><I18nText> Alta de vivienda y propietario</I18nText></li>
              <li><span>2</span><I18nText> Hechos declarados y checklist manual</I18nText></li>
              <li><span>3</span><I18nText> Evidencia privada con control técnico</I18nText></li>
              <li><span>4</span><I18nText> Evaluación de reglas en laboratorio</I18nText></li>
            </ol>
          </article>

          <article className="lower-card rule-card">
            <span className="draft-stamp"><I18nText>BORRADOR NO VALIDADO</I18nText></span>
            <div>
              <span className="eyebrow"><I18nText>Motor trazable</I18nText></span>
              <h2><I18nText>Reglas deterministas en laboratorio</I18nText></h2>
              <p><I18nText>
                Los resultados conservan la versión, los hechos de entrada y el
                motivo. No contienen requisitos legales definitivos.
              </I18nText></p>
              {can(role, "rules.read") ? (
                <Link className="rule-card-link" href="/app/rules"><I18nText>
                  Ver reglas y fuentes </I18nText><ArrowRight aria-hidden="true" />
                </Link>
              ) : null}
            </div>
            <div className="rule-version">
              <span><I18nText>Versión demo</I18nText></span>
              <strong>{ruleCatalog?.ruleSet.label ?? "No disponible"}</strong>
            </div>
          </article>
        </LocalizedControl>
        </div>
      </div>
    </WorkspaceShell>
  );
}
