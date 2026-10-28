import { NextResponse } from "next/server";
import { getOptionalActor } from "@/lib/auth";
import { guardMutationRequest } from "@/lib/mutation-guard";
import {
  AuthorizationError,
  changeEvidenceLink,
  NotFoundError,
  ValidationError,
} from "@/db/properties";

async function updateLink(
  request: Request,
  context: { params: Promise<{ id: string; documentId: string }> },
  action: "link" | "unlink",
) {
  const rejected = await guardMutationRequest(request);
  if (rejected) return rejected;
  const actor = await getOptionalActor();
  if (!actor) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  const { id, documentId } = await context.params;
  let body: { checklistItemId?: unknown; organizationId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 });
  }
  try {
    await changeEvidenceLink(actor, {
      action,
      checklistItemId: typeof body.checklistItemId === "string" ? body.checklistItemId : "",
      documentId,
      organizationId: typeof body.organizationId === "string" ? body.organizationId : "",
      propertyId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof ValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: "No se pudo cambiar el vínculo." }, { status: 500 });
  }
}

export function POST(request: Request, context: { params: Promise<{ id: string; documentId: string }> }) {
  return updateLink(request, context, "link");
}

export function DELETE(request: Request, context: { params: Promise<{ id: string; documentId: string }> }) {
  return updateLink(request, context, "unlink");
}
