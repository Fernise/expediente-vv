
import { I18nText, LocalizedControl } from "@/app/components/Language";
import { WorkspaceGuide } from "@/app/components/WorkspaceGuide";
import Link from "next/link";
import { KeyRound, Mail, ShieldCheck, ShieldX, UsersRound } from "lucide-react";
import { TeamManagement } from "@/app/components/TeamManagement";
import { WorkspaceShell } from "@/app/components/WorkspaceShell";
import { listOrganizationsForActor } from "@/db/organizations";
import { listProperties } from "@/db/properties";
import { listTeam } from "@/db/team";
import { activeOrganizationFrom } from "@/lib/active-organization";
import { requireActor } from "@/lib/auth";
import { gmailProviderStatus } from "@/lib/email/gmail";
import { can, type Role } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const actor = await requireActor("/app/team");
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
  if (!can(role, "membership.manage")) {
    return (
      <WorkspaceShell
        active="team"
        actor={actor}
        organization={organization}
        organizations={organizations}
      >
        <div className="workspace-content narrow-content">
          <section className="empty-state">
            <span><ShieldX aria-hidden="true" /></span>
            <div>
              <h1><I18nText>Equipo restringido</I18nText></h1>
              <p><I18nText>
                Solo una persona administradora puede invitar miembros o
                modificar sus accesos.
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

  const [team, properties] = await Promise.all([
    listTeam(actor, organization.id),
    listProperties(actor, organization.id),
  ]);
  const limitedMembers = team.members.filter(
    (member) => member.role === "professional" || member.role === "owner",
  ).length;
  const emailProvider = gmailProviderStatus();

  return (
    <WorkspaceShell
      active="team"
      actor={actor}
      organization={organization}
      organizations={organizations}
    >
      <div className="workspace-content team-content">
        <header className="page-heading team-heading">
          <div>
            <span className="eyebrow"><I18nText>Acceso y responsabilidades</I18nText></span>
            <h1><I18nText>Equipo</I18nText></h1>
            <p><I18nText>
              Decide quién entra en </I18nText>{organization.name}<I18nText> y qué viviendas puede
              consultar.
            </I18nText></p>
          </div>
          <div className="team-security-label">
            <ShieldCheck aria-hidden="true" />
            <span>
              <strong><I18nText>Aislamiento por espacio</I18nText></strong>
              <small><I18nText>Los cambios quedan registrados</I18nText></small>
            </span>
          </div>
        </header>

        <LocalizedControl as="section" aria-label="Resumen del equipo" className="team-summary">
          <article>
            <span><UsersRound aria-hidden="true" /><I18nText> Con acceso</I18nText></span>
            <strong>{team.members.length}</strong>
            <small><I18nText>Personas activas en este espacio</I18nText></small>
          </article>
          <article>
            <span><KeyRound aria-hidden="true" /><I18nText> Acceso limitado</I18nText></span>
            <strong>{limitedMembers}</strong>
            <small><I18nText>Profesionales y propietarios</I18nText></small>
          </article>
          <article>
            <span><Mail aria-hidden="true" /><I18nText> Pendientes</I18nText></span>
            <strong>{team.invitations.length}</strong>
            <small><I18nText>Invitaciones aún no aceptadas</I18nText></small>
          </article>
        </LocalizedControl>

        <WorkspaceGuide />
        <TeamManagement
          emailProviderConfigured={emailProvider.configured}
          emailSender={emailProvider.sender}
          invitations={team.invitations}
          members={team.members}
          organizationId={organization.id}
          properties={properties.map((property) => ({
            id: property.id,
            name: property.alias,
          }))}
        />
      </div>
    </WorkspaceShell>
  );
}
