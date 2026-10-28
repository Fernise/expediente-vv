
import { I18nText } from "@/app/components/Language";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found-page">
      <section>
        <span className="eyebrow"><I18nText>Página no encontrada</I18nText></span>
        <h1><I18nText>No encontramos esta página.</I18nText></h1>
        <p><I18nText>Puede que la dirección haya cambiado o que el enlace ya no esté disponible.</I18nText></p>
        <Link className="button button-primary" href="/"><I18nText>Volver al inicio</I18nText></Link>
      </section>
    </main>
  );
}
