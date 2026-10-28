import { buildPropertiesCsv } from "@/lib/csv-export";
import { attachmentHeader, filenameSlug } from "@/lib/http-download";
import {
  AuthorizationError,
  listProperties,
  requireOrganizationCapability,
} from "@/db/properties";
import { getOptionalActor } from "@/lib/auth";

export async function GET(request: Request) {
  const actor = await getOptionalActor();
  if (!actor) return new Response("Debes iniciar sesión.", { status: 401 });

  const organizationId = new URL(request.url).searchParams.get("organizationId");
  if (!organizationId) {
    return new Response("Falta la organización.", { status: 400 });
  }

  try {
    const membership = await requireOrganizationCapability(
      actor,
      organizationId,
      "export.csv",
    );
    const [active, archived] = await Promise.all([
      listProperties(actor, organizationId),
      listProperties(actor, organizationId, { archived: true }),
    ]);
    const csv = buildPropertiesCsv([...active, ...archived]);
    const filename = `viviendas-${filenameSlug(membership.organizationName)}.csv`;

    return new Response(csv, {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": attachmentHeader(filename),
        "content-type": "text/csv; charset=utf-8",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return new Response(error.message, { status: 403 });
    }
    return new Response("No se pudo generar la exportación.", { status: 500 });
  }
}
