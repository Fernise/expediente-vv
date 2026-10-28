"use client";
import { I18nText } from "@/app/components/Language";


import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function OperationsRunControls({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function runNow() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/operations/run", {
        body: JSON.stringify({ cycle: "notifications", organizationId }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        executed?: boolean;
      };
      if (!response.ok) throw new Error(payload.error || "No se pudo ejecutar la comprobación.");
      setMessage(
        payload.executed
          ? "Comprobación completada."
          : "El ciclo de este intervalo ya estaba completado.",
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo ejecutar la comprobación.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="operations-run-controls">
      <button className="button button-secondary" disabled={busy} onClick={runNow} type="button">
        <RefreshCw aria-hidden="true" />
        <I18nText>{busy ? "Comprobando…" : "Comprobar ahora"}</I18nText>
      </button>
      {message ? <small aria-live="polite"><I18nText>{message}</I18nText></small> : null}
    </div>
  );
}
