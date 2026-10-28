import { guardMutationRequest } from "@/lib/mutation-guard";
import { NextResponse } from "next/server";
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from "@/db/properties";
import {
  changeRuleWorkflow,
  type RuleWorkflowAction,
} from "@/db/rules";
import { getOptionalActor } from "@/lib/auth";

const allowedActions = new Set<RuleWorkflowAction>([
  "submitted",
  "withdrawn",
  "changes_requested",
  "professionally_reviewed",
  "approved",
]);

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
    typeof body.ruleSetVersionId !== "string" ||
    typeof body.action !== "string" ||
    !allowedActions.has(body.action as RuleWorkflowAction)
  ) {
    return NextResponse.json({ error: "Datos incompletos." }, { status: 400 });
  }

  try {
    const workflow = await changeRuleWorkflow(actor, {
      action: body.action as RuleWorkflowAction,
      note: typeof body.note === "string" ? body.note : undefined,
      organizationId: body.organizationId,
      ruleSetVersionId: body.ruleSetVersionId,
    });
    return NextResponse.json({ workflow });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "No se pudo actualizar el circuito editorial." },
      { status: 500 },
    );
  }
}
