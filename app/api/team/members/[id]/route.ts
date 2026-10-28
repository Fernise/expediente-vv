import { guardMutationRequest } from "@/lib/mutation-guard";
import { NextResponse } from "next/server";
import {
  revokeTeamMember,
  TeamAuthorizationError,
  TeamValidationError,
  updateTeamMember,
} from "@/db/team";
import type { OrganizationRole } from "@/db/organizations";
import { getOptionalActor } from "@/lib/auth";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const rejectedRequest = await guardMutationRequest(request);
  if (rejectedRequest) return rejectedRequest;

  const actor = await getOptionalActor();
  if (!actor) {
    return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    expiresAt?: unknown;
    organizationId?: unknown;
    propertyIds?: unknown;
    role?: unknown;
  } | null;
  if (
    !body ||
    typeof body.organizationId !== "string" ||
    typeof body.action !== "string"
  ) {
    return NextResponse.json(
      { error: "Revisa los datos del miembro." },
      { status: 400 },
    );
  }

  try {
    const { id } = await context.params;
    if (body.action === "revoke") {
      await revokeTeamMember(actor, body.organizationId, id);
    } else if (
      body.action === "update" &&
      typeof body.role === "string" &&
      (body.propertyIds === undefined || Array.isArray(body.propertyIds)) &&
      (body.expiresAt === undefined ||
        body.expiresAt === null ||
        typeof body.expiresAt === "string")
    ) {
      await updateTeamMember(actor, body.organizationId, id, {
        expiresAt: body.expiresAt,
        propertyIds: (body.propertyIds ?? []).filter(
          (value): value is string => typeof value === "string",
        ),
        role: body.role as OrganizationRole,
      });
    } else {
      return NextResponse.json(
        { error: "La acción solicitada no es válida." },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof TeamAuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof TeamValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "No hemos podido actualizar el acceso." },
      { status: 500 },
    );
  }
}
