import { guardMutationRequest } from "@/lib/mutation-guard";
import { NextResponse } from "next/server";
import { createOrganizationForActor } from "@/db/organizations";
import { OrganizationCreationError } from "@/db/organization-creation-core";
import { getOptionalActor } from "@/lib/auth";

export async function POST(request: Request) {
  const rejectedRequest = await guardMutationRequest(request);
  if (rejectedRequest) return rejectedRequest;

  const actor = await getOptionalActor();
  if (!actor) {
    return NextResponse.json(
      { error: "Debes iniciar sesión para crear una organización." },
      { status: 401 },
    );
  }

  let body: { name?: unknown };
  try {
    body = (await request.json()) as { name?: unknown };
  } catch {
    return NextResponse.json(
      { error: "La solicitud no tiene un formato válido." },
      { status: 400 },
    );
  }

  if (typeof body.name !== "string") {
    return NextResponse.json(
      { error: "Introduce el nombre de la organización." },
      { status: 400 },
    );
  }

  try {
    const organization = await createOrganizationForActor(actor, body.name, request.headers.get("idempotency-key"));
    return NextResponse.json({ organization }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof OrganizationCreationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error && error.message.startsWith("El nombre")
        ? error.message
        : "No hemos podido crear la organización. Inténtalo de nuevo.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
