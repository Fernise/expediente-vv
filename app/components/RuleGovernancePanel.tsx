"use client";
import { I18nText, LocalizedControl } from "@/app/components/Language";


import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Circle } from "lucide-react";
import type {
  RuleCatalog,
  RuleWorkflowAction,
  RuleWorkflowStatus,
} from "@/db/rules";

export function RuleGovernancePanel({
  canApprove,
  canDraft,
  canReview,
  conflicts,
  organizationId,
  reviewHistory,
  ruleSetVersionId,
  status,
}: {
  canApprove: boolean;
  canDraft: boolean;
  canReview: boolean;
  conflicts: number;
  organizationId: string;
  reviewHistory: RuleCatalog["reviewHistory"];
  ruleSetVersionId: string;
  status: RuleWorkflowStatus;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pendingAction, setPendingAction] =
    useState<RuleWorkflowAction | null>(null);
  const [error, setError] = useState("");

  async function runAction(action: RuleWorkflowAction) {
    if (
      (action === "changes_requested" ||
        action === "professionally_reviewed") &&
      note.trim().length < 12
    ) {
      setError("Añade una nota de al menos 12 caracteres.");
      return;
    }
    setPendingAction(action);
    setError("");
    try {
      const response = await fetch("/api/rules/workflow", {
        body: JSON.stringify({
          action,
          note,
          organizationId,
          ruleSetVersionId,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const result = (await response.json()) as {
        error?: string;
        workflow?: { status: RuleWorkflowStatus };
      };
      if (!response.ok || !result.workflow) {
        setError(result.error ?? "No se pudo actualizar el estado editorial.");
        return;
      }
      setNote("");
      router.refresh();
    } catch {
      setError("No hay conexión. Vuelve a intentarlo.");
    } finally {
      setPendingAction(null);
    }
  }

  const needsReviewNote = status === "in_review" && canReview;

  return (
    <section className="dossier-card governance-card">
      <div className="section-heading">
        <div>
          <span className="eyebrow"><I18nText>Gobierno editorial</I18nText></span>
          <h2><I18nText>Circuito de revisión</I18nText></h2>
          <p><I18nText>
            Autoría, revisión profesional y aprobación quedan separadas y
            registradas.
          </I18nText></p>
        </div>
        <span className={`governance-status ${status}`}>
          {workflowStatusLabel(status)}
        </span>
      </div>

      <ol className="governance-steps">
        <GovernanceStep
          active={status === "draft_unvalidated"}
          complete={statusRank(status) > 0}
          label="Borrador preparado"
          number="1"
        />
        <GovernanceStep
          active={status === "in_review"}
          complete={statusRank(status) > 1}
          label="Revisión profesional"
          number="2"
        />
        <GovernanceStep
          active={status === "reviewed"}
          complete={statusRank(status) > 2}
          label="Aprobación independiente"
          number="3"
        />
      </ol>

      {needsReviewNote ? (
        <label className="field governance-note">
          <span><I18nText>Nota profesional *</I18nText></span>
          <LocalizedControl as="textarea"
            maxLength={500}
            minLength={12}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Resume las comprobaciones realizadas o los cambios necesarios."
            rows={3}
            value={note}
          />
        </label>
      ) : status === "reviewed" && canApprove ? (
        <label className="field governance-note">
          <span><I18nText>Nota de aprobación</I18nText></span>
          <LocalizedControl as="textarea"
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Opcional. Añade contexto para la auditoría."
            rows={2}
            value={note}
          />
        </label>
      ) : null}

      <div className="governance-actions">
        {status === "draft_unvalidated" && canDraft ? (
          <button
            className="button button-primary"
            disabled={Boolean(pendingAction) || conflicts > 0}
            onClick={() => runAction("submitted")}
            type="button"
          >
            <I18nText>{pendingAction === "submitted"
              ? "Enviando…"
              : "Enviar a revisión"}</I18nText>
          </button>
        ) : null}
        {status === "in_review" && canDraft ? (
          <button
            className="button button-secondary"
            disabled={Boolean(pendingAction)}
            onClick={() => runAction("withdrawn")}
            type="button"
          ><I18nText>
            Retirar de revisión
          </I18nText></button>
        ) : null}
        {status === "in_review" && canReview ? (
          <>
            <button
              className="button button-secondary"
              disabled={Boolean(pendingAction)}
              onClick={() => runAction("changes_requested")}
              type="button"
            ><I18nText>
              Solicitar cambios
            </I18nText></button>
            <button
              className="button button-primary"
              disabled={Boolean(pendingAction)}
              onClick={() => runAction("professionally_reviewed")}
              type="button"
            >
              <I18nText>{pendingAction === "professionally_reviewed"
                ? "Registrando…"
                : "Registrar revisión"}</I18nText>
            </button>
          </>
        ) : null}
        {status === "reviewed" && canApprove ? (
          <button
            className="button button-primary"
            disabled={Boolean(pendingAction)}
            onClick={() => runAction("approved")}
            type="button"
          >
            <I18nText>{pendingAction === "approved" ? "Aprobando…" : "Aprobar versión"}</I18nText>
          </button>
        ) : null}
      </div>

      {conflicts > 0 && status === "draft_unvalidated" ? (
        <p className="governance-blocker"><I18nText>
          Resuelve los conflictos antes de iniciar la revisión.
        </I18nText></p>
      ) : null}
      {status === "in_review" && !canReview ? (
        <p className="governance-waiting"><I18nText>
          Pendiente de una persona con rol profesional.
        </I18nText></p>
      ) : null}
      {status === "reviewed" && !canApprove ? (
        <p className="governance-waiting"><I18nText>
          Revisión registrada. Pendiente de aprobación independiente.
        </I18nText></p>
      ) : null}
      {status === "approved" ? (
        <p className="governance-approved"><I18nText>
          Versión aprobada. La publicación continúa deshabilitada en este
          piloto.
        </I18nText></p>
      ) : null}
      {error ? <p className="form-error" role="alert"><I18nText>{error}</I18nText></p> : null}

      <div className="governance-history">
        <h3><I18nText>Historial de decisiones</I18nText></h3>
        {reviewHistory.length ? (
          <ol>
            {reviewHistory.map((event) => (
              <li key={event.id}>
                <Circle aria-hidden="true" fill="currentColor" />
                <div>
                  <strong>{workflowActionLabel(event.action)}</strong>
                  <small>
                    {event.actorName} · {formatDateTime(event.createdAt)}
                  </small>
                  {event.note ? <p>{event.note}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p><I18nText>Aún no hay decisiones editoriales para esta versión.</I18nText></p>
        )}
      </div>
    </section>
  );
}

function GovernanceStep({
  active,
  complete,
  label,
  number,
}: {
  active: boolean;
  complete: boolean;
  label: string;
  number: string;
}) {
  return (
    <li className={active ? "active" : complete ? "complete" : ""}>
      <span>{complete ? <Check aria-hidden="true" /> : number}</span>
      <strong><I18nText>{label}</I18nText></strong>
    </li>
  );
}

function statusRank(status: RuleWorkflowStatus): number {
  return {
    approved: 3,
    draft_unvalidated: 0,
    in_review: 1,
    published: 4,
    retired: 4,
    reviewed: 2,
  }[status];
}

export function workflowStatusLabel(status: RuleWorkflowStatus): string {
  return {
    approved: "Aprobada",
    draft_unvalidated: "Borrador",
    in_review: "En revisión",
    published: "Publicada",
    retired: "Retirada",
    reviewed: "Revisada",
  }[status];
}

function workflowActionLabel(action: RuleWorkflowAction): string {
  return {
    approved: "Versión aprobada",
    changes_requested: "Cambios solicitados",
    professionally_reviewed: "Revisión profesional registrada",
    submitted: "Enviada a revisión",
    withdrawn: "Retirada de revisión",
  }[action];
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value.replace(" ", "T") + "Z"));
}
