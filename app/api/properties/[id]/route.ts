import { guardMutationRequest } from "@/lib/mutation-guard";
import { NextResponse } from "next/server";
import {
  archiveProperty,
  AuthorizationError,
  NotFoundError,
  updateProperty,
  ValidationError,
  PropertyFieldValidationError,
} from "@/db/properties";
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
  const { id } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 });
  }
  if (
    !["archive", "update"].includes(String(body.action ?? "")) ||
    typeof body.organizationId !== "string"
  ) {
    return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
  }

  try {
    if (body.action === "archive") {
      await archiveProperty(actor, body.organizationId, id);
    } else {
      await updateProperty(actor, {
        activityStatus: stringValue(body.activityStatus),
        addressLine: stringValue(body.addressLine),
        alias: stringValue(body.alias),
        cadastralReference: stringValue(body.cadastralReference),
        dataProfile: stringValue(body.dataProfile),
        islandCode: stringValue(body.islandCode),
        managerUserId: stringValue(body.managerUserId),
        municipality: stringValue(body.municipality),
        nextAction: stringValue(body.nextAction),
        nextActionDueAt: stringValue(body.nextActionDueAt),
        organizationId: body.organizationId,
        ownerEmail: stringValue(body.ownerEmail),
        ownerName: stringValue(body.ownerName),
        ownerPhone: stringValue(body.ownerPhone),
        postalCode: stringValue(body.postalCode),
        propertyId: id,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message,fieldErrors:error instanceof PropertyFieldValidationError?error.fieldErrors:undefined }, { status: 400 });
    }
    return NextResponse.json(
      {
        error:
          body.action === "archive"
            ? "No se pudo archivar."
            : "No se pudieron guardar los cambios.",
      },
      { status: 500 },
    );
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
