
import { I18nText, LocalizedControl } from "@/app/components/Language";
import Link from "next/link";
import {
  Archive,
  Database,
  FileArchive,
  ShieldCheck,
  ShieldX,
  UsersRound,
} from "lucide-react";
import { DataPrivacyControls } from "@/app/components/DataPrivacyControls";
import { WorkspaceShell } from "@/app/components/WorkspaceShell";
import { listOrganizationsForActor } from "@/db/organizations";
import { getPrivacyOverview } from "@/db/privacy";
import { activeOrganizationFrom } from "@/lib/active-organization";
import { requireActor } from "@/lib/auth";
import { can, type Role } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const actor = await requireActor("/app/privacy");
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
  const role = organization.role as Role;
  if (!can(role, "data.export") || !can(role, "data.delete")) {
    return (
      <WorkspaceShell
        active="privacy"
        actor={actor}
        organization={organization}
        organizations={organizations}
      >
        <div className="workspace-content narrow-content">
          <section className="empty-state">
            <span><ShieldX aria-hidden="true" /></span>
            <div>
              <h1><I18nText>Privacidad restringida</I18nText></h1>
              <p><I18nText>Solo la administración puede exportar o eliminar todo el espacio.</I18nText></p>
            </div>
            <Link className="button button-primary" href="/app"><I18nText>Volver al resumen</I18nText></Link>
          </section>
        </div>
      </WorkspaceShell>
    );
  }

  const overview = await getPrivacyOverview(actor, organization.id);
  return (
    <WorkspaceShell
      active="privacy"
      actor={actor}
      organization={organization}
      organizations={organizations}
    >
      <div className="workspace-content privacy-content">
        <header className="page-heading privacy-heading">
          <div>
            <span className="eyebrow"><I18nText>Control del espacio</I18nText></span>
            <h1><I18nText>Datos y privacidad</I18nText></h1>
            <p><I18nText>
              Consulta qué guarda </I18nText>{organization.name}<I18nText>, descarga una copia y
              controla su eliminación sin depender de soporte.
            </I18nText></p>
          </div>
          <div className="privacy-trust-label">
            <ShieldCheck aria-hidden="true" />
            <span><strong><I18nText>Acceso administrativo</I18nText></strong><small><I18nText>Acciones registradas</I18nText></small></span>
          </div>
        </header>

        {overview.deletionScheduledAt ? (
          <aside className="privacy-scheduled-banner" role="status"><I18nText>
            Hay una eliminación programada para este espacio. Descarga primero
            cualquier información que necesites conservar.
          </I18nText></aside>
        ) : null}

        <LocalizedControl as="section" aria-label="Inventario del espacio" className="privacy-summary-grid">
          <article><Database aria-hidden="true" /><span><I18nText>Viviendas</I18nText><strong>{overview.properties}</strong></span></article>
          <article><FileArchive aria-hidden="true" /><span><I18nText>Documentos</I18nText><strong>{overview.documents}</strong></span></article>
          <article><UsersRound aria-hidden="true" /><span><I18nText>Personas con acceso</I18nText><strong>{overview.members}</strong></span></article>
          <article><Archive aria-hidden="true" /><span><I18nText>Archivos comprobados</I18nText><strong>{formatBytes(overview.documentBytes)}</strong></span></article>
        </LocalizedControl>

        <section className="privacy-policy-card">
          <div>
            <span className="eyebrow"><I18nText>Conservación actual</I18nText></span>
            <h2><I18nText>Mientras el espacio siga activo</I18nText></h2>
          </div>
          <ul>
            <li><I18nText>Las viviendas archivadas y su trazabilidad se conservan para mantener el historial.</I18nText></li>
            <li><I18nText>Los archivos rechazados por seguridad no se incorporan al expediente.</I18nText></li>
            <li><I18nText>Una solicitud de borrado puede cancelarse durante 30 días.</I18nText></li>
            <li><I18nText>Al vencer el plazo se eliminan también los archivos privados y la auditoría del espacio.</I18nText></li>
          </ul>
          <p><I18nText>
            En el piloto no se aplica una conservación legal automática: cada
            organización debe decidir qué documentos necesita guardar fuera de
            la herramienta.
          </I18nText></p>
        </section>

        <div className="privacy-control-grid">
          <DataPrivacyControls
            deletionScheduledAt={overview.deletionScheduledAt}
            organizationId={organization.id}
            organizationName={organization.name}
          />
        </div>

        <aside className="privacy-pilot-note">
          <strong><I18nText>Antes de incorporar expedientes reales</I18nText></strong>
          <p><I18nText>
            Usa datos anonimizados hasta definir quién actúa como responsable y
            encargado del tratamiento, la base jurídica y los plazos aplicables.
            Consultas del piloto: </I18nText><a href="mailto:expedientevv.canarias@gmail.com"><I18nText>expedientevv.canarias@gmail.com</I18nText></a>.
          </p>
        </aside>
      </div>
    </WorkspaceShell>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
