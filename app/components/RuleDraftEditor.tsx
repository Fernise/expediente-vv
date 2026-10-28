"use client";
import { I18nText, LocalizedControl } from "@/app/components/Language";


import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { PremiumSelect } from "@/app/components/PremiumSelect";
import type { RuleCatalogItem } from "@/db/rules";

export function RuleDraftEditor({
  canDraft,
  lockedReason,
  organizationId,
  rules,
}: {
  canDraft: boolean;
  lockedReason?: string;
  organizationId: string;
  rules: RuleCatalogItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState(rules[0]?.ruleStableKey ?? "");
  const initialRule = rules[0];
  const [title, setTitle] = useState(initialRule?.displayTitle ?? "");
  const [explanation, setExplanation] = useState(
    initialRule?.displayExplanation ?? "",
  );
  const [factKey, setFactKey] = useState(initialRule?.condition.factKey ?? "");
  const [expectedValue, setExpectedValue] = useState(
    initialRule?.condition.value === true,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (!canDraft) {
    return (
      <p className="read-only-note"><I18nText>
        Tu rol puede consultar y comparar reglas, pero no crear versiones.
      </I18nText></p>
    );
  }
  if (lockedReason) {
    return <p className="read-only-note">{lockedReason}</p>;
  }

  function chooseRule(ruleStableKey: string) {
    const rule = rules.find((candidate) => candidate.ruleStableKey === ruleStableKey);
    if (!rule) return;
    setSelectedKey(rule.ruleStableKey);
    setTitle(rule.displayTitle);
    setExplanation(rule.displayExplanation);
    setFactKey(rule.condition.factKey);
    setExpectedValue(rule.condition.value === true);
    setError("");
    setSuccess("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/rules/versions", {
        body: JSON.stringify({
          displayExplanation: explanation,
          displayTitle: title,
          expectedValue,
          factKey,
          organizationId,
          ruleStableKey: selectedKey,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const result = (await response.json()) as {
        error?: string;
        version?: { label: string };
      };
      if (!response.ok || !result.version) {
        setError(result.error ?? "No se pudo crear la versión.");
        return;
      }
      setSuccess(`${result.version.label} creada como borrador.`);
      setOpen(false);
      router.refresh();
    } catch {
      setError("No hay conexión. Revisa los campos y vuelve a intentarlo.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <div className="rule-editor-launch">
        <div>
          <strong><I18nText>Editor controlado</I18nText></strong>
          <span><I18nText>Cada cambio crea una versión nueva; nunca reescribe el pasado.</I18nText></span>
        </div>
        <button
          className="button button-secondary"
          onClick={() => setOpen(true)}
          type="button"
        ><I18nText>
          Crear nueva versión
        </I18nText></button>
        {success ? <p className="success-message" role="status">{success}</p> : null}
      </div>
    );
  }

  return (
    <form className="rule-editor-form" onSubmit={submit}>
      <div className="upload-form-heading">
        <div>
          <h3><I18nText>Nueva versión de regla</I18nText></h3>
          <p><I18nText>Se guardará como borrador no validado.</I18nText></p>
        </div>
        <LocalizedControl as="button"
          aria-label="Cerrar editor"
          disabled={submitting}
          onClick={() => setOpen(false)}
          type="button"
        >
          <X aria-hidden="true" />
        </LocalizedControl>
      </div>
      <div className="form-grid">
        <div className="field field-span-2">
          <span><I18nText>Regla base</I18nText></span>
          <PremiumSelect
            ariaLabel="Regla base"
            onChange={chooseRule}
            options={rules.map((rule) => ({
              description: `Versión ${rule.versionNumber}`,
              label: rule.displayTitle,
              translate: false,
              value: rule.ruleStableKey,
            }))}
            value={selectedKey}
          />
        </div>
        <label className="field field-span-2">
          <span><I18nText>Título mostrado *</I18nText></span>
          <input
            maxLength={120}
            minLength={4}
            onChange={(event) => setTitle(event.target.value)}
            required
            value={title}
          />
        </label>
        <label className="field field-span-2">
          <span><I18nText>Explicación *</I18nText></span>
          <textarea
            maxLength={400}
            minLength={12}
            onChange={(event) => setExplanation(event.target.value)}
            required
            rows={4}
            value={explanation}
          />
        </label>
        <div className="field">
          <span><I18nText>Hecho tipado</I18nText></span>
          <PremiumSelect
            ariaLabel="Hecho tipado"
            onChange={setFactKey}
            options={uniqueFacts(rules).map((fact) => ({
              label: fact,
              value: fact,
            }))}
            value={factKey}
          />
        </div>
        <div className="field">
          <span><I18nText>Valor que activa la tarea</I18nText></span>
          <PremiumSelect
            ariaLabel="Valor que activa la tarea"
            onChange={(nextValue) => setExpectedValue(nextValue === "true")}
            options={[
              { label: "No", value: "false" },
              { label: "Sí", value: "true" },
            ]}
            value={String(expectedValue)}
          />
        </div>
      </div>
      <div className="rule-editor-safety"><I18nText>
        La fuente se conserva y la publicación permanece bloqueada.
      </I18nText></div>
      {error ? <p className="form-error" role="alert"><I18nText>{error}</I18nText></p> : null}
      <div className="form-actions compact-actions">
        <button
          className="button button-secondary"
          disabled={submitting}
          onClick={() => setOpen(false)}
          type="button"
        ><I18nText>
          Cancelar
        </I18nText></button>
        <button className="button button-primary" disabled={submitting} type="submit">
          <I18nText>{submitting ? "Creando versión…" : "Guardar nueva versión"}</I18nText>
        </button>
      </div>
    </form>
  );
}

function uniqueFacts(rules: RuleCatalogItem[]): string[] {
  return Array.from(new Set(rules.map((rule) => rule.condition.factKey))).sort();
}
