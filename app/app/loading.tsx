
import { I18nText } from "@/app/components/Language";
export default function WorkspaceLoading() {
  return (
    <main className="workspace-content" aria-busy="true">
      <section className="operations-card" role="status" aria-live="polite">
        <h1><I18nText>Abriendo tu espacio…</I18nText></h1>
        <p><I18nText>Estamos cargando la información de esta sección.</I18nText></p>
      </section>
    </main>
  );
}
