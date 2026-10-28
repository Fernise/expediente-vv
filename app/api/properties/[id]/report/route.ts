import {
  AuthorizationError,
  getPropertyDossier,
  NotFoundError,
  requireOrganizationCapability,
} from "@/db/properties";
import { getOptionalActor } from "@/lib/auth";
import { attachmentHeader, filenameSlug } from "@/lib/http-download";
import { createPropertyReport } from "@/lib/property-report";
import { getPropertyDossierRulesWorkspace } from "@/db/rules";
import { can,type Role } from "@/lib/permissions";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await getOptionalActor();
  if (!actor) return new Response("Debes iniciar sesión.", { status: 401 });

  const searchParams=new URL(request.url).searchParams;
  const organizationId = searchParams.get("organizationId");
  const locale=searchParams.get("lang")??"es";
  if(locale!=="es"&&locale!=="en")return new Response("Idioma no admitido. Usa es o en.",{status:400});
  if (!organizationId) {
    return new Response("Falta la organización.", { status: 400 });
  }
  const { id } = await context.params;

  try {
    const membership = await requireOrganizationCapability(
      actor,
      organizationId,
      "report.generate",
    );
    const workspace=can(membership.role as Role,"rules.read") ? await getPropertyDossierRulesWorkspace(actor,organizationId,id) : null;
    const dossier = workspace?.dossier ?? await getPropertyDossier(actor, organizationId, id);
    const pdf = await createPropertyReport({
      dossier,
      organizationName: membership.organizationName,
      laboratory:workspace?.rulesWorkspace,
      locale,
    });
    const filename = locale==="en"?`report-${filenameSlug(dossier.alias)}-en.pdf`:`informe-${filenameSlug(dossier.alias)}.pdf`;

    return new Response(new Uint8Array(pdf), {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": attachmentHeader(filename),
        "content-type": "application/pdf",
        "content-language": locale,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return new Response(error.message, { status: 403 });
    }
    if (error instanceof NotFoundError) {
      return new Response(error.message, { status: 404 });
    }
    return new Response("No se pudo generar el informe.", { status: 500 });
  }
}
