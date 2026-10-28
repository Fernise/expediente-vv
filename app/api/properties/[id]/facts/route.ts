import { guardMutationRequest } from "@/lib/mutation-guard";
import { NextResponse } from "next/server";
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from "@/db/properties";
import { saveFactsAndEvaluate } from "@/db/rules";
import { getOptionalActor } from "@/lib/auth";

export async function PUT(
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
  let body: { organizationId?: unknown; values?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 });
  }
  if (
    typeof body.organizationId !== "string" ||
    !body.values ||
    typeof body.values !== "object" ||
    Array.isArray(body.values)
  ) {
    return NextResponse.json({ error: "Datos incompletos." }, { status: 400 });
  }

  try {
    const evaluation = await saveFactsAndEvaluate(
      actor,
      body.organizationId,
      id,
      body.values as Record<string, unknown>,
    );
    return NextResponse.json({ evaluation });
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
      { error: "No se pudo ejecutar la evaluación trazable." },
      { status: 500 },
    );
  }
}
