
import { I18nText } from "@/app/components/Language";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, PencilLine } from "lucide-react";
import { PropertyEditForm } from "@/app/components/PropertyEditForm";
import { WorkspaceShell } from "@/app/components/WorkspaceShell";
import { listOrganizationsForActor } from "@/db/organizations";
import {
  getPropertyDossier,
  listAssignablePropertyManagers,
  NotFoundError,
} from "@/db/properties";
import { activeOrganizationFrom } from "@/lib/active-organization";
import { requireActor } from "@/lib/auth";
import { can, type Role } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function EditPropertyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireActor(`/app/properties/${id}/edit`);
  const organizations = await listOrganizationsForActor(actor);
  const organization = await activeOrganizationFrom(organizations);
  if (!organization || !can(organization.role as Role, "property.update")) {
    notFound();
  }

  let dossier;
  let managers;
  try {
    [dossier, managers] = await Promise.all([
      getPropertyDossier(actor, organization.id, id),
      listAssignablePropertyManagers(actor, organization.id, id),
    ]);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  if (dossier.archivedAt) notFound();

  return (
    <WorkspaceShell
      active="properties"
      actor={actor}
      organization={organization}
      organizations={organizations}
    >
      <div className="workspace-content narrow-content">
        <header className="page-heading edit-property-heading">
          <div>
            <Link className="back-link" href={`/app/properties/${id}`}>
              <ArrowLeft aria-hidden="true" /><I18nText> Volver al expediente
            </I18nText></Link>
            <span className="eyebrow page-kicker"><I18nText>Edición controlada</I18nText></span>
            <h1><I18nText>Editar vivienda</I18nText></h1>
            <p><I18nText>
              Actualiza los datos operativos. El historial registrará qué campos
              han cambiado, sin copiar información personal a la auditoría.
            </I18nText></p>
          </div>
          <span className="edit-heading-icon" aria-hidden="true">
            <PencilLine />
          </span>
        </header>
        <PropertyEditForm
          dossier={dossier}
          managers={managers}
          organizationId={organization.id}
        />
      </div>
    </WorkspaceShell>
  );
}
