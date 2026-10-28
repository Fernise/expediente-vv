"use client";
import { I18nText, LocalizedControl } from "@/app/components/Language";


import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, Download, RotateCcw, Trash2 } from "lucide-react";

type DataPrivacyControlsProps = {
  deletionScheduledAt: string | null;
  organizationId: string;
  organizationName: string;
};

export function DataPrivacyControls({
  deletionScheduledAt,
  organizationId,
  organizationName,
}: DataPrivacyControlsProps) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState<"cancel" | "delete" | null>(null);
  const [error, setError] = useState("");

  async function requestDeletion() {
    if (busy || confirmation !== organizationName || !acknowledged) return;
    setBusy("delete");
    setError("");
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/deletion`,
        {
          body: JSON.stringify({ confirmation }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo programar la eliminación.");
      }
      setConfirmation("");
      setAcknowledged(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo programar la eliminación.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function cancelDeletion() {
    if (busy) return;
    setBusy("cancel");
    setError("");
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/deletion`,
        { method: "DELETE" },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo cancelar la eliminación.");
      }
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo cancelar la eliminación.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <section className="privacy-export-card">
        <div className="privacy-card-icon export"><Download aria-hidden="true" /></div>
        <div>
          <span className="eyebrow"><I18nText>Portabilidad</I18nText></span>
          <h2><I18nText>Descargar una copia completa</I18nText></h2>
          <p><I18nText>
            El paquete ZIP incluye los datos estructurados, la auditoría y las
            versiones de documentos que superaron el control técnico.
          </I18nText></p>
          <div className="privacy-actions">
            <a
              className="button button-primary"
              href={`/api/exports/organization?organizationId=${encodeURIComponent(organizationId)}`}
            >
              <Download aria-hidden="true" /><I18nText> Descargar paquete ZIP
            </I18nText></a>
            <a
              className="button button-secondary"
              href={`/api/exports/properties?organizationId=${encodeURIComponent(organizationId)}`}
            ><I18nText>
              Descargar viviendas CSV
            </I18nText></a>
          </div>
          <small><I18nText>
            Si el paquete supera 250 MB, los documentos deberán descargarse
            desde cada expediente durante el piloto.
          </I18nText></small>
        </div>
      </section>

      <section className={`privacy-delete-card ${deletionScheduledAt ? "scheduled" : ""}`}>
        <div className="privacy-card-icon delete">
          {deletionScheduledAt ? <AlertTriangle aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
        </div>
        <div>
          <span className="eyebrow"><I18nText>Borrado del espacio</I18nText></span>
          {deletionScheduledAt ? (
            <>
              <h2><I18nText>Eliminación programada</I18nText></h2>
              <p><I18nText>
                El espacio y sus archivos se eliminarán definitivamente a partir
                del </I18nText><strong>{formatDate(deletionScheduledAt)}</strong><I18nText>. Hasta
                entonces funciona con normalidad y puedes cancelar la solicitud.
              </I18nText></p>
              <button
                className="button button-secondary"
                disabled={busy !== null}
                onClick={cancelDeletion}
                type="button"
              >
                <RotateCcw aria-hidden="true" />
                <I18nText>{busy === "cancel" ? "Cancelando…" : "Cancelar eliminación"}</I18nText>
              </button>
            </>
          ) : (
            <>
              <h2><I18nText>Eliminar este espacio</I18nText></h2>
              <p><I18nText>
                La solicitud abre un periodo de recuperación de 30 días. Después
                se borran viviendas, equipo, historial y archivos privados.
              </I18nText></p>
              <div className="privacy-confirmation">
                <label htmlFor="delete-confirmation"><I18nText>
                  Escribe </I18nText><strong>{organizationName}</strong><I18nText> para confirmar
                </I18nText></label>
                <LocalizedControl as="input"
                  autoComplete="off"
                  id="delete-confirmation"
                  onChange={(event) => setConfirmation(event.target.value)}
                  placeholder={organizationName}
                  value={confirmation}
                />
                <label className="privacy-check">
                  <input
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                    type="checkbox"
                  />
                  <span><I18nText>He descargado lo que necesito conservar.</I18nText></span>
                </label>
                <button
                  className="button button-danger"
                  disabled={
                    busy !== null ||
                    confirmation !== organizationName ||
                    !acknowledged
                  }
                  onClick={requestDeletion}
                  type="button"
                >
                  <Trash2 aria-hidden="true" />
                  <I18nText>{busy === "delete"
                    ? "Programando…"
                    : "Programar eliminación"}</I18nText>
                </button>
              </div>
            </>
          )}
          {error ? <p className="form-error" role="alert"><I18nText>{error}</I18nText></p> : null}
        </div>
      </section>
    </>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "long",
    timeZone: "Atlantic/Canary",
  }).format(new Date(value.replace(" ", "T") + (value.includes("Z") ? "" : "Z")));
}
