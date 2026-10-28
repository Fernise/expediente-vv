import { guardMutationRequest } from "@/lib/mutation-guard";
import { NextResponse } from "next/server";
import {
  cancelOrganizationDeletion,
  privacyErrorStatus,
  requestOrganizationDeletion,
} from "@/db/privacy";
import { getOptionalActor } from "@/lib/auth";

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
  const body = (await request.json().catch(() => null)) as {
    confirmation?: unknown;
  } | null;
  if (typeof body?.confirmation !== "string") {
    return NextResponse.json(
      { error: "Confirma el nombre del espacio." },
      { status: 400 },
    );
  }
  try {
    const result = await requestOrganizationDeletion(
      actor,
      id,
      body.confirmation,
    );
    return NextResponse.json(result);
  } catch (error) {
    return privacyError(error);
  }
}

export async function DELETE(
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
  try {
    await cancelOrganizationDeletion(actor, id);
    return NextResponse.json({ cancelled: true });
  } catch (error) {
    return privacyError(error);
  }
}

function privacyError(error: unknown) {
  const status = privacyErrorStatus(error);
  const message =
    status === 500 || !(error instanceof Error)
      ? "No se pudo actualizar la eliminación del espacio."
      : error.message;
  return NextResponse.json({ error: message }, { status });
}
