// Fictional, deterministic PDF examples; no database access or personal data.
import {mkdir,writeFile} from 'node:fs/promises';
import {createPropertyReport} from '../lib/property-report.ts';
const dossier={
  activityStatus:'active',addressLine:'Calle Ejemplo 1',alias:'VV-DEMO · Adeje',archivedAt:null,cadastralReference:'DEMO-ADEJE',
  checklist:{generatedAt:'2026-10-10T12:00:00Z',id:'demo-checklist',ruleVersionLabel:'VV-DEMO · 0.1',validationStatus:'draft_unvalidated'},
  checklistItems:[
    ['Datos del expediente','Completar los datos básicos del expediente','Comprueba que la información básica aportada está completa y actualizada.','in_review'],
    ['Evidencias','Reunir la documentación identificativa disponible','Añade la documentación identificativa disponible. Este elemento no define un requisito jurídico.','document_requested'],
    ['Fechas','Registrar fechas relevantes y vencimientos','Registra las fechas conocidas para poder preparar avisos y revisiones.','observed'],
    ['Responsabilidad','Designar responsable de la siguiente acción','Asigna la siguiente acción a una persona de la organización.','pending'],
    ['Revisión','Preparar el expediente para revisión profesional','Solicita revisión cuando la documentación esté preparada. No equivale a una certificación.','document_requested'],
  ].map(([category,title,explanation,workflowStatus],index)=>({id:`demo-${index}`,position:index+1,category,title,explanation,workflowStatus,itemKind:'professional_requirement',assigneeName:'Equipo de prueba',dueAt:null})),
  comments:[],documents:[],reviews:[],evidenceLinks:[],dossierStatus:'requires_professional_review',dataProfile:'pilot_anonymized',id:'demo-adeje',
  internalReference:'VV-DEMO-001',islandCode:'TF',managerName:'Equipo de prueba',municipality:'Adeje',nextAction:'Solicitar documentación pendiente',nextActionDueAt:'2026-10-16',
  organizationId:'demo-org',ownerEmail:null,ownerName:'Propietario 01',ownerPhone:null,postalCode:'38670',
};
await mkdir(new URL('../output/pdf/',import.meta.url),{recursive:true});
for(const locale of ['es','en']){
  const laboratory={facts:['Canal de contacto registrado','Evidencia identificativa disponible','Fechas relevantes registradas'].map(label=>({label,value:null})),evaluation:null};
  const bytes=await createPropertyReport({dossier,organizationName:'Muestra de diseño · Datos ficticios',generatedAt:new Date('2026-10-10T12:00:00Z'),locale,laboratory});
  const destination=new URL(`../output/pdf/informe-muestra-${locale}.pdf`,import.meta.url);
  await writeFile(destination,bytes);
  console.log(decodeURIComponent(destination.pathname));
}
