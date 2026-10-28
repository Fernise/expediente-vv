import { guardMutationRequest } from "@/lib/mutation-guard";
import { NextResponse } from "next/server";
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from "@/db/properties";
import { createRuleDraftVersion } from "@/db/rules";
import { getOptionalActor } from "@/lib/auth";

export async function POST(request: Request) {
  const rejectedRequest = await guardMutationRequest(request);
  if (rejectedRequest) return rejectedRequest;

  const actor = await getOptionalActor();
  if (!actor) {
    return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 });
  }
  if (
    typeof body.organizationId !== "string" ||
    typeof body.ruleStableKey !== "string" ||
    typeof body.factKey !== "string" ||
    typeof body.expectedValue !== "boolean" ||
    typeof body.displayTitle !== "string" ||
    typeof body.displayExplanation !== "string"
  ) {
    return NextResponse.json({ error: "Datos incompletos." }, { status: 400 });
  }

  try {
    const version = await createRuleDraftVersion(actor, {
      displayExplanation: body.displayExplanation,
      displayTitle: body.displayTitle,
      expectedValue: body.expectedValue,
      factKey: body.factKey,
      organizationId: body.organizationId,
      ruleStableKey: body.ruleStableKey,
    });
    return NextResponse.json({ version }, { status: 201 });
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
      { error: "No se pudo crear la nueva versión." },
      { status: 500 },
    );
  }
}
