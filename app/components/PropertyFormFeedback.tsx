"use client";
import {useEffect,useRef,useState,type RefObject} from "react";
import {createPortal} from "react-dom";
import {useLanguage} from "@/app/components/Language";
import {propertyFieldErrors,type PropertyFieldErrors} from "@/lib/property-validation";
export function propertyFieldTarget(form:HTMLFormElement,name:string):HTMLElement|null {
  const input=form.querySelector<HTMLElement>(`[name="${name}"]`);
  if(name==="municipality")return form.querySelector<HTMLElement>("[data-municipality-search]")??input?.closest<HTMLElement>(".field")??null;
  if(input instanceof HTMLInputElement && input.type==="hidden")return input.closest<HTMLElement>(".field")?.querySelector<HTMLElement>("button")??input.closest<HTMLElement>(".field")??null;
  return input??null;
}
export function usePropertyFormFeedback() {
  const formRef=useRef<HTMLFormElement>(null);const [errors,setErrors]=useState<PropertyFieldErrors>({});
  function validate(payload:object){const next=propertyFieldErrors(payload);setErrors(next);if(Object.keys(next).length){requestAnimationFrame(()=>{formRef.current?.querySelector<HTMLElement>(".form-error-summary")?.focus();});return false;}return true;}
  function recheck(){if(Object.keys(errors).length)requestAnimationFrame(()=>{if(formRef.current)setErrors(propertyFieldErrors(Object.fromEntries(new FormData(formRef.current).entries())));});}
  return {formRef,errors,setErrors,validate,recheck};
}
const fieldLabels:Record<string,string>={alias:"Alias de vivienda",islandCode:"Isla",municipality:"Municipio",postalCode:"Código postal",ownerName:"Alias del propietario",ownerEmail:"Correo",ownerPhone:"Teléfono",addressLine:"Dirección",cadastralReference:"Referencia catastral",nextAction:"Siguiente acción",nextActionDueAt:"Fecha objetivo"};
export function PropertyFormFeedback({formRef,errors}:{formRef:RefObject<HTMLFormElement|null>;errors:PropertyFieldErrors}) {
  const {t,locale}=useLanguage();const [,redraw]=useState(0);
  useEffect(()=>{redraw(n=>n+1);},[]);
  useEffect(()=>{const form=formRef.current;if(!form)return;for(const [name] of Object.entries(fieldLabels)){
    const target=propertyFieldTarget(form,name);if(!target)continue;
    target.setAttribute("aria-invalid",errors[name]?"true":"false");
    const tokens=(target.getAttribute("aria-describedby")??"").split(/\s+/).filter(token=>token&&token!==`property-error-${name}`);
    if(errors[name])tokens.push(`property-error-${name}`);
    if(tokens.length)target.setAttribute("aria-describedby",tokens.join(" "));else target.removeAttribute("aria-describedby");
  }},[errors,formRef]);
  if(!Object.keys(errors).length)return null;
  return <><div className="form-error-summary" role="alert" tabIndex={-1}><strong>{locale==="en"?"The property has not been saved. Correct these fields:":"La vivienda no se ha guardado. Corrige estos campos:"}</strong><ul>{Object.entries(errors).map(([name,message])=><li key={name}><button type="button" onClick={()=>{const target=formRef.current&&propertyFieldTarget(formRef.current,name);target?.scrollIntoView({block:"center",behavior:"smooth"});target?.focus();}}>{t(fieldLabels[name]??name)}: {t(message)}</button></li>)}</ul></div>
    {Object.entries(errors).map(([name,message])=>{const target=formRef.current&&propertyFieldTarget(formRef.current,name);const field=target?.closest(".field");return field?createPortal(<small id={`property-error-${name}`} className="field-error-message">{t(message)}</small>,field,name):null;})}
  </>;
}
