"use client";
import { I18nText, LocalizedControl } from "@/app/components/Language";


import {
  CalendarClock,
  Check,
  Home,
  Mail,
  RotateCw,
  Save,
  ShieldCheck,
  Trash2,
  UserPlus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { PremiumSelect } from "@/app/components/PremiumSelect";
import type { OrganizationRole } from "@/db/organizations";
import type { TeamInvitation, TeamMember } from "@/db/team";
import { useMutationRequest } from "@/lib/mutation-request";

type PropertyOption = {
  id: string;
  name: string;
};

type TeamManagementProps = {
  emailProviderConfigured: boolean;
  emailSender: string;
  invitations: TeamInvitation[];
  members: TeamMember[];
  organizationId: string;
  properties: PropertyOption[];
};

const roleOptions: Array<{
  description: string;
  label: string;
  value: OrganizationRole;
}> = [
  {
    description: "Gestiona equipo, viviendas y configuración",
    label: "Administrador/a",
    value: "organization_admin",
  },
  {
    description: "Gestiona todos los expedientes del espacio",
    label: "Gestor/a",
    value: "manager",
  },
  {
    description: "Revisa únicamente viviendas concedidas",
    label: "Profesional",
    value: "professional",
  },
  {
    description: "Consulta y aporta documentos en sus viviendas",
    label: "Propietario/a",
    value: "owner",
  },
];

export function TeamManagement({
  emailProviderConfigured,
  emailSender,
  invitations,
  members,
  organizationId,
  properties,
}: TeamManagementProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrganizationRole>("manager");
  const [propertyIds, setPropertyIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const invitationMutation = useMutationRequest();
  const [invitationFeedback, setInvitationFeedback] = useState<{
    id: string;
    message: string;
    tone: "error" | "success";
  } | null>(null);
  const limitedRole = isLimitedRole(role);

  async function submitInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/team/invitations", {
        body: JSON.stringify({
          email,
          organizationId,
          propertyIds: limitedRole ? propertyIds : [],
          role,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as {
        deliveryStatus?: "failed" | "pending_provider" | "sent";
        error?: string;
        kind?: "invitation" | "member";
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo preparar la invitación.");
      }
      setEmail("");
      setPropertyIds([]);
      setSuccess(
        payload.kind === "member"
          ? "La persona ya tenía cuenta y se ha añadido al espacio."
          : payload.deliveryStatus === "sent"
            ? "Invitación enviada por Gmail."
            : payload.deliveryStatus === "failed"
              ? "Invitación creada. Gmail necesita revisión antes de poder entregarla."
              : emailProviderConfigured
                ? "Invitación creada. El correo queda en cola para reintento automático."
            : "Invitación y correo preparados. El envío quedará pendiente hasta autorizar Gmail.",
      );
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo preparar la invitación.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelInvitation(invitationId: string) {
    if (!invitationMutation.begin()) return;
    setCancelingId(invitationId);
    setError("");
    setSuccess("");
    setInvitationFeedback(null);
    try {
      const response = await fetch(`/api/team/invitations/${invitationId}`, {
        body: JSON.stringify({ organizationId }),
        headers: { "content-type": "application/json" },
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        const message = payload.error ?? "No se pudo cancelar la invitación.";
        setError(message);
        setInvitationFeedback({ id: invitationId, message, tone: "error" });
        return;
      }
      setSuccess("Invitación cancelada.");
      router.refresh();
    } catch {
      const message = "No hemos podido confirmar la cancelación. Comprueba las invitaciones pendientes al recuperar la conexión antes de volver a intentarlo.";
      setError(message);
      setInvitationFeedback({ id: invitationId, message, tone: "error" });
    } finally {
      invitationMutation.end();
      setCancelingId(null);
    }
  }

  async function resendInvitation(invitationId: string) {
    if (!invitationMutation.begin()) return;
    setResendingId(invitationId);
    setInvitationFeedback(null);
    try {
      const response = await fetch(`/api/team/invitations/${invitationId}`, {
        body: JSON.stringify({ organizationId }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response.json()) as {
        deliveryStatus?: "failed" | "pending_provider" | "sent";
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo reenviar la invitación.");
      }
      setInvitationFeedback({
        id: invitationId,
        message:
          payload.deliveryStatus === "sent"
            ? "Invitación reenviada por Gmail."
            : payload.deliveryStatus === "failed"
              ? "Gmail no pudo entregarla. Revisa el estado antes de reintentar."
              : "El reenvío ha quedado en cola.",
        tone: payload.deliveryStatus === "failed" ? "error" : "success",
      });
      router.refresh();
    } catch (caught) {
      setInvitationFeedback({
        id: invitationId,
        message:
          caught instanceof Error
            ? caught.message
            : "No se pudo reenviar la invitación.",
        tone: "error",
      });
    } finally {
      invitationMutation.end();
      setResendingId(null);
    }
  }

  return (
    <div className="team-layout">
      <section className="team-invite-card">
        <div className="section-heading">
          <div>
            <span className="section-icon"><UserPlus aria-hidden="true" /></span>
            <h2><I18nText>Invitar a una persona</I18nText></h2>
            <p><I18nText>Elige su función y el alcance antes de darle acceso.</I18nText></p>
          </div>
        </div>
        <form className="team-invite-form" onSubmit={submitInvitation}>
          <label className="team-field">
            <span><I18nText>Correo electrónico</I18nText></span>
            <LocalizedControl as="input"
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="persona@equipo.es"
              required
              type="email"
              value={email}
            />
          </label>
          <div className="team-field">
            <span><I18nText>Rol</I18nText></span>
            <PremiumSelect
              ariaLabel="Rol de la persona invitada"
              onChange={(nextRole) => {
                setRole(nextRole as OrganizationRole);
                setPropertyIds([]);
              }}
              options={roleOptions}
              value={role}
            />
          </div>
          {limitedRole ? (
            <PropertySelector
              onChange={setPropertyIds}
              properties={properties}
              selected={propertyIds}
            />
          ) : (
            <div className="team-scope-note">
              <ShieldCheck aria-hidden="true" />
              <span>
                <strong><I18nText>Acceso a todo el espacio</I18nText></strong>
                <small><I18nText>Podrá ver todas las viviendas según su rol.</I18nText></small>
              </span>
            </div>
          )}
          <button
            className="button button-primary"
            disabled={
              submitting ||
              email.trim().length < 5 ||
              (limitedRole && propertyIds.length === 0)
            }
            type="submit"
          >
            <UserPlus aria-hidden="true" />
            <I18nText>{submitting ? "Enviando…" : "Preparar invitación"}</I18nText>
          </button>
          <p className="team-provider-note">
            <Mail aria-hidden="true" />
            {emailProviderConfigured
              ? `Los correos salen desde ${emailSender} y conservan un registro de entrega.`
              : `La cola está lista para ${emailSender}. Hasta autorizar Google, comparte la invitación por el canal acordado.`}
          </p>
          {error ? <p className="form-error" role="alert"><I18nText>{error}</I18nText></p> : null}
          {success ? (
            <p className="success-message" role="status">
              <Check aria-hidden="true" /> {success}
            </p>
          ) : null}
        </form>
      </section>

      <div className="team-directory">
        <section className="team-list-card">
          <div className="section-heading">
            <div>
              <h2><I18nText>Personas con acceso</I18nText></h2>
              <p>{members.length}<I18nText> miembro</I18nText><I18nText>{members.length === 1 ? "" : "s"}</I18nText><I18nText> activo</I18nText><I18nText>{members.length === 1 ? "" : "s"}</I18nText>.</p>
            </div>
          </div>
          <div className="team-member-list">
            {members.map((member) => (
              <MemberEditor
                key={member.id}
                member={member}
                organizationId={organizationId}
                properties={properties}
              />
            ))}
          </div>
        </section>

        <section className="team-list-card pending-invitations">
          <div className="section-heading">
            <div>
              <h2><I18nText>Invitaciones pendientes</I18nText></h2>
              <p><I18nText>Caducan a los 14 días y pueden reenviarse sin crear duplicados.</I18nText></p>
            </div>
          </div>
          {invitations.length === 0 ? (
            <div className="team-empty">
              <Mail aria-hidden="true" />
              <span>
                <strong><I18nText>No hay invitaciones pendientes</I18nText></strong>
                <small><I18nText>Las nuevas aparecerán aquí hasta su aceptación.</I18nText></small>
              </span>
            </div>
          ) : (
            <div className="invitation-list">
              {invitations.map((invitation) => (
                <article className="invitation-row" key={invitation.id}>
                  <span className="member-avatar" aria-hidden="true">
                    {invitation.email.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <strong>{invitation.email}</strong>
                    <small>
                      <I18nText>{roleLabel(invitation.role)}</I18nText> ·{" "}
                      {invitation.scope === "organization"
                        ? "todo el espacio"
                        : propertyNames(invitation.propertyAccess)}
                    </small>
                    <span className={`delivery-state ${invitation.deliveryStatus ?? "unprepared"}`}>
                      <Mail aria-hidden="true" />
                      <I18nText>{deliveryStatusLabel(
                        invitation.deliveryStatus,
                        emailProviderConfigured,
                      )}</I18nText>
                    </span>
                    <small className="delivery-detail">
                      {deliveryDetail(invitation)}
                    </small>
                    {invitationFeedback?.id === invitation.id ? (
                      <span
                        className={`invitation-feedback ${invitationFeedback.tone}`}
                        role="status"
                      >
                        <I18nText>{invitationFeedback.message}</I18nText>
                      </span>
                    ) : null}
                  </div>
                  <span className="invitation-expiry">
                    <CalendarClock aria-hidden="true" />
                    {formatDate(invitation.expiresAt)}
                  </span>
                  <div className="invitation-actions">
                    <button
                      className="button button-secondary invitation-resend-button"
                      disabled={
                        !emailProviderConfigured ||
                        resendingId !== null || cancelingId !== null ||
                        invitation.deliveryStatus === "queued"
                      }
                      onClick={() => resendInvitation(invitation.id)}
                      type="button"
                    >
                      <RotateCw aria-hidden="true" />
                      <I18nText>{resendingId === invitation.id ? "Enviando…" : "Reenviar"}</I18nText>
                    </button>
                    <LocalizedControl as="button"
                      aria-label={`Cancelar invitación para ${invitation.email}`}
                      className="icon-button danger-icon-button"
                      disabled={cancelingId !== null || resendingId !== null}
                      aria-busy={cancelingId === invitation.id}
                      onClick={() => cancelInvitation(invitation.id)}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" />
                    </LocalizedControl>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function MemberEditor({
  member,
  organizationId,
  properties,
}: {
  member: TeamMember;
  organizationId: string;
  properties: PropertyOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [role, setRole] = useState(member.role);
  const [propertyIds, setPropertyIds] = useState(
    member.propertyAccess.map((property) => property.id),
  );
  const [expiresAt, setExpiresAt] = useState(
    member.propertyAccess[0]?.expiresAt?.slice(0, 10) ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const limitedRole = isLimitedRole(role);
  const summary = useMemo(
    () =>
      isLimitedRole(member.role)
        ? propertyNames(member.propertyAccess)
        : "Acceso a todo el espacio",
    [member],
  );

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/team/members/${member.id}`, {
        body: JSON.stringify({
          action: "update",
          expiresAt: limitedRole ? expiresAt || null : null,
          organizationId,
          propertyIds: limitedRole ? propertyIds : [],
          role,
        }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo guardar el acceso.");
      }
      setEditing(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo guardar el acceso.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function revoke() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/team/members/${member.id}`, {
        body: JSON.stringify({ action: "revoke", organizationId }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo revocar el acceso.");
      }
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo revocar el acceso.",
      );
      setSaving(false);
    }
  }

  return (
    <article className={`team-member ${editing ? "editing" : ""}`} data-member-id={member.id}>
      <div className="team-member-summary">
        <span className="member-avatar" aria-hidden="true">
          {member.displayName.slice(0, 1).toUpperCase()}
        </span>
        <div className="member-identity">
          <strong>
            {member.displayName}
            {member.isCurrentActor ? <em><I18nText>Tú</I18nText></em> : null}
          </strong>
          <small>{member.email}</small>
        </div>
        <span className={`role-badge ${member.role}`}>
          <I18nText>{roleLabel(member.role)}</I18nText>
        </span>
        <span className="member-scope">{summary}</span>
        {member.isCurrentActor ? (
          <span className="member-protected">
            <ShieldCheck aria-hidden="true" /><I18nText> Acceso protegido
          </I18nText></span>
        ) : (
          <button
            className="button button-secondary member-edit-button"
            onClick={() => {
              setEditing((current) => !current);
              setConfirmingRevoke(false);
              setError("");
            }}
            type="button"
          >
            <I18nText>{editing ? "Cerrar" : "Gestionar"}</I18nText>
          </button>
        )}
      </div>

      {editing ? (
        <div className="member-editor">
          <div className="member-editor-grid">
            <div className="team-field">
              <span><I18nText>Rol</I18nText></span>
              <PremiumSelect
                ariaLabel={`Rol de ${member.displayName}`}
                onChange={(nextRole) => {
                  setRole(nextRole as OrganizationRole);
                  setPropertyIds([]);
                }}
                options={roleOptions}
                value={role}
              />
            </div>
            {limitedRole ? (
              <label className="team-field">
                <span><I18nText>Acceso hasta</I18nText></span>
                <input
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(event) => setExpiresAt(event.target.value)}
                  type="date"
                  value={expiresAt}
                />
                <small><I18nText>Déjalo vacío para acceso sin caducidad.</I18nText></small>
              </label>
            ) : (
              <div className="team-scope-note compact">
                <Home aria-hidden="true" />
                <span>
                  <strong><I18nText>Todo el espacio</I18nText></strong>
                  <small><I18nText>El rol permite consultar todas las viviendas.</I18nText></small>
                </span>
              </div>
            )}
          </div>
          {limitedRole ? (
            <PropertySelector
              onChange={setPropertyIds}
              properties={properties}
              selected={propertyIds}
            />
          ) : null}
          {error ? <p className="form-error" role="alert"><I18nText>{error}</I18nText></p> : null}
          <div className="member-editor-actions">
            {confirmingRevoke ? (
              <div className="revoke-confirmation">
                <span><I18nText>¿Revocar todo su acceso?</I18nText></span>
                <button
                  className="button button-danger"
                  disabled={saving}
                  onClick={revoke}
                  type="button"
                ><I18nText>
                  Sí, revocar
                </I18nText></button>
                <button
                  className="button button-secondary"
                  onClick={() => setConfirmingRevoke(false)}
                  type="button"
                ><I18nText>
                  Cancelar
                </I18nText></button>
              </div>
            ) : (
              <button
                className="button button-text danger-text-button"
                onClick={() => setConfirmingRevoke(true)}
                type="button"
              >
                <Trash2 aria-hidden="true" /><I18nText> Revocar acceso
              </I18nText></button>
            )}
            <button
              className="button button-primary"
              disabled={
                saving || (limitedRole && propertyIds.length === 0)
              }
              onClick={save}
              type="button"
            >
              <Save aria-hidden="true" />
              <I18nText>{saving ? "Guardando…" : "Guardar acceso"}</I18nText>
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function PropertySelector({
  onChange,
  properties,
  selected,
}: {
  onChange: (propertyIds: string[]) => void;
  properties: PropertyOption[];
  selected: string[];
}) {
  return (
    <fieldset className="property-scope-selector">
      <legend><I18nText>Viviendas autorizadas</I18nText></legend>
      <p><I18nText>Solo podrá abrir los expedientes que marques.</I18nText></p>
      {properties.length === 0 ? (
        <div className="team-empty compact">
          <Home aria-hidden="true" />
          <span>
            <strong><I18nText>Aún no hay viviendas</I18nText></strong>
            <small><I18nText>Crea una vivienda antes de asignar este rol.</I18nText></small>
          </span>
        </div>
      ) : (
        <div className="property-scope-options">
          {properties.map((property) => {
            const checked = selected.includes(property.id);
            return (
              <label key={property.id}>
                <input
                  checked={checked}
                  onChange={() =>
                    onChange(
                      checked
                        ? selected.filter((id) => id !== property.id)
                        : [...selected, property.id],
                    )
                  }
                  type="checkbox"
                />
                <span>{property.name}</span>
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

function roleLabel(role: OrganizationRole) {
  return (
    roleOptions.find((option) => option.value === role)?.label ?? role
  );
}

function isLimitedRole(role: OrganizationRole) {
  return role === "professional" || role === "owner";
}

function propertyNames(properties: Array<{ name: string }>) {
  if (properties.length === 0) return "Sin viviendas autorizadas";
  if (properties.length <= 2) {
    return properties.map((property) => property.name).join(", ");
  }
  return `${properties[0].name}, ${properties[1].name} y ${properties.length - 2} más`;
}

function deliveryStatusLabel(
  status: TeamInvitation["deliveryStatus"],
  providerConfigured: boolean,
) {
  switch (status) {
    case "pending_provider":
      return providerConfigured
        ? "Correo preparado · próximo envío"
        : "Correo preparado · autorización pendiente";
    case "queued":
      return "Correo en cola";
    case "sent":
      return "Correo entregado a Gmail";
    case "failed":
      return "El correo necesita revisión";
    case "cancelled":
      return "Correo cancelado";
    default:
      return "Correo aún no preparado";
  }
}

function deliveryDetail(invitation: TeamInvitation) {
  if (invitation.deliveryStatus === "failed") {
    const reason = deliveryErrorLabel(invitation.deliveryErrorCode);
    return invitation.nextAttemptAt
      ? `${reason} · próximo intento ${formatDateTime(invitation.nextAttemptAt)}`
      : `${reason} · reenvío manual disponible`;
  }
  if (invitation.deliveryStatus === "queued") {
    return "Gmail está procesando el mensaje ahora.";
  }
  if (invitation.lastAttemptAt) {
    return `Último intento ${formatDateTime(invitation.lastAttemptAt)} · ${Math.max(1, invitation.attemptCount)} de 5`;
  }
  return "Todavía no se ha intentado entregar.";
}

function deliveryErrorLabel(code: string | null) {
  switch (code) {
    case "gmail_authorization_required":
      return "Google necesita volver a autorizarse";
    case "gmail_quota_or_permission":
      return "Google ha limitado temporalmente el envío";
    case "gmail_message_rejected":
      return "Gmail ha rechazado el mensaje";
    case "recipient_invalid":
      return "La dirección de correo no es válida";
    default:
      return "Fallo temporal de entrega";
  }
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "Atlantic/Canary",
  }).format(new Date(value.replace(" ", "T") + "Z"));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value.replace(" ", "T") + "Z"));
}
