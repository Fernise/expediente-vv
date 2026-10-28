"use client";
import { I18nText } from "@/app/components/Language";


import { type FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, RotateCcw, ShieldQuestion } from "lucide-react";

type Answer = "yes" | "no" | "unknown";

const questions = [
  {
    id: "inventory",
    question: "¿Tienes localizado qué documento corresponde a cada vivienda?",
    help: "Piensa en contratos, justificantes y otros archivos: ¿puedes encontrarlos sin buscar en distintos correos o carpetas?",
    action: "Crear un inventario documental único por vivienda.",
  },
  {
    id: "dates",
    question: "¿Registras las fechas y vencimientos conocidos de los documentos?",
    help: "Responde Sí si anotas las fechas que conoces y puedes consultar lo que caduca próximamente. No inventes una fecha si no aparece en el documento.",
    action: "Registrar fechas conocidas y revisar los próximos vencimientos.",
  },
  {
    id: "responsibility",
    question: "¿Cada pendiente tiene una persona responsable y un siguiente paso?",
    help: "Por ejemplo: Ana debe solicitar un justificante. No basta con una nota genérica de «falta documentación».",
    action: "Asignar responsable y siguiente acción a cada pendiente.",
  },
  {
    id: "versions",
    question: "¿Conservas la versión anterior cuando sustituyes un archivo?",
    help: "Responde Sí si puedes consultar el archivo anterior y saber cuándo se reemplazó, sin confundirlo con la versión vigente.",
    action: "Mantener historial de versiones y fecha de cada sustitución.",
  },
  {
    id: "scope",
    question: "¿Separáis los datos y documentos de cada cliente o equipo?",
    help: "Cada persona debería acceder solo a los expedientes que le corresponden. Si trabajas solo, piensa si las carpetas de distintos clientes están separadas.",
    action: "Revisar accesos y separación de información por organización.",
  },
  {
    id: "review",
    question: "¿Las dudas quedan señaladas para una revisión profesional?",
    help: "Una duda debe quedar como pendiente, no como requisito cumplido. Responde Sí si sabes qué debe revisar una persona profesional.",
    action: "Marcar la incertidumbre y solicitar revisión profesional.",
  },
] as const;

