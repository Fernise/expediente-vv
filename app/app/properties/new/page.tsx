
import { I18nText } from "@/app/components/Language";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PropertyForm } from "@/app/components/PropertyForm";
import { WorkspaceShell } from "@/app/components/WorkspaceShell";
import { listOrganizationsForActor } from "@/db/organizations";
import { requireActor } from "@/lib/auth";
import { activeOrganizationFrom } from "@/lib/active-organization";

export const dynamic = "force-dynamic";

export default async function NewPropertyPage() {
  const actor = await requireActor("/app/properties/new");
  const organizations = await listOrganizationsForActor(actor);
  const organization = await activeOrganizationFrom(organizations);

  if (!organization) {
    return (
      <main className="app-gate">
        <section className="gate-card">
          <h1><I18nText>Primero crea una organización</I18nText></h1>
          <Link className="button button-primary" href="/app"><I18nText>Volver al inicio</I18nText></Link>
        </section>
      </main>
    );
  }

  return (
    <WorkspaceShell
      active="properties"
      actor={actor}
      organization={organization}
      organizations={organizations}
    >
      <div className="workspace-content narrow-content">
        <header className="page-heading">
          <div>
            <Link className="back-link" href="/app/properties">
              <ArrowLeft aria-hidden="true" /><I18nText> Viviendas
            </I18nText></Link>
            <span className="eyebrow page-kicker"><I18nText>Nuevo expediente</I18nText></span>
            <h1><I18nText>Añadir vivienda</I18nText></h1>
            <p><I18nText>
              Registra los datos esenciales. Al terminar, abriremos su espacio
              de trabajo con el checklist inicial preparado.
            </I18nText></p>
          </div>
          <span className="security-note"><I18nText>Privado para </I18nText>{organization.name}</span>
        </header>
        <PropertyForm organizationId={organization.id} />
      </div>
    </WorkspaceShell>
  );
}
