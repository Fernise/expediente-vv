"use client";
import { I18nText } from "@/app/components/Language";
import { factGuides } from "@/lib/checklist-plan";
import { useRouter } from "next/navigation";


import { FormEvent, useMemo, useState } from "react";
import { ChevronDown, ScanSearch } from "lucide-react";
import { PremiumSelect } from "@/app/components/PremiumSelect";
import type {
  EvaluationRecord,
  FactDefinitionRecord,
} from "@/db/rules";

type FactSelection = Record<string, "true" | "false" | "unknown">;

export function RuleEvaluationPanel({
  canEdit,
  evaluation: initialEvaluation,
  facts,
  organizationId,
  propertyId,
  ruleSetLabel,
}: {
  canEdit: boolean;
  evaluation: EvaluationRecord | null;
  facts: FactDefinitionRecord[];
  organizationId: string;
  propertyId: string;
  ruleSetLabel: string;
}) {
  const initialValues = useMemo(
    () => factSelections(facts),
    [facts],
  );
  const [values, setValues] = useState<FactSelection>(initialValues);
  const [savedValues, setSavedValues] =
    useState<FactSelection>(initialValues);
  const [evaluation, setEvaluation] = useState(initialEvaluation);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const router=useRouter();
  const dirty = JSON.stringify(values) !== JSON.stringify(savedValues);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty && evaluation) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/properties/${propertyId}/facts`, {
        body: JSON.stringify({ organizationId, values }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      });
      const result = (await response.json()) as {
        error?: string;
        evaluation?: EvaluationRecord;
      };
      if (!response.ok || !result.evaluation) {
        setError(result.error ?? "No se pudo ejecutar la evaluación.");
        return;
      }
      setEvaluation(result.evaluation);
      setSavedValues(values);
      router.refresh();
    } catch {
      setError("No hay conexión. Conservamos tus selecciones en pantalla.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="dossier-card rule-evaluation-card" id="laboratory">
      <div className="section-heading">
        <div>
          <span className="eyebrow"><I18nText>Laboratorio de borradores</I18nText></span>
          <h2><I18nText>Evaluación trazable</I18nText></h2>
          <p><I18nText>
            Introduce hechos declarados y ejecuta </I18nText>{ruleSetLabel}<I18nText>. Nada se
            interpreta como una conclusión jurídica.
          </I18nText></p>
        </div>
        <span className="draft-stamp light-draft"><I18nText>BORRADOR NO VALIDADO</I18nText></span>
      </div>
      <p className="laboratory-scope"><I18nText>Las sugerencias no se añaden solas al checklist ni cambian la fase del expediente. Revísalas y añade únicamente las tareas pertinentes. El PDF recoge solo la última evaluación guardada.</I18nText></p>

      <form className="facts-form" onSubmit={submit}>
        <fieldset disabled={!canEdit || submitting}>
          <legend><I18nText>Hechos del expediente</I18nText></legend>
          <p className="facts-answer-guide"><I18nText>Elige «Sí» cuando puedas confirmar el hecho, «No» cuando sepas que no se cumple y «Sin dato» si todavía necesitas comprobarlo. Una respuesta no certifica el cumplimiento legal.</I18nText></p>
          {facts.map((fact) => (
            <label className="fact-row" key={fact.factKey}>
              <span>
                <strong>{fact.label}</strong>
                {factGuides[fact.factKey] ? <small className="fact-help"><I18nText>{factGuides[fact.factKey]}</I18nText></small> : null}
                <small><I18nText>Fuente: declaración del equipo</I18nText></small>
              </span>
              <PremiumSelect
                ariaLabel={fact.label}
                className="compact"
                onChange={(nextValue) =>
                  setValues((current) => ({
                    ...current,
                    [fact.factKey]: nextValue as FactSelection[string],
                  }))
                }
                options={[
                  { label: "Sin dato", value: "unknown" },
                  { label: "Sí", value: "true" },
                  { label: "No", value: "false" },
                ]}
                value={values[fact.factKey]}
              />
            </label>
          ))}
        </fieldset>
        {canEdit ? (
          <div className="facts-actions">
            <span aria-live="polite">
              <I18nText>{dirty ? "Hay cambios sin evaluar." : "Hechos sincronizados."}</I18nText>
            </span>
            <button
              className="button button-primary"
              disabled={submitting || (!dirty && Boolean(evaluation))}
              type="submit"
            >
              <I18nText>{submitting
                ? "Evaluando…"
                : evaluation
                  ? "Guardar y reevaluar"
                  : "Guardar y evaluar"}</I18nText>
            </button>
          </div>
        ) : (
          <p className="read-only-note"><I18nText>
            Puedes consultar la traza, pero solo un gestor puede modificar los
            hechos declarados.
          </I18nText></p>
        )}
        {error ? <p className="form-error" role="alert"><I18nText>{error}</I18nText></p> : null}
      </form>

      {dirty && evaluation ? <p className="form-error" role="status"><I18nText>La traza de abajo corresponde a las respuestas anteriores. Guarda y reevalúa antes de generar el informe.</I18nText></p> : null}
      {evaluation ? (
        <EvaluationResult evaluation={evaluation} />
      ) : (
        <div className="evaluation-empty">
          <span><ScanSearch aria-hidden="true" /></span>
          <div>
            <h3><I18nText>Todavía no hay una evaluación</I18nText></h3>
            <p><I18nText>
              Completa los hechos conocidos. Los valores ausentes se mostrarán
              como «dato necesario», nunca como una respuesta positiva.
            </I18nText></p>
          </div>
        </div>
      )}
    </section>
  );
}

function EvaluationResult({ evaluation }: { evaluation: EvaluationRecord }) {
  return (
    <div className="evaluation-result" aria-live="polite">
      <div className="evaluation-summary">
        <div>
          <span><I18nText>Tareas sugeridas</I18nText></span>
          <strong>{evaluation.summary.applies}</strong>
        </div>
        <div>
          <span><I18nText>Sin tarea en este borrador</I18nText></span>
          <strong>{evaluation.summary.not_applies}</strong>
        </div>
        <div>
          <span><I18nText>Datos necesarios</I18nText></span>
          <strong>{evaluation.summary.unknown}</strong>
        </div>
      </div>
      <div className="trace-list">
        {evaluation.items.map((item) => (
          <details key={`${item.factKey}-${item.displayTitle}`}>
            <summary>
              <span className={`trace-result ${item.result}`}>
                <I18nText>{resultLabel(item.result)}</I18nText>
              </span>
              <strong>{item.displayTitle}</strong>
              <ChevronDown aria-hidden="true" />
            </summary>
            <p>{item.displayExplanation}</p>
            <dl>
              <div><dt><I18nText>Hecho leído</I18nText></dt><dd>{item.factKey}</dd></div>
              <div><dt><I18nText>Valor observado</I18nText></dt><dd>{valueLabel(item.actualValue)}</dd></div>
              <div><dt><I18nText>Condición</I18nText></dt><dd><I18nText>igual a </I18nText>{valueLabel(item.expectedValue)}</dd></div>
              <div><dt><I18nText>Motivo</I18nText></dt><dd><I18nText>{reasonLabel(item.reason)}</I18nText></dd></div>
            </dl>
          </details>
        ))}
      </div>
      <p className="evaluation-provenance"><I18nText>
        Motor </I18nText>{evaluation.engineVersion} · {evaluation.ruleSetLabel}<I18nText> · huella</I18nText>{" "}
        <code>{evaluation.contentHash.slice(0, 12)}</code>
      </p>
    </div>
  );
}

function factSelections(facts: FactDefinitionRecord[]): FactSelection {
  return Object.fromEntries(
    facts.map((fact) => [
      fact.factKey,
      fact.value === null ? "unknown" : fact.value ? "true" : "false",
    ]),
  );
}

function resultLabel(result: string): string {
  if (result === "applies") return "Tarea sugerida";
  if (result === "not_applies") return "Sin tarea";
  return "Dato necesario";
}

function valueLabel(value: unknown): string {
  if (value === true) return "Sí";
  if (value === false) return "No";
  if (value === null || value === undefined) return "Sin dato";
  return String(value);
}

function reasonLabel(reason: string): string {
  if (reason === "condition_matched") return "La condición coincide";
  if (reason === "condition_not_matched") return "La condición no coincide";
  return "Falta el dato de entrada";
}
