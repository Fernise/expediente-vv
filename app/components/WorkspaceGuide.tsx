"use client";
import { useLanguage } from "@/app/components/Language";
export function WorkspaceGuide() {
  const { locale } = useLanguage();
  const en = locale === "en";
  return <details className="workspace-guide"><summary>{en ? "Accounts, team and report responsibilities" : "Cuentas, equipo y responsables de los informes"}</summary><div>
    <h3>{en ? "Account → workspace → role" : "Cuenta → espacio → rol"}</h3>
    <p>{en ? "Each person uses their own ChatGPT account. The workspace administrator invites members under Team and assigns roles and property access. Site access is separate: a team invitation alone does not open this private Site." : "Cada persona utiliza su propia cuenta de ChatGPT. La administración invita miembros desde Equipo y asigna roles y acceso a viviendas. El acceso al Site es independiente: una invitación al equipo no abre por sí sola este Site privado."}</p>
    <h3>{en ? "Where is the coordinator selected?" : "¿Dónde se elige al responsable?"}</h3>
    <p>{en ? "The creator is initially the property coordinator. Change this under Property → Edit → Responsible. The list contains active team members with access to that property. The owner alias and fictional contact fields do not create accounts or grant access." : "Al crear la vivienda, quien la crea queda como responsable inicial. Se cambia en Vivienda → Editar → Responsable. La lista contiene miembros activos del equipo con acceso a esa vivienda. El alias y los contactos ficticios del propietario no crean cuentas ni conceden acceso."}</p>
    <h3>{en ? "Coordinator, task assignee and reviewer" : "Coordinador, responsable de tarea y revisor"}</h3>
    <p>{en ? "Responsible in the PDF means the property coordinator. Checklist tasks may retain a different assignee. Changing the coordinator does not reassign existing tasks or grant review permissions. Reviews record who performed them; the PDF is not a legal certificate or a digitally signed professional opinion." : "Responsable en el PDF significa coordinador de la vivienda. Las tareas del checklist pueden conservar otra persona asignada. Cambiar al coordinador no reasigna las tareas existentes ni concede permisos de revisión. Las revisiones registran quién las realiza; el PDF no es un certificado jurídico ni un dictamen profesional firmado digitalmente."}</p>
    <h3>{en ? "Roles" : "Roles"}</h3>
    <p>{en ? "Administration manages members and workspace controls. Managers coordinate properties and documents. Professionals review within their granted scope. Owners have restricted access to assigned properties. Appearing as coordinator does not expand account permissions." : "La administración gestiona miembros y controles del espacio. Los gestores coordinan viviendas y documentos. Los profesionales revisan dentro de su acceso concedido. Los propietarios tienen acceso restringido a sus viviendas asignadas. Figurar como responsable no amplía los permisos de la cuenta."}</p>
  </div></details>;
}
