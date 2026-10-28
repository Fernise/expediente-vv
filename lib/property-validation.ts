import {isIslandCode,municipalityNameForIsland} from "./canary-data.ts";
import {syntheticPropertyError,isPilotOwnerAlias,directIdentifierLabel} from "./pilot-data.ts";
import {validTaskDate} from "./checklist-plan.ts";
export type PropertyFieldErrors=Record<string,string>;
export function validContactEmail(value:string):boolean {
  const email=value.trim();if(!email)return true;
  if(email.length>254||!/^[^\s@]+@[^\s@]+$/.test(email))return false;
  const [local,domain]=email.split("@");
  if(local.length>64||! /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)||local.startsWith(".")||local.endsWith(".")||local.includes(".."))return false;
  const labels=domain.split(".");
  return labels.length>=2 && labels.every(label=>label.length>=1&&label.length<=63&&/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)) && /^(?:[a-z]{2,63}|xn--[a-z0-9-]+)$/i.test(labels.at(-1)!);
}
export function propertyFieldErrors(input:object):PropertyFieldErrors {
  const value=(key:string)=>typeof (input as Record<string,unknown>)[key]==="string"?((input as Record<string,string>)[key]).trim():"";
  const errors:PropertyFieldErrors={};const island=value("islandCode"),postal=value("postalCode");
  if(value("alias").length<2||value("alias").length>80)errors.alias="Escribe un alias de vivienda de entre 2 y 80 caracteres.";
  if(!isIslandCode(island))errors.islandCode="Selecciona una isla válida.";
  if(!municipalityNameForIsland(island,value("municipality")))errors.municipality="Selecciona un municipio de la lista de la isla elegida.";
  if(!/^\d{5}$/.test(postal))errors.postalCode="Introduce un código postal de 5 cifras.";
  else if(isIslandCode(island)) {
    const prefix=["GC","LZ","FV","GR"].includes(island)?"35":"38";
    if(!postal.startsWith(prefix))errors.postalCode=`El código postal debe comenzar por ${prefix} para la provincia de la isla seleccionada.`;
  }
  if(value("ownerName").length<2||value("ownerName").length>120)errors.ownerName="Escribe un alias de propietario de entre 2 y 120 caracteres.";
  if(value("ownerEmail").length>180||!validContactEmail(value("ownerEmail")))errors.ownerEmail="El correo no tiene un formato válido. Ejemplo: propietario02@example.invalid.";
  if(!validTaskDate(value("nextActionDueAt")))errors.nextActionDueAt="Selecciona una fecha objetivo válida en el calendario.";
  if(value("nextAction").length>160)errors.nextAction="La siguiente acción no puede superar 160 caracteres.";
  if(value("addressLine").length>180)errors.addressLine="La dirección no puede superar 180 caracteres.";
  if(value("cadastralReference").length>30)errors.cadastralReference="La referencia no puede superar 30 caracteres.";
  if(value("ownerPhone").length>30)errors.ownerPhone="El teléfono no puede superar 30 caracteres.";
  if(value("dataProfile")==="pilot_anonymized") {
    for(const field of ["addressLine","cadastralReference","ownerEmail","ownerPhone"]) {
      const message=syntheticPropertyError({[field]:value(field)});
      if(message&&!errors[field])errors[field]=message;
    }
    if(!isPilotOwnerAlias(value("ownerName")))errors.ownerName="Usa un alias como Propietario 02 o Titular A-2; debe incluir un número.";
    for(const field of ["alias","nextAction"])if(directIdentifierLabel(value(field)))errors[field]="Retira los identificadores personales de este campo para mantener la prueba anonimizada.";
  }
  return errors;
}
