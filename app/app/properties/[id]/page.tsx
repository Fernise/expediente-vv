
import { I18nText, LocalizedControl } from "@/app/components/Language";
import { WorkspaceGuide } from "@/app/components/WorkspaceGuide";
import { ChecklistTaskEditor } from "@/app/components/ChecklistTaskEditor";
import { EvidenceMetadataEditor } from "@/app/components/EvidenceMetadataEditor";
import { DossierWorkflowGuide } from "@/app/components/DossierWorkflowGuide";
import { ReportDownloadControls } from "@/app/components/ReportDownloadControls";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Download,
  FileLock2,
  FilePlus2,
  Info,
  PencilLine,
  ShieldCheck,
} from "lucide-react";
import { PendingLink } from "@/app/components/PendingLink";
import { documentPage } from "@/lib/dossier-volume";
import {
  ArchivePropertyButton,
  ChecklistStatusControl,
  CommentForm,
  DocumentSecurityCheckButton,
  EvidenceLinkControl,
  ProfessionalReviewForm,
  ReplaceDocumentVersionForm,
  UploadDocumentForm,
} from "@/app/components/PropertyActions";
import { RuleEvaluationPanel } from "@/app/components/RuleEvaluationPanel";
import { WorkspaceShell } from "@/app/components/WorkspaceShell";
import { listOrganizationsForActor } from "@/db/organizations";
import {
  getPropertyDossier,
  listAssignablePropertyManagers,
  NotFoundError,
  propertyLocationLabel,
} from "@/db/properties";
import { getPropertyDossierRulesWorkspace } from "@/db/rules";
import { requireActor } from "@/lib/auth";
import { activeOrganizationFrom } from "@/lib/active-organization";
import { can, type Role } from "@/lib/permissions";
import {
  checklistStatusLabels,
  dossierStatusLabels,
  statusTone,
} from "@/lib/property-status";

export const dynamic = "force-dynamic";

