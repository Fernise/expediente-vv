export const checklistSuggestions = [
  {title:"Comprobar la vigencia de las evidencias",category:"Evidencias",explanation:"Contrasta fechas y versiones de los documentos vinculados. Indica qué está caducado, sustituido o pendiente de revisar."},
  {title:"Contrastar los hechos declarados",category:"Datos del expediente",explanation:"Compara las respuestas del laboratorio con la documentación disponible. Conserva Sin dato si no existe información suficiente."},
  {title:"Documentar las observaciones pendientes",category:"Revisión",explanation:"Explica qué falta, qué evidencia puede resolverlo y quién coordina el siguiente paso. No des por resuelta una observación sin revisión."},
  {title:"Revisar el informe antes de compartirlo",category:"Revisión",explanation:"Comprueba alias, responsables, fechas, vínculos, limitaciones y decisiones registradas. Genera un PDF nuevo después de guardar cambios."},
] as const;

export const factGuides: Record<string,string> = {
  "dossier.identity_evidence_available":"¿Hay documentación que permita identificar este expediente? Sí: existe y puedes localizarla. No: no se ha aportado. Sin dato: no la has comprobado. Subir un archivo no demuestra que sea suficiente.",
  "dossier.contact_channel_available":"¿El equipo tiene un canal de contacto registrado para el propietario? En la beta, un contacto ficticio sirve para probar el flujo, pero no permite contactar con una persona real.",
  "dossier.relevant_dates_recorded":"¿Has registrado las fechas que conoces de emisión, vencimiento o seguimiento? Sin dato si todavía no sabes qué fechas corresponden. No inventes vencimientos jurídicos.",
};

export function validTaskDate(value:string):boolean {
  return value==="" || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value);
}
