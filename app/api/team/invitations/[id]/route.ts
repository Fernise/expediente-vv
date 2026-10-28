import { guardMutationRequest } from "@/lib/mutation-guard";
import { NextResponse } from "next/server";
import {
  prepareTeamInvitationResend,
  revokeTeamInvitation,
  TeamAuthorizationError,
  TeamValidationError,
} from "@/db/team";
import { processNotificationDeliveryNow } from "@/db/notifications";
import { getOptionalActor } from "@/lib/auth";

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
  const body = (await request.json().catch(() => null)) as {
    organizationId?: unknown;
  } | null;
  if (!body || typeof body.organizationId !== "string") {
    return NextResponse.json(
      { error: "Falta el espacio de trabajo." },
      { status: 400 },
    );
  }

  try {
    const { id } = await context.params;
    await revokeTeamInvitation(actor, body.organizationId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof TeamAuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof TeamValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "No hemos podido cancelar la invitación." },
      { status: 500 },
    );
  }
}

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
    organizationId?: unknown;
  } | null;
  if (!body || typeof body.organizationId !== "string") {
    return NextResponse.json(
      { error: "Falta el espacio de trabajo." },
      { status: 400 },
    );
  }

  try {
    const { id } = await context.params;
    const delivery = await prepareTeamInvitationResend(
      actor,
      body.organizationId,
      id,
    );
    const dispatch = await processNotificationDeliveryNow(delivery.deliveryId);
    return NextResponse.json({
      deliveryStatus:
        dispatch.sent > 0
          ? "sent"
          : dispatch.failed > 0
            ? "failed"
            : "pending_provider",
    });
  } catch (error) {
    if (error instanceof TeamAuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof TeamValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "No hemos podido reenviar la invitación." },
      { status: 500 },
    );
  }
}
