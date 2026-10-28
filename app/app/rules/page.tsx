
import { I18nText, LocalizedControl } from "@/app/components/Language";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ShieldX,
} from "lucide-react";
import { RuleDraftEditor } from "@/app/components/RuleDraftEditor";
import { RuleGovernancePanel } from "@/app/components/RuleGovernancePanel";
import { WorkspaceShell } from "@/app/components/WorkspaceShell";
import { listOrganizationsForActor } from "@/db/organizations";
import {
  getRuleCatalog,
  type RuleWorkflowStatus,
} from "@/db/rules";
import { requireActor } from "@/lib/auth";
import { activeOrganizationFrom } from "@/lib/active-organization";
import { can, type Role } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const actor = await requireActor("/app/rules");
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
  if (!can(role, "rules.read")) {
    return (
      <WorkspaceShell
        active="rules"
        actor={actor}
        organization={organization}
        organizations={organizations}
      >
        <div className="workspace-content narrow-content">
          <section className="empty-state">
            <span><ShieldX aria-hidden="true" /></span>
            <div>
              <h1><I18nText>Reglas restringidas</I18nText></h1>
              <p><I18nText>
                Tu rol puede trabajar con el expediente asignado, pero no
                consultar el catálogo interno de reglas.
              </I18nText></p>
            </div>
            <Link className="button button-primary" href="/app/properties"><I18nText>
              Volver a viviendas
            </I18nText></Link>
          </section>
        </div>
      </WorkspaceShell>
    );
  }

  const catalog = await getRuleCatalog(actor, organization.id);
  const canDraft = can(role, "rules.draft");
  const canReview = can(role, "rules.review");
  const canApprove = can(role, "rules.approve");
  const workflowCopy = ruleWorkflowCopy(catalog.ruleSet.validationStatus);
  const editorLocked =
    catalog.ruleSet.validationStatus === "in_review" ||
    catalog.ruleSet.validationStatus === "reviewed";

  return (
    <WorkspaceShell
      active="rules"
      actor={actor}
      organization={organization}
      organizations={organizations}
    >
      <div className="workspace-content">
        <header className="page-heading rules-heading">
          <div>
            <span className="eyebrow"><I18nText>Fase 3 · reglas y trazabilidad</I18nText></span>
            <h1><I18nText>Laboratorio de reglas</I18nText></h1>
            <p><I18nText>
              Un conjunto determinista y auditable para validar el motor antes
              de incorporar contenido profesional.
            </I18nText></p>
          </div>
          <Link className="button button-primary" href="/app/properties"><I18nText>
            Evaluar una vivienda </I18nText><ArrowRight aria-hidden="true" />
          </Link>
        </header>

        <div
          className={`rules-warning ${catalog.ruleSet.validationStatus}`}
        >
          <AlertTriangle aria-hidden="true" />
          <div>
            <strong>{workflowCopy.banner}</strong>
            <p>{workflowCopy.explanation}</p>
          </div>
        </div>

        <section className="rules-overview">
          <article>
            <span><I18nText>Conjunto activo en laboratorio</I18nText></span>
            <strong>{catalog.ruleSet.label}</strong>
            <small><I18nText>Versión </I18nText>{catalog.ruleSet.versionNumber}<I18nText> · inmutable</I18nText></small>
          </article>
          <article>
            <span><I18nText>Reglas enlazadas</I18nText></span>
            <strong>{catalog.rules.length}</strong>
            <small><I18nText>Todas con fuente y condición tipada</I18nText></small>
          </article>
          <article>
            <span><I18nText>Estado editorial</I18nText></span>
            <strong>{workflowCopy.label}</strong>
            <small><I18nText>Publicación bloqueada</I18nText></small>
          </article>
          <article>
            <span><I18nText>Conflictos estructurales</I18nText></span>
            <strong>{catalog.conflicts.length}</strong>
            <small>
              <I18nText>{catalog.conflicts.length
                ? "Necesitan resolución"
                : "Sin contradicciones detectadas"}</I18nText>
            </small>
          </article>
        </section>

        <RuleGovernancePanel
          canApprove={canApprove}
          canDraft={canDraft}
          canReview={canReview}
          conflicts={catalog.conflicts.length}
          organizationId={organization.id}
          reviewHistory={catalog.reviewHistory}
          ruleSetVersionId={catalog.ruleSet.ruleSetVersionId}
          status={catalog.ruleSet.validationStatus}
        />

        <div className="rules-layout">
          <section className="dossier-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow"><I18nText>Versión </I18nText>{catalog.ruleSet.versionNumber}</span>
                <h2><I18nText>Reglas incluidas</I18nText></h2>
                <p><I18nText>
                  Cada resultado conserva el hecho leído, la condición y el
                  motivo.
                </I18nText></p>
              </div>
              <LocalizedControl as="span"
                className="version-chip"
                title={catalog.ruleSet.contentHash}
              >
                {catalog.ruleSet.contentHash.slice(0, 12)}
              </LocalizedControl>
            </div>
            <RuleDraftEditor
              canDraft={canDraft}
              key={catalog.ruleSet.ruleSetVersionId}
              lockedReason={
                editorLocked
                  ? "La versión está bloqueada mientras avanza por el circuito editorial."
                  : undefined
              }
              organizationId={organization.id}
              rules={catalog.rules}
            />
            <div className="rule-definition-list">
              {catalog.rules.map((rule, index) => (
                <article key={rule.ruleVersionId}>
                  <span className="rule-number">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <span className="rule-key">{rule.ruleStableKey}</span>
                    <h3>{rule.displayTitle}</h3>
                    <p>{rule.displayExplanation}</p>
                    <div className="condition-preview">
                      <span><I18nText>SI</I18nText></span>
                      <code>{rule.condition.factKey}</code>
                      <span><I18nText>ES</I18nText></span>
                      <strong><I18nText>{rule.condition.value === false ? "No" : "Sí"}</I18nText></strong>
                      <span><I18nText>→ sugerir tarea</I18nText></span>
                    </div>
                  </div>
                  <div className="rule-meta">
                    <span><I18nText>v</I18nText>{rule.versionNumber}</span>
                    <span><I18nText>Inmutable</I18nText></span>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <aside className="rules-sidebar">
            <section className="dossier-card">
              <div className="section-heading">
                <h2><I18nText>Fuente vinculada</I18nText></h2>
              </div>
              <dl className="source-data-list">
                <div><dt><I18nText>Emisor</I18nText></dt><dd>{catalog.source.issuer}</dd></div>
                <div><dt><I18nText>Título</I18nText></dt><dd>{catalog.source.title}</dd></div>
                <div><dt><I18nText>Ámbito</I18nText></dt><dd>{catalog.source.territoryScope}</dd></div>
                <div><dt><I18nText>Consultada</I18nText></dt><dd>{formatDate(catalog.source.consultedAt)}</dd></div>
                <div><dt><I18nText>Estado</I18nText></dt><dd><I18nText>Borrador interno</I18nText></dd></div>
              </dl>
            </section>
            <section className="dossier-card editor-status-card">
              <span>
                {catalog.conflicts.length ? (
                  <AlertTriangle aria-hidden="true" />
                ) : (
                  <CheckCircle2 aria-hidden="true" />
                )}
              </span>
              <h2><I18nText>Control de conflictos</I18nText></h2>
              {catalog.conflicts.length ? (
                <>
                  <p><I18nText>
                    Hay reglas con la misma condición y resultados opuestos.
                    Deben resolverse antes de cualquier revisión.
                  </I18nText></p>
                  <ul className="conflict-list">
                    {catalog.conflicts.map((conflict) => (
                      <li key={`${conflict.requirementId}-${conflict.conditionLabel}`}>
                        {conflict.conditionLabel}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p><I18nText>
                  No se han detectado condiciones idénticas con resultados
                  opuestos en esta versión.
                </I18nText></p>
              )}
              <small><I18nText>La publicación sigue bloqueada por gobierno editorial.</I18nText></small>
            </section>
          </aside>
        </div>

        <section className="rules-history-grid">
          <article className="dossier-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow"><I18nText>Comparación automática</I18nText></span>
                <h2><I18nText>Cambios frente a la versión anterior</I18nText></h2>
              </div>
            </div>
            {catalog.comparison ? (
              <>
                <p className="comparison-label">
                  {catalog.comparison.fromLabel} → {catalog.comparison.toLabel}
                </p>
                {catalog.comparison.changes.length ? (
                  <ul className="comparison-list">
                    {catalog.comparison.changes.map((change) => (
                      <li key={change.ruleStableKey}>
                        <strong>{change.title}</strong>
                        <span>{change.fields.join(", ")}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-comparison"><I18nText>
                    La composición y el contenido no cambian.
                  </I18nText></p>
                )}
              </>
            ) : (
              <p className="empty-comparison"><I18nText>
                Crea una nueva versión para activar la comparación.
              </I18nText></p>
            )}
          </article>

          <article className="dossier-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow"><I18nText>Histórico inmutable</I18nText></span>
                <h2><I18nText>Versiones del conjunto</I18nText></h2>
              </div>
            </div>
            <ol className="version-history">
              {catalog.history.map((version, index) => (
                <li key={version.id}>
                  <span className={index === 0 ? "current-version-dot" : ""} />
                  <div>
                    <strong>{version.label}</strong>
                    <small>
                      {index === 0
                        ? `${ruleWorkflowCopy(version.validationStatus).label} · versión activa`
                        : `${ruleWorkflowCopy(version.validationStatus).label} · conservada para auditoría`}
                    </small>
                  </div>
                  <code>{version.contentHash.slice(0, 10)}</code>
                </li>
              ))}
            </ol>
          </article>
        </section>
      </div>
    </WorkspaceShell>
  );
}

function ruleWorkflowCopy(status: RuleWorkflowStatus): {
  banner: string;
  explanation: string;
  label: string;
} {
  return {
    approved: {
      banner: "APROBADA · AÚN NO PUBLICADA",
      explanation:
        "La versión completó el circuito interno, pero sigue siendo contenido de demostración y no constituye criterio jurídico.",
      label: "Aprobada",
    },
    draft_unvalidated: {
      banner: "BORRADOR NO VALIDADO",
      explanation:
        "Estas reglas son ejemplos operativos internos. No describen requisitos legales ni pueden publicarse como criterio profesional.",
      label: "Borrador",
    },
    in_review: {
      banner: "EN REVISIÓN PROFESIONAL",
      explanation:
        "La composición está bloqueada mientras una persona distinta revisa sus condiciones, fuentes y explicaciones.",
      label: "En revisión",
    },
    published: {
      banner: "PUBLICADA",
      explanation:
        "La versión está publicada y conserva toda su trazabilidad editorial.",
      label: "Publicada",
    },
    retired: {
      banner: "VERSIÓN RETIRADA",
      explanation:
        "Esta composición se conserva únicamente para auditoría.",
      label: "Retirada",
    },
    reviewed: {
      banner: "REVISADA · PENDIENTE DE APROBACIÓN",
      explanation:
        "La revisión profesional está registrada y ahora necesita una aprobación independiente.",
      label: "Revisada",
    },
  }[status];
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}
