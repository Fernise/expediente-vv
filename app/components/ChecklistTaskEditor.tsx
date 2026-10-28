"use client";
import { FormEvent,useState,useEffect,useRef,useId } from "react";
import {createPortal} from "react-dom";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/app/components/Language";
import { PremiumSelect } from "@/app/components/PremiumSelect";
import {DatePicker} from "@/app/components/DatePicker";
import { checklistSuggestions } from "@/lib/checklist-plan";
import { useMutationRequest,uncertainMutationMessage } from "@/lib/mutation-request";
import type { ChecklistItemRecord,PropertyManagerOption } from "@/db/properties";
export function ChecklistTaskEditor({item,organizationId,propertyId,members,hasHistory=false,existingTitles=[]}:{item?:ChecklistItemRecord;organizationId:string;propertyId:string;members:PropertyManagerOption[];hasHistory?:boolean;existingTitles?:string[]}) {
  const {locale}=useLanguage();const en=locale==="en";const router=useRouter();const mutation=useMutationRequest();
  const [open,setOpen]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [confirm,setConfirm]=useState(false);
  const [itemKind,setItemKind]=useState(item?.itemKind??(item?"professional_requirement":"operational"));
  const [title,setTitle]=useState(item?.title??"");const [category,setCategory]=useState(item?.category??"Evidencias");const [explanation,setExplanation]=useState(item?.explanation??"");const [assignee,setAssignee]=useState(item?.assigneeUserId??"");
  const deletionBlocked=hasHistory||Boolean(item?.deletionBlocked);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(!mutation.begin())return;setBusy(true);setError("");
    const data=new FormData(event.currentTarget);
    const body=JSON.stringify({organizationId,action:"edit",itemKind,title,category,explanation,assigneeUserId:assignee,dueAt:String(data.get("dueAt")??"")});
    try {const response=await fetch(`/api/properties/${propertyId}/checklist${item?`/${item.id}`:""}`,{method:item?"PATCH":"POST",headers:{"content-type":"application/json",...await mutation.headers(body)},body});
      const result=await response.json() as {error?:string};if(!response.ok){if(response.status<500&&response.status!==409)mutation.clear();setError(result.error??"No se pudo guardar la tarea.");return;}
      mutation.clear();setOpen(false);if(!item){setTitle("");setExplanation("");}router.refresh();
    }catch{setError(uncertainMutationMessage);}finally{mutation.end();setBusy(false);}
  }
  async function remove() {
    if(!mutation.begin())return;setBusy(true);setError("");
    try {const response=await fetch(`/api/properties/${propertyId}/checklist/${item!.id}`,{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({organizationId})});const result=await response.json() as {error?:string};if(!response.ok){setError(result.error??"No se pudo eliminar la tarea.");return;}setConfirm(false);setOpen(false);router.refresh();}
    catch{setError(uncertainMutationMessage);}finally{mutation.end();setBusy(false);}
  }
  if(!open)return <button type="button" className={item?"task-edit-button":"button button-secondary"} onClick={()=>setOpen(true)}>{item?(en?"Edit task":"Editar tarea"):(en?"Add a task":"Añadir tarea")}</button>;
  return <div className="task-editor">
    <form onSubmit={submit}>
      <h3>{item?(en?"Edit task":"Editar tarea"):(en?"New checklist task":"Nueva tarea del checklist")}</h3>
      {hasHistory?<p role="status">{en?"Reviewed content is locked. Assignee and date can still be changed.":"Contenido revisado protegido. Puedes cambiar responsable y fecha."}</p>:null}
      {!item?<details className="task-suggestions"><summary>{en?"Optional suggestions":"Sugerencias opcionales"}</summary><p>{en?"They are not legal requirements. Add only what is relevant.":"No son requisitos jurídicos. Añade solo lo que aporte valor al expediente."}</p>{checklistSuggestions.map(s=><button type="button" key={s.title} disabled={existingTitles.some(t=>t.toLowerCase()===s.title.toLowerCase())} onClick={()=>{setTitle(s.title);setCategory(s.category);setExplanation(s.explanation);}}>{s.title}</button>)}</details>:null}
      <div className="form-grid">
        <div className="field field-span-2"><span>{en?"Item type":"Tipo de elemento"}</span><PremiumSelect ariaLabel={en?"Item type":"Tipo de elemento"} value={itemKind} onChange={value=>setItemKind(value as typeof itemKind)} disabled={busy||deletionBlocked||Boolean(item&&item.workflowStatus!=="pending")} options={[{value:"operational",label:en?"Operational task":"Tarea operativa",translate:false},{value:"professional_requirement",label:en?"Requirement for professional review":"Requisito para revisión profesional",translate:false}]}/><small>{itemKind==="operational"?(en?"Internal work; completion does not validate compliance.":"Gestión interna; completarla no valida cumplimiento."):(en?"Requires evidence and a professional decision. Not an official legal requirement.":"Cierre con evidencia y decisión profesional. No es un requisito jurídico oficial.")}</small></div>
        <label className="field field-span-2"><span>{en?"Title *":"Título *"}</span><input required minLength={2} maxLength={160} value={title} disabled={busy||hasHistory} onChange={e=>setTitle(e.target.value)}/></label>
        <label className="field"><span>{en?"Category *":"Categoría *"}</span><input required minLength={2} maxLength={60} value={category} disabled={busy||hasHistory} onChange={e=>setCategory(e.target.value)}/></label>
        <div className="field"><span>{en?"Target date":"Fecha objetivo"}</span><DatePicker name="dueAt" defaultValue={item?.dueAt?.slice(0,10)??""} disabled={busy}/></div>
        <label className="field field-span-2"><span>{en?"What to check and how *":"Qué comprobar y cómo *"}</span><textarea required minLength={2} maxLength={800} value={explanation} disabled={busy||hasHistory} onChange={e=>setExplanation(e.target.value)}/><small>{explanation.length}/800</small></label>
        <div className="field field-span-2"><span>{en?"Assignee":"Responsable"}</span><PremiumSelect ariaLabel={en?"Task assignee":"Responsable de esta tarea"} value={assignee} onChange={setAssignee} disabled={busy} options={[{label:en?"Unassigned":"Sin asignar",value:"",translate:false},...members.map(m=>({label:m.name,value:m.id,translate:false}))]}/><small>{en?"Assigns work, not review permissions.":"Asigna trabajo, no permisos de revisión."}</small></div>
      </div>
      <div className="task-editor-actions"><button className="button button-primary" disabled={busy} type="submit">{busy?(en?"Saving…":"Guardando…"):(en?"Save task":"Guardar tarea")}</button><button className="button button-secondary" disabled={busy} type="button" onClick={()=>{setOpen(false);setConfirm(false);}}>{en?"Cancel":"Cancelar"}</button>
      {item?<button className="task-delete-button" type="button" disabled={busy||deletionBlocked} onClick={()=>{setError("");setConfirm(true);}}>{en?"Delete task":"Eliminar tarea"}</button>:null}</div>
      {item&&deletionBlocked?<small className="task-deletion-blocked" role="status">{en?"Cannot delete: evidence, comments or review history must be preserved.":"No se puede eliminar: conserva evidencias, comentarios o historial de revisión."}</small>:null}
      <details className="editor-help"><summary>{en?"Editing rules":"Reglas de edición"}</summary><p>{en?"Category groups work, not legal phases. Type can only change while pending with no evidence, comments or reviews. Save before generating a new PDF; earlier copies do not update.":"La categoría agrupa trabajo, no fases jurídicas. El tipo solo cambia si está pendiente y sin evidencias, comentarios ni revisiones. Guarda antes de generar un nuevo PDF; las copias anteriores no se actualizan."}</p></details>
    </form>
    {confirm&&item?<TaskDeleteDialog title={item.title} en={en} busy={busy} error={error} onConfirm={remove} onCancel={()=>{setConfirm(false);setError("");}}/>:null}
    {error&&!confirm?<p className="form-error" role="alert">{error}</p>:null}
  </div>;
}

