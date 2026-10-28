"use client";
import { I18nText } from "@/app/components/Language";


export default function WorkspaceError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="workspace-content">
      <section className="operations-card" role="alert">
        <h1><I18nText>No hemos podido abrir esta sección.</I18nText></h1>
        <p><I18nText>Comprueba la conexión y vuelve a intentarlo. No se ha confirmado ninguna acción pendiente.</I18nText></p>
        <button className="button button-primary" onClick={reset} type="button"><I18nText>Reintentar</I18nText></button>
        <a className="button button-secondary" href="/app"><I18nText>Volver al resumen</I18nText></a>
      </section>
    </main>
  );
}
