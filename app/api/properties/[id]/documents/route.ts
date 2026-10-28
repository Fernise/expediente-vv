import { guardMutationRequest } from "@/lib/mutation-guard";
import { NextResponse } from "next/server";
import {
  AuthorizationError,
  NotFoundError,
  replaceDocumentVersion,
  uploadDocument,
  ValidationError,
} from "@/db/properties";
import { getOptionalActor } from "@/lib/auth";
import { mutationReceipt } from "@/db/mutation-receipts";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const rejectedRequest = await guardMutationRequest(request);
  if (rejectedRequest) return rejectedRequest;

  const actor = await getOptionalActor();
  if (!actor) {
    return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  }
  const { id } = await context.params;
  let data: FormData;
  try { data = await request.formData(); } catch {
    return NextResponse.json({ error: "La subida no tiene un formato válido. Conserva el archivo y vuelve a seleccionarlo." }, { status: 400 });
  }
  const file = data.get("file");
  const organizationId = value(data, "organizationId");

  if (!(file instanceof File) || !organizationId) {
    return NextResponse.json(
      { error: "Selecciona un archivo y una organización." },
      { status: 400 },
    );
  }

  try {
    return await mutationReceipt(actor, organizationId, request.headers.get("idempotency-key"), data, "document.upload", id, async () => {
    const documentId = value(data, "documentId");
    if (documentId) {
      await replaceDocumentVersion(actor, {
        anonymizationConfirmed: value(data, "anonymizationConfirmed") === "yes",
        documentId,
        file,
        organizationId,
        propertyId: id,
      });
    } else {
      await uploadDocument(actor, {
        anonymizationConfirmed: value(data, "anonymizationConfirmed") === "yes",
        checklistItemIds: data.getAll("checklistItemIds").filter((item): item is string => typeof item === "string"),
        documentDate: value(data, "documentDate"),
        documentType: value(data, "documentType"),
        expiresAt: value(data, "expiresAt"),
        file,
        notes: value(data, "notes"),
        organizationId,
        propertyId: id,
      });
    }
    return NextResponse.json({ ok: true }, { status: 201 });
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "No se pudo almacenar el documento de forma segura." },
      { status: 500 },
    );
  }
}

function value(data: FormData, key: string): string {
  const item = data.get(key);
  return typeof item === "string" ? item : "";
}
