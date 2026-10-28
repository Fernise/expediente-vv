import { guardMutationRequest } from "@/lib/mutation-guard";
import { NextResponse } from "next/server";
import { listOrganizationsForActor } from "@/db/organizations";
import { getOptionalActor } from "@/lib/auth";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/lib/active-organization";

export async function POST(request: Request) {
  const rejectedRequest = await guardMutationRequest(request);
  if (rejectedRequest) return rejectedRequest;

  const actor = await getOptionalActor();

  if (!actor) {
    return NextResponse.json({ error: "Sesión no válida" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    organizationId?: string;
  } | null;
  const organizationId = body?.organizationId;

  if (!organizationId) {
    return NextResponse.json(
      { error: "Falta el espacio seleccionado" },
      { status: 400 },
    );
  }

  const organizations = await listOrganizationsForActor(actor);
  const organization = organizations.find(
    (candidate) => candidate.id === organizationId,
  );

  if (!organization) {
    return NextResponse.json(
      { error: "No tienes acceso a ese espacio" },
      { status: 403 },
    );
  }

  const response = NextResponse.json({
    organization: {
      id: organization.id,
      name: organization.name,
    },
  });
  response.cookies.set(ACTIVE_ORGANIZATION_COOKIE, organization.id, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