export default async function PropertyDossierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; updated?: string; documentsPage?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const actor = await requireActor(`/app/properties/${id}`);
  const organizations = await listOrganizationsForActor(actor);
  const organization = await activeOrganizationFrom(organizations);
  if (!organization) notFound();

  const role = organization.role as Role;
  const canReadRules = can(role, "rules.read");
  let dossier;
  let rulesWorkspace = null;
  try {
    if (canReadRules) {
      const workspace = await getPropertyDossierRulesWorkspace(
        actor,
        organization.id,
        id,
      );
      dossier = workspace.dossier;
      rulesWorkspace = workspace.rulesWorkspace;
    } else {
      dossier = await getPropertyDossier(actor, organization.id, id);
    }
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const canManage = can(role, "property.update");
  const taskMembers = canManage ? await listAssignablePropertyManagers(actor,organization.id,id) : [];
  const visibleDocuments = documentPage(dossier.documents, query.documentsPage);
  const canArchive = can(role, "property.archive");
  const canUpload = can(role, "document.upload");
  const canReadDocuments = can(role, "document.read");
  const canManageDocumentSecurity = can(role, "document.security.manage");
  const canGenerateReport = can(role, "report.generate");
  const canReadInternalComments = can(role, "comment.internal.read");
  const canCloseReview = can(role, "review.close");
  const completedItems = dossier.checklistItems.filter(
    (item) => item.itemKind!=="operational" && item.workflowStatus === "reviewed",
  ).length;
  const requirements=dossier.checklistItems.filter(item=>item.itemKind!=="operational");
  const operations=dossier.checklistItems.filter(item=>item.itemKind==="operational");
  const completedOperations=operations.filter(item=>item.workflowStatus==="completed").length;

  return (
    <WorkspaceShell
      active="properties"
      actor={actor}
      organization={organization}
      organizations={organizations}
    >
      <div className="workspace-content dossier-content">
        {query.created === "1" || query.updated === "1" ? (
          <div className="creation-success" role="status">
            <CheckCircle2 aria-hidden="true" />
            <div>
              <strong>
                <I18nText>{query.created === "1" ? "Vivienda creada" : "Cambios guardados"}</I18nText>
              </strong>
              <span>
                <I18nText>{query.created === "1"
                  ? "El expediente ya está disponible. Puedes revisar el checklist y completar el siguiente paso."
                  : "La ficha, el responsable y el siguiente paso ya están actualizados."}</I18nText>
              </span>
            </div>
          </div>
        ) : null}
        <header className="dossier-heading">
          <div>
            <Link className="back-link" href="/app/properties">
              <ArrowLeft aria-hidden="true" /><I18nText> Viviendas
            </I18nText></Link>
            <div className="dossier-title-row">
              <span className="property-monogram large" aria-hidden="true">
                {dossier.alias.slice(0, 2).toUpperCase()}
              </span>
              <div>
                <span className="internal-reference">{dossier.internalReference}</span>
                <h1>{dossier.alias}</h1>
                <p>
                  {propertyLocationLabel(
                    dossier.islandCode,
                    dossier.municipality,
                  )}
                </p>
              </div>
            </div>
          </div>
          <div className="dossier-heading-actions">
            {canGenerateReport ? (
              <ReportDownloadControls propertyId={dossier.id} organizationId={organization.id}/>
            ) : null}
            <div className="dossier-state">
              <span className={`status-badge large-badge ${statusTone(dossier.dossierStatus)}`}>
                <Circle aria-hidden="true" fill="currentColor" />{" "}
                <I18nText>{dossierStatusLabels[dossier.dossierStatus]}</I18nText>
              </span>
              <small><I18nText>Estado orientativo del expediente</I18nText></small>
            </div>
          </div>
        </header>

        <div className="dossier-warning">
          <Info aria-hidden="true" /><I18nText>
          Este expediente organiza información y trabajo pendiente. No certifica
          la legalidad de la vivienda ni sustituye una revisión profesional.
        </I18nText></div>

        {dossier.dataProfile === "pilot_anonymized" ? (
          <div className="pilot-dossier-banner" role="status">
            <ShieldCheck aria-hidden="true" />
            <div>
              <strong><I18nText>Prueba anonimizada</I18nText></strong>
              <span><I18nText>
                No añadas datos reales. Usa los formatos ficticios indicados
                en los campos de prueba y revisa cada archivo antes de subirlo.
              </I18nText></span>
            </div>
          </div>
        ) : null}

        <WorkspaceGuide />
        <DossierWorkflowGuide status={dossier.dossierStatus} canReadLaboratory={Boolean(rulesWorkspace)} />
        <section className="dossier-overview-grid">
          <article className="dossier-summary-card">
            <span><I18nText>Revisión profesional</I18nText></span>
            <strong>{completedItems}/{requirements.length}</strong>
            <LocalizedControl as="div" className="progress-track" aria-label={`${completedItems} de ${requirements.length} revisados`}>
              <span
                style={{
                  width: `${requirements.length ? (completedItems / requirements.length) * 100 : 0}%`,
                }}
              />
            </LocalizedControl>
            <small><I18nText>Elementos cerrados por un profesional</I18nText></small>
            <small><I18nText>Tareas operativas completadas:</I18nText> {completedOperations}/{operations.length}</small>
          </article>
          <article className="dossier-summary-card">
            <span><I18nText>Siguiente acción</I18nText></span>
            <strong className="summary-text">
              {dossier.nextAction ?? "Sin acción definida"}
            </strong>
            <small>{dossier.nextActionDueAt ? <><I18nText>Objetivo:</I18nText> {formatDate(dossier.nextActionDueAt)}</> : <I18nText>Sin fecha objetivo</I18nText>}</small>
          </article>
          <article className="dossier-summary-card">
            <span><I18nText>Responsable</I18nText></span>
            <strong className="summary-text">{dossier.managerName}</strong>
            <small><I18nText>Gestión del siguiente paso</I18nText></small>
          </article>
          <article className="dossier-summary-card draft-summary">
            <span><I18nText>Versión aplicada</I18nText></span>
            <strong className="summary-text">{dossier.checklist.ruleVersionLabel}</strong>
            <small><I18nText>BORRADOR NO VALIDADO</I18nText></small>
          </article>
        </section>

        <div className="dossier-main-grid">
          <div className="dossier-primary">
            <section className="dossier-card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow"><I18nText>Lista de trabajo</I18nText></span>
                  <h2 id="checklist"><I18nText>Checklist del expediente</I18nText></h2>
                  <p><I18nText>
                    Generado el </I18nText>{formatDate(dossier.checklist.generatedAt)} ·{" "}
                    {dossier.checklist.ruleVersionLabel}
                  </p>
                </div>
                <span className="draft-stamp light-draft"><I18nText>BORRADOR NO VALIDADO</I18nText></span>
              </div>
              {canManage ? <ChecklistTaskEditor organizationId={organization.id} propertyId={dossier.id} members={taskMembers} existingTitles={dossier.checklistItems.map(item=>item.title)} /> : null}
              <p className="checklist-separation-note"><I18nText>Completar tareas no valida requisitos ni certifica legalidad.</I18nText></p>
              {([{kind:"operational",title:"Tareas operativas",description:"Gestión interna del equipo."},{kind:"professional_requirement",title:"Requisitos para revisión profesional",description:"Cierre con evidencia y decisión profesional. No son requisitos jurídicos oficiales."}] as const).map(group=><section className="checklist-kind-group" key={group.kind} aria-labelledby={`group-${group.kind}`}>
              <h3 id={`group-${group.kind}`}><I18nText>{group.title}</I18nText></h3><p><I18nText>{group.description}</I18nText></p>
              {!dossier.checklistItems.some(item=>(item.itemKind??"professional_requirement")===group.kind)?<p><I18nText>Sin elementos en este grupo.</I18nText></p>:null}
              <div className="checklist-list">
                {dossier.checklistItems.filter(item=>(item.itemKind??"professional_requirement")===group.kind).map((item) => {
                  const itemReviews = dossier.reviews.filter(
                    (review) => review.checklistItemId === item.id,
                  );
                  const activeReview = itemReviews.find(
                    (review) => !review.invalidatedAt,
                  );
                  const itemEvidence = dossier.evidenceLinks
                    .filter((link) => link.checklistItemId === item.id)
                    .map((link) => ({
                      link,
                      document: dossier.documents.find((document) => document.id === link.documentId),
                    }))
                    .filter((entry) => Boolean(entry.document));
                  const evidenceOptions = itemEvidence
                    .filter((entry) => entry.link.validity === "current")
                    .map((entry) => ({
                      id: entry.link.documentId,
                      label: `${entry.document!.documentType} · ${entry.document!.originalFilename}`,
                    }));
                  return (
                  <article className="checklist-item" id={`task-${item.id}`} data-checklist-item-id={item.id} key={item.id}>
                    <span
                      className={`checklist-state-dot ${item.workflowStatus}`}
                      aria-hidden="true"
                    />
                    <div className="checklist-copy">
                      <span>{item.category}</span>
                      <h3>{item.title}</h3>
                      <p>{item.explanation}</p>
                      <small><I18nText>
                        Responsable: </I18nText>{item.assigneeName ?? "Sin asignar"}
                        {item.dueAt ? ` · ${formatDate(item.dueAt)}` : ""}
                      </small>
                      {itemEvidence.length ? (
                        <div className="requirement-evidence-list">
                          {itemEvidence.map(({ link, document }) => (
                            <div className="requirement-evidence" key={link.id}>
                              <strong>{document!.documentType}</strong>
                              <span>{document!.originalFilename}</span>
                              <small><I18nText>{link.validity === "expired" ? "Caducada" :
                                link.validity === "superseded" ? "Nueva versión sin revisar" :
                                link.validity === "unavailable" ? "No disponible" : "Vigente"}</I18nText>
                                {" · "}<I18nText>{link.sufficiency === "sufficient" ? "Suficiente según revisión" :
                                link.sufficiency === "insufficient" ? "Insuficiente según revisión" : "Suficiencia sin valorar"}</I18nText>
                              </small>
                              <a href="#documents"><I18nText>Ver documentos y versiones</I18nText></a>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {canManage ? <ChecklistTaskEditor key={`${item.id}-${item.title}-${item.dueAt}-${item.assigneeUserId}`} item={item} members={taskMembers} organizationId={organization.id} propertyId={dossier.id} hasHistory={itemReviews.length>0} /> : null}
                      {activeReview ? (
                        <div className={`professional-review-record ${activeReview.decision}`}>
                          <div>
                            <strong><I18nText>{reviewDecisionLabel(activeReview.decision)}</I18nText></strong>
                            <span>
                              {activeReview.reviewerName} · {formatDate(activeReview.reviewedAt)}
                            </span>
                          </div>
                          <p>{activeReview.observation}</p>
                          <small><I18nText>
                            Evidencia: </I18nText>{activeReview.documentType} · {activeReview.originalFilename}
                          </small>
                        </div>
                      ) : itemReviews[0]?.invalidatedAt ? (
                        <div className="professional-review-record invalidated">
                          <div>
                            <strong><I18nText>Revisión anterior invalidada</I18nText></strong>
                            <span>{formatDate(itemReviews[0].invalidatedAt)}</span>
                          </div>
                          <p><I18nText>
                            La evidencia cambió. Debe revisarse la versión vigente.
                          </I18nText></p>
                        </div>
                      ) : null}
                    </div>
                    <div className="checklist-status-area">
                      <span className={`workflow-badge ${item.workflowStatus}`}>
                        <I18nText>{checklistStatusLabels[item.workflowStatus]}</I18nText>
                      </span>
                      {!activeReview &&
                      (canManage || (item.itemKind!=="operational" && can(role, "review.create"))) ? (
                        <ChecklistStatusControl
                          itemId={item.id}
                          organizationId={organization.id}
                          propertyId={dossier.id}
                          status={item.workflowStatus}
                          operational={item.itemKind==="operational"}
                        />
                      ) : null}
                      {canCloseReview && item.itemKind!=="operational" && !activeReview ? (
                        <ProfessionalReviewForm
                          checklistItemId={item.id}
                          evidenceOptions={evidenceOptions}
                          organizationId={organization.id}
                          propertyId={dossier.id}
                        />
                      ) : null}
                    </div>
                  </article>
                  );
                })}
              </div>
              </section>)}
            </section>

            {rulesWorkspace ? (
              <RuleEvaluationPanel
                canEdit={canManage}
                evaluation={rulesWorkspace.evaluation}
                facts={rulesWorkspace.facts}
                organizationId={organization.id}
                propertyId={dossier.id}
                ruleSetLabel={rulesWorkspace.ruleSetLabel}
              />
            ) : null}

            <section className="dossier-card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow"><I18nText>Evidencias</I18nText></span>
                  <h2 id="documents"><I18nText>Documentos privados</I18nText></h2>
                  <p><I18nText>
                    Cada archivo pasa un control técnico básico antes de quedar
                    disponible. No sustituye a un antivirus especializado.
                  </I18nText></p>
                </div>
                {canUpload ? (
                  <UploadDocumentForm
                    checklistItems={dossier.checklistItems.map((item) => ({
                      id: item.id,
                      title: item.title,
                    }))}
                    dataProfile={dossier.dataProfile}
                    organizationId={organization.id}
                    propertyId={dossier.id}
                  />
                ) : null}
              </div>

              {dossier.documents.length === 0 ? (
                <div className="empty-state documents-empty">
                  <span><FilePlus2 aria-hidden="true" /></span>
                  <div>
                    <h3><I18nText>No hay documentos</I18nText></h3>
                    <p><I18nText>Añade la primera evidencia cuando esté disponible.</I18nText></p>
                  </div>
                </div>
              ) : (
                <div className="document-list">
                  {visibleDocuments.items.map((document) => (
                    <article className="document-row" key={document.id}>
                      <span className="document-icon"><FileLock2 aria-hidden="true" /></span>
                      <div>
                        <h3>{document.documentType}</h3>
                        <p>{document.originalFilename}</p>
                        <small><I18nText>
                          Versión </I18nText>{document.versions.length} ·{" "}
                          {formatBytes(document.sizeBytes)} ·{" "}
                          {formatDate(document.uploadedAt)}
                        </small>
                        {canUpload ? <EvidenceLinkControl
                          checklistItems={dossier.checklistItems.map((item) => ({ id: item.id, title: item.title }))}
                          documentId={document.id}
                          linkedItemIds={dossier.evidenceLinks.filter((link) => link.documentId === document.id)
                            .map((link) => link.checklistItemId)}
                          organizationId={organization.id}
                          propertyId={dossier.id}
                        /> : null}
                        <details className="document-version-history">
                          <summary><I18nText>
                            Historial · </I18nText>{document.versions.length} <I18nText>{document.versions.length === 1 ? "versión" : "versiones"}</I18nText>
                          </summary>
                          <div>
                            {document.versions.map((version, index) => (
                              <article key={version.id}>
                                <span><I18nText>
                                  v</I18nText>{document.versions.length - index}
                                  <I18nText>{version.isCurrent ? " · vigente" : ""}</I18nText>
                                </span>
                                <strong>{version.originalFilename}</strong>
                                <small>
                                  {formatDate(version.uploadedAt)} ·{" "}
                                  {version.uploadedByName} ·{" "}
                                  <I18nText>{documentVersionStatus(
                                    version.malwareScanStatus,
                                  )}</I18nText>
                                </small>
                              </article>
                            ))}
                          </div>
                        </details>
                        {canManage ? <EvidenceMetadataEditor document={document} organizationId={organization.id} propertyId={dossier.id} hasHistory={dossier.reviews.some(review=>review.documentId===document.id)} /> : null}
                      </div>
                      <div className="document-security-state">
                        {(document.malwareScanStatus === "clean" ||
                          document.malwareScanStatus === "structural_only") &&
                        document.workflowStatus === "available" ? (
                          <>
                            <span className="document-security-badge safe">
                              <ShieldCheck aria-hidden="true" />{" "}
                              <I18nText>{document.malwareScanStatus === "structural_only"
                                ? "Control estructural del piloto"
                                : "Análisis antimalware superado"}</I18nText>
                            </span>
                            {canReadDocuments ? (
                              <a
                                className="document-download"
                                href={`/api/properties/${dossier.id}/documents/${document.id}?organizationId=${encodeURIComponent(organization.id)}`}
                              >
                                <Download aria-hidden="true" /><I18nText> Descargar
                              </I18nText></a>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <span className={`document-security-badge ${document.workflowStatus}`}>
                              <I18nText>{documentSecurityStatus(
                                document.malwareScanStatus,
                                document.workflowStatus,
                              )}</I18nText>
                            </span>
                            {document.malwareScanStatus === "pending" &&
                            canManageDocumentSecurity ? (
                              <DocumentSecurityCheckButton
                                documentId={document.id}
                                organizationId={organization.id}
                                propertyId={dossier.id}
                              />
                            ) : null}
                          </>
                        )}
                        {document.expiresAt ? (
                          <small><I18nText>Vence: </I18nText>{formatDate(document.expiresAt)}</small>
                        ) : null}
                        {canUpload ? (
                          <ReplaceDocumentVersionForm
                            dataProfile={dossier.dataProfile}
                            documentId={document.id}
                            organizationId={organization.id}
                            propertyId={dossier.id}
                          />
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              )}
              {visibleDocuments.total > 0 ? (
                <LocalizedControl as="nav" className="document-pagination" aria-label="Páginas de documentos">
                  <span><I18nText>Mostrando </I18nText>{visibleDocuments.start + 1}–{visibleDocuments.start + visibleDocuments.items.length}<I18nText> de </I18nText>{visibleDocuments.total}<I18nText> · Página </I18nText>{visibleDocuments.page}<I18nText> de </I18nText>{visibleDocuments.pages}</span>
                  <div>
                    {visibleDocuments.page > 1 ? <PendingLink className="button button-secondary" href={`?documentsPage=${visibleDocuments.page - 1}#documents`}><I18nText>Anteriores</I18nText></PendingLink> : null}
                    {visibleDocuments.page < visibleDocuments.pages ? <PendingLink className="button button-secondary" href={`?documentsPage=${visibleDocuments.page + 1}#documents`}><I18nText>Siguientes</I18nText></PendingLink> : null}
                  </div>
                </LocalizedControl>
              ) : null}
            </section>
          </div>

          <aside className="dossier-sidebar">
            <section className="dossier-card property-data-card">
              <div className="section-heading">
                <h2><I18nText>Datos de la vivienda</I18nText></h2>
                {canManage && !dossier.archivedAt ? (
                  <PendingLink
                    className="button button-secondary property-edit-link"
                    href={`/app/properties/${dossier.id}/edit`}
                    prefetch
                  >
                    <PencilLine aria-hidden="true" /><I18nText> Editar
                  </I18nText></PendingLink>
                ) : null}
              </div>
              <dl className="property-data-list">
                <div>
                  <dt><I18nText>Dirección</I18nText></dt>
                  <dd>{dossier.addressLine || <I18nText>No indicada</I18nText>}</dd>
                </div>
                <div><dt><I18nText>Código postal</I18nText></dt><dd>{dossier.postalCode}</dd></div>
                <div><dt><I18nText>Actividad</I18nText></dt><dd><I18nText>{activityLabel(dossier.activityStatus)}</I18nText></dd></div>
                <div><dt><I18nText>Propietario</I18nText></dt><dd>{dossier.ownerName}</dd></div>
                {canManage && dossier.ownerEmail ? (
                  <div><dt><I18nText>Correo</I18nText></dt><dd>{dossier.ownerEmail}</dd></div>
                ) : null}
                {canManage && dossier.ownerPhone ? (
                  <div><dt><I18nText>Teléfono</I18nText></dt><dd>{dossier.ownerPhone}</dd></div>
                ) : null}
                {canManage && dossier.cadastralReference ? (
                  <div><dt><I18nText>Ref. catastral</I18nText></dt><dd className="sensitive-value">{dossier.cadastralReference}</dd></div>
                ) : null}
              </dl>
            </section>

            {canReadInternalComments ? (
              <section className="dossier-card comments-card">
                <div className="section-heading">
                  <div>
                    <h2><I18nText>Comentarios internos</I18nText></h2>
                    <p><I18nText>Últimos 30 comentarios. No visibles para propietarios.</I18nText></p>
                  </div>
                </div>
                <CommentForm
                  dataProfile={dossier.dataProfile}
                  organizationId={organization.id}
                  propertyId={dossier.id}
                />
                <div className="comments-list">
                  {dossier.comments.length === 0 ? (
                    <p className="no-comments"><I18nText>Aún no hay comentarios.</I18nText></p>
                  ) : (
                    dossier.comments.map((comment) => (
                      <article key={comment.id}>
                        <div>
                          <strong>{comment.authorName}</strong>
                          <span>{formatDate(comment.createdAt)}</span>
                        </div>
                        <p>{comment.body}</p>
                      </article>
                    ))
                  )}
                </div>
              </section>
            ) : null}

            {canArchive && !dossier.archivedAt ? (
              <section className="dossier-card danger-card">
                <h2><I18nText>Archivo</I18nText></h2>
                <p><I18nText>
                  Archivar oculta la vivienda de las listas activas, pero conserva
                  documentos e historial.
                </I18nText></p>
                <ArchivePropertyButton
                  organizationId={organization.id}
                  propertyId={dossier.id}
                />
              </section>
            ) : null}
          </aside>
        </div>
      </div>
    </WorkspaceShell>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));
}

function formatBytes(value: number): string {
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function activityLabel(value: string): string {
  const labels: Record<string, string> = {
    active: "Activa",
    ceased: "Cesada",
    not_started: "No iniciada",
    paused: "Pausada",
  };
  return labels[value] ?? "Sin especificar";
}

function documentVersionStatus(value: string): string {
  const labels: Record<string, string> = {
    clean: "Análisis antimalware superado",
    failed: "Control no superado",
    infected: "Archivo rechazado",
    pending: "Pendiente de control",
    structural_only: "Control estructural del piloto",
  };
  return labels[value] ?? "Pendiente";
}

function documentSecurityStatus(
  malwareScanStatus: string,
  workflowStatus: string,
): string {
  if (workflowStatus === "rejected" || malwareScanStatus === "infected") {
    return "Rechazado por seguridad";
  }
  if (malwareScanStatus === "failed") return "Control no superado";
  return "Bloqueado · control pendiente";
}

function reviewDecisionLabel(value: string): string {
  return {
    approved: "Evidencia aprobada",
    changes_requested: "Cambios solicitados",
    rejected: "Evidencia rechazada",
  }[value] ?? "Decisión registrada";
}
