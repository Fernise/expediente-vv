"use client";
import { I18nText, LocalizedControl } from "@/app/components/Language";


import { FormEvent, useId, useState } from "react";
import type { OrganizationSummary } from "@/db/organizations";
import { useMutationRequest, uncertainMutationMessage } from "@/lib/mutation-request";

type CreateOrganizationFormProps = {
  compact?: boolean;
  onCancel?: () => void;
  onCreated?: (
    organization: OrganizationSummary,
  ) => Promise<void> | void;
};

export function CreateOrganizationForm({
  compact = false,
  onCancel,
  onCreated,
}: CreateOrganizationFormProps) {
  const nameInputId = useId();
  const mutation = useMutationRequest();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mutation.begin()) return;
    setError("");
    setSubmitting(true);

    try {
      const body = JSON.stringify({ name: name.trim().replace(/\s+/g, " ") });
      const response = await fetch("/api/organizations", {
        body,
        headers: { "content-type": "application/json", ...await mutation.headers(body) },
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        organization?: OrganizationSummary;
      };

      if (!response.ok || !payload.organization) {
        setError(payload.error ?? "No hemos podido crear el espacio.");
        return;
      }

      if (onCreated) {
        await onCreated(payload.organization);
        setName("");
        mutation.clear();
      } else {
        window.location.reload();
      }
    } catch {
      setError(uncertainMutationMessage);
    } finally {
      mutation.end();
      setSubmitting(false);
    }
  }

  return (
    <form
      className={compact ? "workspace-create-form" : "onboarding-form"}
      onSubmit={handleSubmit}
    >
      {compact ? (
        <div className="workspace-create-heading">
          <strong><I18nText>Nuevo espacio</I18nText></strong>
          <p><I18nText>Tendrá sus propias viviendas, documentos y miembros.</I18nText></p>
        </div>
      ) : null}
      <div>
        <label htmlFor={nameInputId}><I18nText>Nombre del espacio</I18nText></label>
        <p className="field-help">
          <I18nText>{compact
            ? "Usa un nombre corto y reconocible."
            : "Cada espacio separa viviendas, documentos, equipo y permisos. Podrás crear otros más adelante."}</I18nText>
        </p>
      </div>
      <LocalizedControl as="input"
        autoComplete="organization"
        autoFocus={compact}
        disabled={submitting}
        id={nameInputId}
        maxLength={80}
        minLength={2}
        name="organizationName"
        onChange={(event) => setName(event.target.value)}
        placeholder="Ej. Gestoría Atlántico"
        required
        type="text"
        value={name}
      />
      {error ? (
        <p className="form-error" role="alert">
          <I18nText>{error}</I18nText>
        </p>
      ) : null}
      {compact ? (
        <div className="workspace-create-actions">
          <button
            className="button button-secondary"
            disabled={submitting}
            onClick={onCancel}
            type="button"
          ><I18nText>
            Cancelar
          </I18nText></button>
          <button
            className="button button-primary"
            disabled={submitting || name.trim().length < 2}
            type="submit"
          >
            <I18nText>{submitting ? "Creando…" : "Crear y entrar"}</I18nText>
          </button>
        </div>
      ) : (
        <>
          <button
            className="button button-primary button-wide"
            disabled={submitting || name.trim().length < 2}
            type="submit"
          >
            <I18nText>{submitting ? "Creando espacio…" : "Crear espacio"}</I18nText>
          </button>
          <p className="form-note"><I18nText>
            Trabajaremos con datos de demostración durante el piloto.
          </I18nText></p>
        </>
      )}
    </form>
  );
}