function TaskDeleteDialog({title,en,busy,error,onConfirm,onCancel}:{title:string;en:boolean;busy:boolean;error:string;onConfirm:()=>void;onCancel:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);const id=useId();
  useEffect(()=>{const element=dialog.current;element?.showModal();return()=>element?.close();},[]);
  return createPortal(<dialog ref={dialog} className="task-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();if(!busy)onCancel();}}} onCancel={event=>{event.preventDefault();if(!busy)onCancel();}}>
    <h3 id={`${id}-title`}>{en?"Delete this task?":"¿Eliminar esta tarea?"}</h3>
    <p className="task-delete-title">{title}</p><p id={`${id}-description`}>{en?"This cannot be undone. The deletion is recorded in the audit log.":"No se puede deshacer. La eliminación queda registrada en auditoría."}</p>
    {error?<p className="form-error" role="alert">{error}</p>:null}
    <div className="task-editor-actions"><button type="button" className="button button-secondary" autoFocus disabled={busy} onClick={onCancel}>{en?"Keep task":"Conservar tarea"}</button><button type="button" className="button task-confirm-delete" disabled={busy} onClick={onConfirm}>{busy?(en?"Deleting…":"Eliminando…"):(en?"Confirm deletion":"Confirmar eliminación")}</button></div>
  </dialog>,document.body);
}
