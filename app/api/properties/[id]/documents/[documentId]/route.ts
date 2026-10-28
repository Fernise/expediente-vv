import { guardMutationRequest } from "@/lib/mutation-guard";
import {
  AuthorizationError,
  getDownloadableDocument,
  NotFoundError,
  recheckDocumentSecurity,
  ValidationError,
  updateEvidenceMetadata,
} from "@/db/properties";
import { getOptionalActor } from "@/lib/auth";
import { attachmentHeader } from "@/lib/http-download";

export async function GET(
  request: Request,
  context: { params: Promise<{ documentId: string; id: string }> },
) {
  const actor = await getOptionalActor();
  if (!actor) return new Response("Debes iniciar sesión.", { status: 401 });

  const organizationId = new URL(request.url).searchParams.get("organizationId");
  if (!organizationId) {
    return new Response("Falta la organización.", { status: 400 });
  }
  const { documentId, id } = await context.params;

  try {
    const document = await getDownloadableDocument(
      actor,
      organizationId,
      id,
      documentId,
    );
    return new Response(document.body, {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": attachmentHeader(document.filename),
        "content-length": String(document.sizeBytes),
        "content-type": document.mimeType,
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
    if (error instanceof ValidationError) {
      return new Response(error.message, { status: 409 });
    }
    return new Response("No se pudo descargar el documento.", { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ documentId: string; id: string }> },
) {
  const rejectedRequest = await guardMutationRequest(request);
  if (rejectedRequest) return rejectedRequest;

  const actor = await getOptionalActor();
  if (!actor) return Response.json({ error: "Debes iniciar sesión." }, { status: 401 });

  const { documentId, id } = await context.params;
  const payload = (await request.json().catch(() => ({}))) as {
    organizationId?: string;
    action?:string;documentType?:string;documentDate?:string;expiresAt?:string;
  };
  if (!payload.organizationId) {
    return Response.json({ error: "Falta la organización." }, { status: 400 });
  }

  try {
    if(payload.action==="metadata") {
      const str=(value:unknown)=>typeof value==="string"?value:"";
      await updateEvidenceMetadata(actor,{organizationId:payload.organizationId,propertyId:id,documentId,documentType:str(payload.documentType),documentDate:str(payload.documentDate),expiresAt:str(payload.expiresAt)});
      return Response.json({ok:true});
    }
    const result = await recheckDocumentSecurity(
      actor,
      payload.organizationId,
      id,
      documentId,
    );
    return Response.json(result);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof NotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ValidationError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return Response.json(
      { error: "No se pudo completar la comprobación técnica." },
      { status: 500 },
    );
  }
}
