import { guardMutationRequest } from "@/lib/mutation-guard";
import { NextResponse } from "next/server";
import {
  PilotLeadValidationError,
  submitPilotDemoRequest,
} from "@/db/pilot-leads";

export async function POST(request: Request) {
  const rejectedRequest = await guardMutationRequest(request);
  if (rejectedRequest) return rejectedRequest;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 });
  }
  if (stringValue(body.website)) {
    return NextResponse.json({ ok: true }, { status: 202 });
  }

  try {
    await submitPilotDemoRequest({
      communicationsConsent: body.communicationsConsent === true,
      email: stringValue(body.email),
      fullName: stringValue(body.fullName),
      message: stringValue(body.message),
      organizationName: stringValue(body.organizationName),
      privacyAccepted: body.privacyAccepted === true,
      professionalProfile: stringValue(body.professionalProfile),
      propertyRange: stringValue(body.propertyRange),
      source: "public_demo_form",
    });
    return NextResponse.json(
      { ok: true },
      {
        headers: { "cache-control": "no-store" },
        status: 201,
      },
    );
  } catch (error) {
    if (error instanceof PilotLeadValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "No hemos podido guardar la solicitud. Inténtalo de nuevo." },
      { status: 500 },
    );
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