export function PublicDossierChecker() {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [showResult, setShowResult] = useState(false);
  const answered = Object.keys(answers).length;
  const result = useMemo(() => summarize(answers), [answers]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (answered === questions.length) setShowResult(true);
  }

  function reset() {
    setAnswers({});
    setShowResult(false);
  }

  if (showResult) {
    return (
      <section className="checker-result" aria-live="polite">
        <div className="checker-result-heading">
          <span><CheckCircle2 aria-hidden="true" /></span>
          <div>
            <span className="eyebrow"><I18nText>Resultado orientativo</I18nText></span>
            <h2><I18nText>{result.status}</I18nText></h2>
            <p><I18nText>{result.explanation}</I18nText></p>
          </div>
        </div>
        <div className="checker-result-metrics">
          <div><strong>{result.positive}</strong><span><I18nText>prácticas organizadas</I18nText></span></div>
          <div><strong>{result.pending}</strong><span><I18nText>acciones pendientes</I18nText></span></div>
          <div><strong>{result.unknown}</strong><span><I18nText>puntos por confirmar</I18nText></span></div>
        </div>
        {result.actions.length ? (
          <div className="checker-actions-list">
            <h3><I18nText>Siguientes pasos recomendados</I18nText></h3>
            <ol>
              {result.actions.map((action) => <li key={action}><I18nText>{action}</I18nText></li>)}
            </ol>
          </div>
        ) : (
          <div className="checker-actions-list">
            <h3><I18nText>Siguiente paso</I18nText></h3>
            <p><I18nText>
              Mantén el expediente actualizado y somete cualquier duda a una
              revisión profesional antes de extraer conclusiones.
            </I18nText></p>
          </div>
        )}
        <div className="checker-result-warning">
          <ShieldQuestion aria-hidden="true" /><I18nText>
          Este resultado solo evalúa hábitos de organización declarados por ti.
          No revisa documentos, normativa ni la situación de una vivienda.
        </I18nText></div>
        <div className="checker-result-buttons">
          <button className="button button-secondary" onClick={reset} type="button">
            <RotateCcw aria-hidden="true" /><I18nText> Repetir comprobación
          </I18nText></button>
          <Link className="button button-primary" href="/solicitar-demo"><I18nText>
            Organizarlo con Expediente VV </I18nText><ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </section>
    );
  }

  return (
    <form className="public-checker" onSubmit={submit}>
      <div className="checker-progress">
        <div><span><I18nText>Progreso</I18nText></span><strong>{answered}<I18nText> de </I18nText>{questions.length}</strong></div>
        <span aria-hidden="true"><b style={{ width: `${(answered / questions.length) * 100}%` }} /></span>
      </div>
      <div className="checker-question-list">
        {questions.map((item, index) => (
          <fieldset key={item.id} aria-describedby={`question-${item.id}-help`}>
            <legend><span className="question-number">{String(index + 1).padStart(2, "0")}</span><span><I18nText>{item.question}</I18nText></span></legend>
            <p className="checker-question-help" id={`question-${item.id}-help`}><I18nText>{item.help}</I18nText></p>
            <div className="checker-answer-options">
              {[
                ["yes", "Sí"],
                ["no", "Todavía no"],
                ["unknown", "No lo sé"],
              ].map(([value, label]) => (
                <label className={answers[item.id] === value ? "selected" : ""} key={value}>
                  <input
                    checked={answers[item.id] === value}
                    name={item.id}
                    onChange={() => {
                      setAnswers((current) => ({ ...current, [item.id]: value as Answer }));
                    }}
                    type="radio"
                    value={value}
                  />
                  <span><I18nText>{label}</I18nText></span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <p className="checker-answer-guide"><I18nText>Elige «Todavía no» si falta organizarlo y «No lo sé» si necesitas confirmarlo. Ambas respuestas ayudan a identificar el siguiente paso.</I18nText></p>
      <button className="button button-primary button-large button-wide" disabled={answered !== questions.length} type="submit"><I18nText>
        Ver resultado orientativo </I18nText><ArrowRight aria-hidden="true" />
      </button>
      <p className="checker-privacy-note"><I18nText>
        Las respuestas se calculan en esta pantalla y no se guardan ni se envían.
      </I18nText></p>
    </form>
  );
}

function summarize(answers: Record<string, Answer>) {
  const positive = questions.filter((item) => answers[item.id] === "yes").length;
  const pending = questions.filter((item) => answers[item.id] === "no").length;
  const unknown = questions.filter((item) => answers[item.id] === "unknown").length;
  const actions = questions
    .filter((item) => answers[item.id] !== "yes")
    .map((item) => item.action);

  if (pending >= 3) {
    return {
      actions,
      explanation: "Hay varios puntos básicos de organización que conviene ordenar antes de preparar una revisión.",
      pending,
      positive,
      status: "Expediente incompleto",
      unknown,
    };
  }
  if (unknown > 0) {
    return {
      actions,
      explanation: "Quedan aspectos sin confirmar. Regístralos como incertidumbre y evita asumir una conclusión.",
      pending,
      positive,
      status: "Requiere revisión profesional",
      unknown,
    };
  }
  if (pending > 0) {
    return {
      actions,
      explanation: "La base está organizada, pero todavía existen tareas documentales concretas.",
      pending,
      positive,
      status: "Pendiente de documentación",
      unknown,
    };
  }
  return {
    actions,
    explanation: "La organización declarada permite preparar el expediente para que una persona profesional lo revise.",
    pending,
    positive,
    status: "Preparado para revisión",
    unknown,
  };
}
