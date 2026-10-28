import { NextResponse } from "next/server";
import { getOptionalActor } from "@/lib/auth";
import { guardMutationRequest } from "@/lib/mutation-guard";
import { mutationReceipt } from "@/db/mutation-receipts";
import { AuthorizationError, NotFoundError, ValidationError, manageChecklistTask } from "@/db/properties";
export async function POST(request:Request, context:{params:Promise<{id:string}>}) {
  const rejectedRequest = await guardMutationRequest(request);
  if(rejectedRequest)return rejectedRequest;
  const actor=await getOptionalActor();if(!actor)return NextResponse.json({error:"Debes iniciar sesión."},{status:401});
  let body:Record<string,unknown>;
  try {body=await request.json();if(!body || typeof body!=="object")throw Error();} catch {return NextResponse.json({error:"Solicitud no válida."},{status:400});}
  const {id}=await context.params;
  const str=(key:string)=>typeof body[key]==="string"?body[key] as string:"";
  try {
    return await mutationReceipt(actor,str("organizationId"),request.headers.get("idempotency-key"),JSON.stringify(body),"checklist.create",id,async()=>{
      const item=await manageChecklistTask(actor,{organizationId:str("organizationId"),propertyId:id,action:"create",itemKind:str("itemKind"),title:str("title"),category:str("category"),explanation:str("explanation"),dueAt:str("dueAt"),assigneeUserId:str("assigneeUserId")});
      return NextResponse.json({item},{status:201});
    });
  } catch(error) {
    const status=error instanceof AuthorizationError?403:error instanceof NotFoundError?404:error instanceof ValidationError?400:500;
    return NextResponse.json({error:status===500?"No se pudo guardar la tarea.":(error as Error).message},{status});
  }
}
