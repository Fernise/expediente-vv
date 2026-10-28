import { NextResponse } from "next/server";
import { getMembershipContext } from "@/db/organizations";
import { getOptionalActor } from "@/lib/auth";
import { guardMutationRequest } from "@/lib/mutation-guard";
import { can, type Role } from "@/lib/permissions";
import {
  DAILY_CRON,
  NOTIFICATION_CRON,
  runClaimedScheduledCycle,
} from "@/lib/scheduled-operations";

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
    (body.cycle !== "daily" && body.cycle !== "notifications")
  ) {
    return NextResponse.json({ error: "Datos incompletos." }, { status: 400 });
  }

  const membership = await getMembershipContext(actor, body.organizationId);
  if (!membership || !can(membership.role as Role, "operations.run")) {
    return NextResponse.json({ error: "No tienes permiso para ejecutar esta comprobación." }, { status: 403 });
  }

  try {
    const executed = await runClaimedScheduledCycle(
      body.cycle === "daily" ? DAILY_CRON : NOTIFICATION_CRON,
    );
    return NextResponse.json({ executed });
  } catch {
    return NextResponse.json(
      { error: "La comprobación ha fallado. Consulta el estado operativo." },
      { status: 500 },
    );
  }
}
