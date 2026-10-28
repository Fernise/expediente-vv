import { localizedMetadata } from "@/lib/server-locale";

import { I18nText } from "@/app/components/Language";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Info, Sparkles } from "lucide-react";
import { PublicFooter, PublicHeader } from "@/app/components/PublicChrome";
import { chatGPTSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({
  title: "Precios del piloto — Expediente VV",
  description:
    "Condiciones provisionales del piloto de Expediente VV para equipos profesionales en Canarias.",
  });
}

export default async function PricingPage() {
  const user = await getChatGPTUser();
  const appHref = user ? "/app" : chatGPTSignInPath("/app");
  return (
    <main className="public-page">
      <PublicHeader appHref={appHref} signedIn={Boolean(user)} />
      <section className="public-hero compact-public-hero">
        <span className="pilot-chip"><Sparkles aria-hidden="true" /><I18nText> Beta privada · sin contratación</I18nText></span>
        <h1><I18nText>Prueba el flujo de trabajo. Sin pagos ni permanencia.</I18nText></h1>
        <p><I18nText>
          Queremos validar el flujo de trabajo antes de fijar una tarifa
          comercial. Todavía no puedes contratar una suscripción. Durante esta fase no hay pagos ni permanencia.
        </I18nText></p>
      </section>

      <section className="pricing-layout">
        <article className="pilot-price-card">
          <div>
            <span className="eyebrow"><I18nText>Acceso de evaluación</I18nText></span>
            <h2><I18nText>Acceso por invitación</I18nText></h2>
            <p className="pilot-price"><strong>0 €</strong><span><I18nText>durante la validación</I18nText></span></p>
          </div>
          <ul>
            <li><Check aria-hidden="true" /><I18nText> Espacio de trabajo para tu equipo</I18nText></li>
            <li><Check aria-hidden="true" /><I18nText> Viviendas y expedientes de prueba anonimizados</I18nText></li>
            <li><Check aria-hidden="true" /><I18nText> Checklist, documentos, alertas e informe PDF</I18nText></li>
            <li><Check aria-hidden="true" /><I18nText> Acompañamiento para recoger incidencias</I18nText></li>
            <li><Check aria-hidden="true" /><I18nText> Exportación de datos antes de abandonar el piloto</I18nText></li>
          </ul>
          <Link className="button button-primary button-large button-wide" href="/solicitar-demo"><I18nText>
            Solicitar una plaza </I18nText><ArrowRight aria-hidden="true" />
          </Link>
          <small><I18nText>
            La participación no garantiza acceso futuro gratuito ni convierte
            las reglas de demostración en criterio profesional validado.
          </I18nText></small>
        </article>

        <aside className="pricing-context-card">
          <span className="eyebrow"><I18nText>Qué queremos aprender</I18nText></span>
          <h2><I18nText>La tarifa futura se diseñará con uso real.</I18nText></h2>
          <p><I18nText>
            Mediremos el volumen de viviendas, los perfiles del equipo y el
            ahorro de tiempo en coordinación documental. Antes de cobrar,
            comunicaremos alcance, precio y condiciones para una aceptación
            expresa.
          </I18nText></p>
          <div className="pricing-principles">
            <div><strong><I18nText>Sin pagos ahora</I18nText></strong><span><I18nText>No se solicitan tarjetas ni domiciliaciones.</I18nText></span></div>
            <div><strong><I18nText>Salida sencilla</I18nText></strong><span><I18nText>Puedes exportar y programar el borrado del espacio.</I18nText></span></div>
            <div><strong><I18nText>Producto en validación</I18nText></strong><span><I18nText>Las funciones pueden ajustarse durante el piloto.</I18nText></span></div>
          </div>
        </aside>
      </section>

      <section className="public-notice">
        <Info aria-hidden="true" />
        <p><I18nText>
          Expediente VV organiza trabajo documental. No certifica la legalidad,
          no sustituye trámites oficiales y no presta asesoramiento jurídico.
        </I18nText></p>
      </section>
      <PublicFooter />
    </main>
  );
}
