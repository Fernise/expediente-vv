import { guardMutationRequest } from "@/lib/mutation-guard";
import { NextResponse } from "next/server";
import {
  AuthorizationError,
  NotFoundError,
  updateChecklistItem,
  ValidationError,
  manageChecklistTask,
} from "@/db/properties";
import { getOptionalActor } from "@/lib/auth";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; itemId: string }> },
) {
  const rejectedRequest = await guardMutationRequest(request);
  if (rejectedRequest) return rejectedRequest;

  const actor = await getOptionalActor();
  if (!actor) {
    return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  }
  const { id, itemId } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 });
  }
  if (
    typeof body.organizationId !== "string" ||
    (typeof body.status !== "string" && body.action !== "edit")
  ) {
    return NextResponse.json({ error: "Datos incompletos." }, { status: 400 });
  }

  try {
    if(body.action==="edit") {
      const str=(key:string)=>typeof body[key]==="string"?body[key] as string:"";
      const item=await manageChecklistTask(actor,{organizationId:body.organizationId,propertyId:id,itemId,action:"edit",itemKind:str("itemKind"),title:str("title"),category:str("category"),explanation:str("explanation"),dueAt:str("dueAt"),assigneeUserId:str("assigneeUserId")});
      return NextResponse.json({item});
    }
    const dossierStatus = await updateChecklistItem(
      actor,
      body.organizationId,
      id,
      itemId,
      body.status as string,
    );
    return NextResponse.json({ dossierStatus });
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
    return NextResponse.json({ error: "No se pudo actualizar." }, { status: 500 });
  }
}

export async function DELETE(request:Request, context:{params:Promise<{id:string;itemId:string}>}) {
  const rejectedRequest = await guardMutationRequest(request);
  if(rejectedRequest)return rejectedRequest;
  const actor=await getOptionalActor();if(!actor)return NextResponse.json({error:"Debes iniciar sesión."},{status:401});
  let body:{organizationId?:unknown};
  try {body=await request.json();if(!body || typeof body.organizationId!=="string")throw Error();}catch{return NextResponse.json({error:"Solicitud no válida."},{status:400});}
  const {id,itemId}=await context.params;
  try {await manageChecklistTask(actor,{organizationId:body.organizationId as string,propertyId:id,itemId,action:"delete"});return NextResponse.json({ok:true});}
  catch(error){const status=error instanceof AuthorizationError?403:error instanceof NotFoundError?404:error instanceof ValidationError?400:500;return NextResponse.json({error:status===500?"No se pudo eliminar la tarea.":(error as Error).message},{status});}
}
