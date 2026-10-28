import { NextResponse } from "next/server";
import {
  AuthorizationError,
  createProfessionalReview,
  NotFoundError,
  ValidationError,
} from "@/db/properties";
import { getOptionalActor } from "@/lib/auth";
import { guardMutationRequest } from "@/lib/mutation-guard";

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
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 });
  }

  try {
    const result = await createProfessionalReview(actor, {
      checklistItemId: stringValue(body.checklistItemId),
      decision: stringValue(body.decision),
      documentId: stringValue(body.documentId),
      observation: stringValue(body.observation),
      organizationId: stringValue(body.organizationId),
      propertyId: id,
    });
    return NextResponse.json(result, { status: 201 });
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
      { error: "No se pudo registrar la revisión profesional." },
      { status: 500 },
    );
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
