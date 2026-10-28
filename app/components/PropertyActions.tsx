"use client";
import { I18nText, LocalizedControl } from "@/app/components/Language";


import { FormEvent, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, RefreshCcw, ShieldCheck, X } from "lucide-react";
import { PremiumSelect } from "@/app/components/PremiumSelect";
import {
  checklistStatusLabels,
  type ChecklistWorkflowStatus,
} from "@/lib/property-status";
import type { DataProfile } from "@/lib/pilot-data";
import { useMutationRequest, uncertainMutationMessage } from "@/lib/mutation-request";

export function EvidenceLinkControl({
  checklistItems,
  documentId,
  linkedItemIds,
  organizationId,
  propertyId,
}: {
  checklistItems: Array<{ id: string; title: string }>;
  documentId: string;
  linkedItemIds: string[];
  organizationId: string;
  propertyId: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function change(itemId: string, action: "link" | "unlink") {
    if (!itemId || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/properties/${propertyId}/documents/${documentId}/links`,
        {
          body: JSON.stringify({ checklistItemId: itemId, organizationId }),
          headers: { "content-type": "application/json" },
          method: action === "link" ? "POST" : "DELETE",
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "No se pudo actualizar el vínculo.");
        return;
      }
      setSelected("");
      router.refresh();
    } catch {
      setError("No hay conexión.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="evidence-link-control">
      <strong><I18nText>Respalda</I18nText></strong>
      {linkedItemIds.length ? (
        <div className="evidence-link-tags">
          {linkedItemIds.map((id) => (
            <span className="evidence-link-tag" key={id}>
              {checklistItems.find((item) => item.id === id)?.title ?? "Requisito"}
              <LocalizedControl as="button" aria-label="Desvincular requisito" disabled={saving}
                onClick={() => change(id, "unlink")} title="Desvincular requisito" type="button">
                <X aria-hidden="true" />
              </LocalizedControl>
            </span>
          ))}
        </div>
      ) : <small><I18nText>Sin requisito asociado</I18nText></small>}
      {linkedItemIds.length < checklistItems.length ? (
        <div className="evidence-link-add">
          <PremiumSelect ariaLabel="Elegir otro requisito para este documento"
            disabled={saving} onChange={setSelected}
            options={[{ label: "Elegir requisito", value: "" },
              ...checklistItems.filter((item) => !linkedItemIds.includes(item.id))
                .map((item) => ({ label: item.title, value: item.id, translate: false }))]}
            value={selected} />
          <button className="button button-secondary" disabled={!selected || saving}
            onClick={() => change(selected, "link")} type="button">
            <I18nText>{saving ? "Guardando…" : "Vincular"}</I18nText>
          </button>
        </div>
      ) : null}
      {error ? <small className="inline-error" role="alert"><I18nText>{error}</I18nText></small> : null}
    </div>
  );
}

export function ChecklistStatusControl({
  operational=false,
  itemId,
  organizationId,
  propertyId,
  status,
}: {
  operational?:boolean;
  itemId: string;
  organizationId: string;
  propertyId: string;
  status: ChecklistWorkflowStatus;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [currentStatus, setCurrentStatus] = useState(status);
  useEffect(()=>setCurrentStatus(status),[status]);

  async function update(nextStatus: string) {
    if (nextStatus === currentStatus) return;
    const previousStatus = currentStatus;
    setCurrentStatus(nextStatus as ChecklistWorkflowStatus);
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/properties/${propertyId}/checklist/${itemId}`,
        {
          body: JSON.stringify({ organizationId, status: nextStatus }),
          headers: { "content-type": "application/json" },
          method: "PATCH",
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setCurrentStatus(previousStatus);
        setError(result.error ?? "No se pudo actualizar.");
        return;
      }
      router.refresh();
    } catch {
      setCurrentStatus(previousStatus);
      setError("No hay conexión.");
    } finally {
      setSaving(false);
    }
  }

  const options = Object.entries(checklistStatusLabels).filter(
    ([value]) => operational ? ["pending","in_progress","completed"].includes(value) : !["reviewed","in_progress","completed"].includes(value),
  );

  return (
    <div className="checklist-control">
      <PremiumSelect
        ariaLabel="Estado del elemento"
        className="compact"
        disabled={saving}
        onChange={update}
        options={options.map(([value, label]) => ({
          label,
          value,
        }))}
        value={currentStatus}
      />
      {saving ? <small className="save-indicator"><I18nText>Guardando…</I18nText></small> : null}
      {error ? <small className="inline-error" role="alert"><I18nText>{error}</I18nText></small> : null}
    </div>
  );
}

export function ProfessionalReviewForm({
  checklistItemId,
  evidenceOptions,
  organizationId,
  propertyId,
}: {
  checklistItemId: string;
  evidenceOptions: Array<{ id: string; label: string }>;
  organizationId: string;
  propertyId: string;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState("");
  const [documentId, setDocumentId] = useState(evidenceOptions[0]?.id ?? "");
  const [error, setError] = useState("");
  const [observation, setObservation] = useState("");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/properties/${propertyId}/reviews`, {
        body: JSON.stringify({
          checklistItemId,
          decision,
          documentId,
          observation,
          organizationId,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "No se pudo registrar la revisión.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("No hay conexión.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!evidenceOptions.length) {
    return (
      <small className="review-evidence-missing"><I18nText>
        Vincula una evidencia vigente antes de revisar.
      </I18nText></small>
    );
  }
  if (!open) {
    return (
      <button
        className="review-open-button"
        onClick={() => setOpen(true)}
        type="button"
      >
        <ShieldCheck aria-hidden="true" /><I18nText> Registrar revisión
      </I18nText></button>
    );
  }

  return (
    <form className="professional-review-form" onSubmit={submit}>
      <div className="professional-review-heading">
        <div>
          <strong><I18nText>Decisión profesional</I18nText></strong>
          <small><I18nText>La decisión se aplicará a la versión elegida. Otras evidencias quedarán sin valorar.</I18nText></small>
        </div>
        <LocalizedControl as="button"
          aria-label="Cerrar revisión"
          disabled={submitting}
          onClick={() => setOpen(false)}
          type="button"
        >
          <X aria-hidden="true" />
        </LocalizedControl>
      </div>
      <div className="review-form-grid">
        <div className="field">
          <span><I18nText>Evidencia revisada</I18nText></span>
          <PremiumSelect
            ariaLabel="Evidencia que se está revisando"
            disabled={submitting}
            onChange={setDocumentId}
            options={evidenceOptions.map((evidence) => ({
              label: evidence.label,
              translate: false,
              value: evidence.id,
            }))}
            value={documentId}
          />
        </div>
        <div className="field">
          <span><I18nText>Decisión</I18nText></span>
          <PremiumSelect
            ariaLabel="Decisión profesional"
            disabled={submitting}
            onChange={setDecision}
            options={[
              { label: "Seleccionar decisión", value: "" },
              { label: "Aprobar evidencia", value: "approved" },
              { label: "Solicitar cambios", value: "changes_requested" },
              { label: "Rechazar evidencia", value: "rejected" },
            ]}
            value={decision}
          />
        </div>
      </div>
      <label className="field">
        <span><I18nText>Observación profesional *</I18nText></span>
        <LocalizedControl as="textarea"
          disabled={submitting}
          maxLength={800}
          minLength={12}
          onChange={(event) => setObservation(event.target.value)}
          placeholder="Explica el criterio aplicado y cualquier limitación relevante."
          required
          value={observation}
        />
      </label>
      <div className="review-form-footer">
        <small>{observation.length}<I18nText>/800 · la decisión no se puede editar</I18nText></small>
        <button
          className="button button-primary"
          disabled={submitting || !decision || observation.trim().length < 12}
          type="submit"
        >
          <I18nText>{submitting ? "Registrando…" : "Registrar decisión"}</I18nText>
        </button>
      </div>
      {error ? <small className="inline-error" role="alert"><I18nText>{error}</I18nText></small> : null}
    </form>
  );
}

export function UploadDocumentForm({
  checklistItems,
  dataProfile,
  organizationId,
  propertyId,
}: {
  checklistItems: Array<{ id: string; title: string }>;
  dataProfile: DataProfile;
  organizationId: string;
  propertyId: string;
}) {
  const router = useRouter();
  const mutation = useMutationRequest();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedChecklistIds, setSelectedChecklistIds] = useState<string[]>([]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mutation.begin()) return;
    const form = event.currentTarget;
    setSubmitting(true);
    setError("");
    const data = new FormData(form);
    data.set("organizationId", organizationId);
    try {
      const response = await fetch(`/api/properties/${propertyId}/documents`, {
        body: data,
        headers: await mutation.headers(data),
        method: "POST",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        if (response.status < 500 && response.status !== 409) mutation.clear();
        setError(result.error ?? "No se pudo subir el documento.");
        return;
      }
      form.reset();
      mutation.clear();
      setSelectedChecklistIds([]);
      setOpen(false);
      router.refresh();
    } catch {
      setError(uncertainMutationMessage);
    } finally {
      mutation.end();
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button className="button button-primary" onClick={() => setOpen(true)} type="button">
        <Plus aria-hidden="true" /><I18nText> Añadir documento
      </I18nText></button>
    );
  }

  return (
    <form className="document-upload-form" onSubmit={submit}>
      <div className="upload-form-heading">
        <div>
          <h3><I18nText>Añadir evidencia privada</I18nText></h3>
          <p><I18nText>PDF, JPG o PNG · máximo 10 MB.</I18nText></p>
        </div>
        <LocalizedControl as="button" aria-label="Cerrar" disabled={submitting} onClick={() => setOpen(false)} type="button">
          <X aria-hidden="true" />
        </LocalizedControl>
      </div>
      <div className="form-grid">
        <label className="field">
          <span><I18nText>Tipo de documento *</I18nText></span>
          <input maxLength={80} name="documentType" required />
        </label>
        <div className="field field-span-2">
          <span><I18nText>Requisitos que respalda</I18nText></span>
          <LocalizedControl as="div" className="evidence-multi-picker" role="group" aria-label="Requisitos que respalda el documento">
            {checklistItems.map((item) => {
              const selected = selectedChecklistIds.includes(item.id);
              return <button aria-pressed={selected} className={selected ? "selected" : ""}
                disabled={submitting} key={item.id} onClick={() => setSelectedChecklistIds((previous) =>
                  selected ? previous.filter((id) => id !== item.id) : [...previous, item.id])}
                type="button">{item.title}</button>;
            })}
          </LocalizedControl>
          {selectedChecklistIds.map((id) => <input key={id} name="checklistItemIds" type="hidden" value={id} />)}
          <small><I18nText>Puedes elegir varios o dejar el documento sin vincular.</I18nText></small>
        </div>
        <label className="field">
          <span><I18nText>Fecha del documento</I18nText></span>
          <input name="documentDate" type="date" />
        </label>
        <label className="field">
          <span><I18nText>Vencimiento</I18nText></span>
          <input name="expiresAt" type="date" />
        </label>
        <label className="field field-span-2">
          <span><I18nText>Archivo *</I18nText></span>
          <input
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            name="file"
            required
            type="file"
          />
        </label>
      </div>
      <div className="quarantine-note">
        <ShieldCheck aria-hidden="true" /><I18nText>
        Se comprobarán el tipo real, la estructura y el contenido activo conocido.
        Si no supera el control, no se guardará.
      </I18nText></div>
      {dataProfile === "pilot_anonymized" ? (
        <label className="pilot-upload-confirmation">
          <input
            name="anonymizationConfirmed"
            required
            type="checkbox"
            value="yes"
          />
          <span><I18nText>
            Confirmo que es un archivo ficticio o anonimizado: no contiene
            nombres, DNI/NIE, teléfonos, correos, firmas, IBAN ni dirección exacta.
          </I18nText></span>
        </label>
      ) : null}
      {error ? <p className="form-error" role="alert"><I18nText>{error}</I18nText></p> : null}
      <div className="form-actions compact-actions">
        <button className="button button-secondary" disabled={submitting} onClick={() => setOpen(false)} type="button"><I18nText>
          Cancelar
        </I18nText></button>
        <button className="button button-primary" disabled={submitting} type="submit">
          <I18nText>{submitting ? "Comprobando y guardando…" : "Subir y comprobar"}</I18nText>
        </button>
      </div>
    </form>
  );
}

export function ReplaceDocumentVersionForm({
  dataProfile,
  documentId,
  organizationId,
  propertyId,
}: {
  dataProfile: DataProfile;
  documentId: string;
  organizationId: string;
  propertyId: string;
}) {
  const router = useRouter();
  const mutation = useMutationRequest();
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mutation.begin()) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set("documentId", documentId);
    data.set("organizationId", organizationId);
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch(`/api/properties/${propertyId}/documents`, {
        body: data,
        headers: await mutation.headers(data),
        method: "POST",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        if (response.status < 500 && response.status !== 409) mutation.clear();
        setError(result.error ?? "No se pudo añadir la nueva versión.");
        return;
      }
      form.reset();
      mutation.clear();
      setOpen(false);
      router.refresh();
    } catch {
      setError(uncertainMutationMessage);
    } finally {
      mutation.end();
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        className="document-version-button"
        onClick={() => setOpen(true)}
        type="button"
      >
        <RefreshCcw aria-hidden="true" /><I18nText> Nueva versión
      </I18nText></button>
    );
  }

  return (
    <form className="replace-document-form" onSubmit={submit}>
      <div>
        <strong><I18nText>Nueva versión</I18nText></strong>
        <LocalizedControl as="button"
          aria-label="Cancelar nueva versión"
          disabled={submitting}
          onClick={() => setOpen(false)}
          type="button"
        >
          <X aria-hidden="true" />
        </LocalizedControl>
      </div>
      <p><I18nText>La versión anterior se conservará en el historial.</I18nText></p>
      <LocalizedControl as="input"
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        aria-label="Archivo de la nueva versión"
        disabled={submitting}
        name="file"
        required
        type="file"
      />
      <small><I18nText>
        La nueva versión deberá superar de nuevo el control técnico.
      </I18nText></small>
      {dataProfile === "pilot_anonymized" ? (
        <label className="pilot-upload-confirmation compact">
          <input
            name="anonymizationConfirmed"
            required
            type="checkbox"
            value="yes"
          />
          <span><I18nText>Confirmo que esta versión está anonimizada.</I18nText></span>
        </label>
      ) : null}
      {error ? <span className="inline-error" role="alert"><I18nText>{error}</I18nText></span> : null}
      <button
        className="button button-primary"
        disabled={submitting}
        type="submit"
      >
        <I18nText>{submitting ? "Subiendo…" : "Guardar nueva versión"}</I18nText>
      </button>
    </form>
  );
}

export function DocumentSecurityCheckButton({
  documentId,
  organizationId,
  propertyId,
}: {
  documentId: string;
  organizationId: string;
  propertyId: string;
}) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  async function check() {
    setChecking(true);
    setError("");
    try {
      const response = await fetch(
        `/api/properties/${propertyId}/documents/${documentId}`,
        {
          body: JSON.stringify({ organizationId }),
          headers: { "content-type": "application/json" },
          method: "PATCH",
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "No se pudo comprobar el archivo.");
        return;
      }
      router.refresh();
    } catch {
      setError("No hay conexión.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="document-security-check">
      <button
        className="document-version-button"
        disabled={checking}
        onClick={check}
        type="button"
      >
        <ShieldCheck aria-hidden="true" />
        <I18nText>{checking ? "Comprobando…" : "Comprobar ahora"}</I18nText>
      </button>
      {error ? <small className="inline-error" role="alert"><I18nText>{error}</I18nText></small> : null}
    </div>
  );
}

export function CommentForm({
  dataProfile,
  organizationId,
  propertyId,
}: {
  dataProfile: DataProfile;
  organizationId: string;
  propertyId: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/properties/${propertyId}/comments`, {
        body: JSON.stringify({ body, organizationId }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "No se pudo añadir el comentario.");
        return;
      }
      setBody("");
      router.refresh();
    } catch {
      setError("No hay conexión.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="comment-form" onSubmit={submit}>
      <label className="sr-only" htmlFor="internal-comment"><I18nText>Comentario interno</I18nText></label>
      <LocalizedControl as="textarea"
        id="internal-comment"
        maxLength={1200}
        minLength={2}
        onChange={(event) => setBody(event.target.value)}
        placeholder={
          dataProfile === "pilot_anonymized"
            ? "Añade una nota sin nombres, contactos ni identificadores…"
            : "Añade una nota interna para el equipo…"
        }
        required
        value={body}
      />
      <div>
        <span>
          {body.length}/1.200 · <I18nText>{dataProfile === "pilot_anonymized"
            ? "se bloquearán identificadores directos"
            : "solo visible para el equipo"}</I18nText>
        </span>
        <button
          className="button button-secondary"
          disabled={submitting || body.trim().length < 2}
          type="submit"
        >
          <I18nText>{submitting ? "Añadiendo…" : "Añadir comentario"}</I18nText>
        </button>
      </div>
      {error ? <small className="inline-error" role="alert"><I18nText>{error}</I18nText></small> : null}
    </form>
  );
}

export function ArchivePropertyButton({
  organizationId,
  propertyId,
}: {
  organizationId: string;
  propertyId: string;
}) {
  const mutation = useMutationRequest();
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function archive() {
    if (!mutation.begin()) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/properties/${propertyId}`, {
        body: JSON.stringify({ action: "archive", organizationId }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "No se pudo archivar.");
        return;
      }
      // Refreshing the old route after push can cancel the pending navigation.
      // Full navigation also guarantees a fresh list after the archive commits.
      window.location.assign("/app/properties");
    } catch {
      setError(uncertainMutationMessage);
    } finally {
      mutation.end();
      setSubmitting(false);
    }
  }

  return (
    <div className="archive-action">
      {confirming ? (
        <LocalizedControl as="div" className="archive-confirmation" role="group" aria-label="Confirmar archivo">
          <p><I18nText>
            La vivienda dejará de aparecer en las listas activas. Su historial
            se conservará.
          </I18nText></p>
          <div>
            <button
              className="button button-secondary"
              disabled={submitting}
              onClick={() => setConfirming(false)}
              type="button"
            ><I18nText>
              Cancelar
            </I18nText></button>
            <button
              className="button button-danger"
              disabled={submitting}
              onClick={archive}
              type="button"
            >
              <I18nText>{submitting ? "Archivando…" : "Sí, archivar"}</I18nText>
            </button>
          </div>
        </LocalizedControl>
      ) : (
        <button
          className="button button-danger"
          onClick={() => setConfirming(true)}
          type="button"
        ><I18nText>
          Archivar vivienda
        </I18nText></button>
      )}
      {error ? <small className="inline-error" role="alert"><I18nText>{error}</I18nText></small> : null}
    </div>
  );
}
