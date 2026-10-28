"use client";
import { useState,type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/app/components/Language";
import type { DocumentRecord } from "@/db/properties";
export function EvidenceMetadataEditor({document,organizationId,propertyId,hasHistory}:{document:DocumentRecord;organizationId:string;propertyId:string;hasHistory:boolean}) {
  const {locale}=useLanguage();const en=locale==="en";const router=useRouter();const [open,setOpen]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();if(busy)return;setBusy(true);setError("");const data=Object.fromEntries(new FormData(event.currentTarget));
    try{const response=await fetch(`/api/properties/${propertyId}/documents/${document.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({...data,action:"metadata",organizationId})});const result=await response.json() as {error?:string};if(!response.ok){setError(result.error??"No se pudo guardar.");return;}setOpen(false);router.refresh();}catch{setError(en?"Could not confirm the save. Check before retrying.":"No se pudo confirmar el guardado. Comprueba antes de repetirlo.");}finally{setBusy(false);}}
  if(hasHistory)return <small>{en?"Metadata preserved by review history. Register a separate evidence item to correct it.":"Datos conservados por historial de revisión. Registra otra evidencia para corregirlos."}</small>;
  if(!open)return <button className="task-edit-button" type="button" onClick={()=>setOpen(true)}>{en?"Edit type and dates":"Editar tipo y fechas"}</button>;
  return <form className="task-editor" onSubmit={submit}><div className="form-grid">
    <label className="field field-span-2"><span>{en?"Document type":"Tipo de documento"}</span><input name="documentType" required minLength={2} maxLength={80} defaultValue={document.documentType} disabled={busy}/></label>
    <label className="field"><span>{en?"Issue date":"Fecha de emisión"}</span><input type="date" name="documentDate" defaultValue={document.documentDate??""} disabled={busy}/></label>
    <label className="field"><span>{en?"Expiry date, if known":"Vencimiento, si se conoce"}</span><input type="date" name="expiresAt" defaultValue={document.expiresAt??""} disabled={busy}/></label></div>
    <p>{en?"Do not invent expiry dates. The file, its versions and links stay unchanged.":"No inventes vencimientos. El archivo, sus versiones y sus vínculos no cambian."}</p>
    <div className="task-editor-actions"><button className="button button-primary" disabled={busy} type="submit">{en?"Save metadata":"Guardar datos"}</button><button className="button button-secondary" disabled={busy} type="button" onClick={()=>setOpen(false)}>{en?"Cancel":"Cancelar"}</button></div>{error?<p className="form-error" role="alert">{error}</p>:null}
  </form>;
}
