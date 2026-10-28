import { cookies } from "next/headers";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { WorkspaceShell } from "@/app/components/WorkspaceShell";
import { requireActor } from "@/lib/auth";
import { activeOrganizationFrom } from "@/lib/active-organization";
import { listOrganizationsForActor } from "@/db/organizations";
import { getPrivacyOverview } from "@/db/privacy";
import { pilotLicense } from "@/lib/pilot-license";
export const dynamic = "force-dynamic";
export default async function LicensePage() {
  const actor = await requireActor("/app/license");
  const organizations = await listOrganizationsForActor(actor);
  const organization = await activeOrganizationFrom(organizations);
  const en = (await cookies()).get("expediente-vv-language")?.value === "en";
  if (!organization) return <main className="app-gate"><section className="gate-card"><h1>{en ? "Create a workspace first" : "Primero crea un espacio"}</h1><Link className="button button-primary" href="/app">{en ? "Go to overview" : "Volver al resumen"}</Link></section></main>;
  const admin = organization.role === "organization_admin";
  const license = pilotLicense(organization.id);
  // Only an authorised administrator may retrieve full-workspace usage.
  const usage = admin ? await getPrivacyOverview(actor, organization.id) : null;
  return <WorkspaceShell active="license" actor={actor} organization={organization} organizations={organizations}>
    <div className="workspace-content narrow-content license-content">
      <header className="page-heading"><div><span className="eyebrow">{en ? "Workspace access" : "Acceso del espacio"}</span><h1>{en ? "Licence and plan" : "Licencia y plan"}</h1><p>{organization.name}</p></div><KeyRound aria-hidden="true" /></header>
      <section className="license-card"><span className="draft-stamp">{en ? "FREE PILOT" : "PILOTO GRATUITO"}</span><h2>{en ? "Your workspace is in the validation pilot" : "Tu espacio participa en el piloto de validación"}</h2><p>{en ? "Access is linked to authorised accounts, not a downloadable product key. Workspace roles continue to control what each person can do." : "El acceso está vinculado a las cuentas autorizadas, no a una clave descargable. Los roles del espacio siguen determinando qué puede hacer cada persona."}</p><dl className="license-facts"><div><dt>{en ? "Current cost" : "Coste actual"}</dt><dd>{license.amountDue} €</dd></div><div><dt>{en ? "Paid renewal" : "Renovación de pago"}</dt><dd>{en ? "Disabled" : "Desactivada"}</dd></div><div><dt>{en ? "Data permitted" : "Datos permitidos"}</dt><dd>{en ? "Fictional or anonymised" : "Ficticios o anonimizados"}</dd></div></dl><small>{en ? "This is not a paid or perpetual licence. No payment details are requested." : "No es una licencia de pago ni perpetua. No se solicitan datos de pago."}</small></section>
      {usage ? <section className="license-card"><h2>{en ? "Workspace usage" : "Uso del espacio"}</h2><dl className="license-facts"><div><dt>{en ? "Properties" : "Viviendas"}</dt><dd>{usage.properties}</dd></div><div><dt>{en ? "Documents" : "Documentos"}</dt><dd>{usage.documents}</dd></div><div><dt>{en ? "People with access" : "Personas con acceso"}</dt><dd>{usage.members}</dd></div></dl><p>{en ? "These are usage counts, not contracted limits. Commercial plans and limits have not been defined." : "Son recuentos de uso, no límites contratados. Los planes y límites comerciales todavía no están definidos."}</p></section> : <p>{en ? "Only the workspace administrator can view full usage and manage access." : "Solo la administración puede consultar el uso completo y gestionar los accesos."}</p>}
      <section className="license-card"><h2>{en ? "Before a commercial licence" : "Antes de una licencia comercial"}</h2><p>{en ? "Operator identity, approved terms, data-processing agreements, prices and billing setup are still required. Checkout, paid upgrades and invoice generation are not enabled." : "Faltan identificar al titular, aprobar las condiciones, formalizar el tratamiento de datos, fijar precios y configurar la facturación. No están habilitados contratación, cambios a planes de pago ni emisión de facturas."}</p><Link href="/legal/condiciones">{en ? "Read the pilot terms" : "Consultar condiciones del piloto"}</Link></section>
      <div className="license-actions">{admin ? <><Link className="button button-secondary" href="/app/team">{en ? "Manage team access" : "Gestionar accesos del equipo"}</Link><Link className="button button-secondary" href="/app/privacy">{en ? "Export or leave the pilot" : "Exportar o salir del piloto"}</Link></> : null}<Link className="button button-secondary" href="/legal/privacidad">{en ? "Privacy information" : "Información de privacidad"}</Link></div>
    </div>
  </WorkspaceShell>;
}
