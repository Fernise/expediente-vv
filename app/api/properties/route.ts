import { guardMutationRequest } from "@/lib/mutation-guard";
import { NextResponse } from "next/server";
import {
  AuthorizationError,
  createProperty,
  ValidationError,
  PropertyFieldValidationError,
} from "@/db/properties";
import { getOptionalActor } from "@/lib/auth";
import { mutationReceipt } from "@/db/mutation-receipts";

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
    return NextResponse.json(
      { error: "La solicitud no tiene un formato válido." },
      { status: 400 },
    );
  }

  try {
    return await mutationReceipt(actor, stringValue(body.organizationId), request.headers.get("idempotency-key"), JSON.stringify(body), "property.create", null, async () => {
    const property = await createProperty(actor, {
      activityStatus: stringValue(body.activityStatus),
      addressLine: stringValue(body.addressLine),
      alias: stringValue(body.alias),
      cadastralReference: stringValue(body.cadastralReference),
      dataProfile: stringValue(body.dataProfile),
      islandCode: stringValue(body.islandCode),
      municipality: stringValue(body.municipality),
      nextAction: stringValue(body.nextAction),
      nextActionDueAt: stringValue(body.nextActionDueAt),
      organizationId: stringValue(body.organizationId),
      ownerEmail: stringValue(body.ownerEmail),
      ownerName: stringValue(body.ownerName),
      ownerPhone: stringValue(body.ownerPhone),
      postalCode: stringValue(body.postalCode),
    });
    return NextResponse.json({ property }, { status: 201 });
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message,fieldErrors:error instanceof PropertyFieldValidationError?error.fieldErrors:undefined }, { status: 400 });
    }
    return NextResponse.json(
      { error: "No hemos podido crear la vivienda." },
      { status: 500 },
    );
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
