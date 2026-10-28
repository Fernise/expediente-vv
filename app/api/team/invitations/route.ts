import { guardMutationRequest } from "@/lib/mutation-guard";
import { NextResponse } from "next/server";
import {
  inviteTeamMember,
  TeamAuthorizationError,
  TeamValidationError,
} from "@/db/team";
import { processNotificationDeliveryNow } from "@/db/notifications";
import type { OrganizationRole } from "@/db/organizations";
import { getOptionalActor } from "@/lib/auth";

export async function POST(request: Request) {
  const rejectedRequest = await guardMutationRequest(request);
  if (rejectedRequest) return rejectedRequest;

  const actor = await getOptionalActor();
  if (!actor) {
    return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    organizationId?: unknown;
    propertyIds?: unknown;
    role?: unknown;
  } | null;
  if (
    !body ||
    typeof body.email !== "string" ||
    typeof body.organizationId !== "string" ||
    typeof body.role !== "string" ||
    (body.propertyIds !== undefined && !Array.isArray(body.propertyIds))
  ) {
    return NextResponse.json(
      { error: "Revisa los datos de la invitación." },
      { status: 400 },
    );
  }

  try {
    const result = await inviteTeamMember(actor, body.organizationId, {
      email: body.email,
      propertyIds: (body.propertyIds ?? []).filter(
        (value): value is string => typeof value === "string",
      ),
      role: body.role as OrganizationRole,
    });
    if (result.kind === "member") {
      return NextResponse.json(result, { status: 201 });
    }

    try {
      const dispatch = await processNotificationDeliveryNow(result.deliveryId);
      return NextResponse.json(
        {
          kind: result.kind,
          deliveryStatus:
            dispatch.sent > 0
              ? "sent"
              : dispatch.failed > 0
                ? "failed"
                : "pending_provider",
        },
        { status: 201 },
      );
    } catch {
      return NextResponse.json(
        { kind: result.kind, deliveryStatus: "pending_provider" },
        { status: 201 },
      );
    }
  } catch (error) {
    return teamErrorResponse(error);
  }
}

function teamErrorResponse(error: unknown) {
  if (error instanceof TeamAuthorizationError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof TeamValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(
    { error: "No hemos podido preparar la invitación." },
    { status: 500 },
  );
}
