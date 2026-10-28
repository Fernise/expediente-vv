import { localizedMetadata } from "@/lib/server-locale";

import { I18nText } from "@/app/components/Language";
import type { Metadata } from "next";
import { ExternalLink, Info } from "lucide-react";
import { PublicDossierChecker } from "@/app/components/PublicDossierChecker";
import { PublicFooter, PublicHeader } from "@/app/components/PublicChrome";
import { chatGPTSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({
  title: "Comprobador documental orientativo — Expediente VV",
  description:
    "Revisa cómo organizas el expediente documental de una vivienda vacacional sin obtener conclusiones legales.",
  });
}

export default async function CheckerPage() {
  const user = await getChatGPTUser();
  const appHref = user ? "/app" : chatGPTSignInPath("/app");
  return (
    <main className="public-page checker-page">
      <PublicHeader appHref={appHref} signedIn={Boolean(user)} />
      <section className="public-hero checker-hero">
        <span className="pilot-chip"><I18nText>Comprobación gratuita · 2 minutos</I18nText></span>
        <h1><I18nText>¿Está tu expediente organizado para trabajar?</I18nText></h1>
        <p><I18nText>
          Responde seis preguntas sobre control documental. No pediremos datos
          de la vivienda y no evaluaremos su situación jurídica.
        </I18nText></p>
        <div className="checker-scope-note">
          <Info aria-hidden="true" />
          <span><I18nText>
            El resultado se limita a organización, trazabilidad y siguientes
            acciones. Una respuesta positiva nunca significa “cumple”.
          </I18nText></span>
        </div>
      </section>
      <section className="checker-layout">
        <PublicDossierChecker />
        <aside className="checker-aside">
          <span className="eyebrow"><I18nText>Antes de empezar</I18nText></span>
          <h2><I18nText>No necesitas preparar nada.</I18nText></h2>
          <ul>
            <li><I18nText>No escribas una dirección ni referencia catastral.</I18nText></li>
            <li><I18nText>No subas documentos ni nombres de propietarios.</I18nText></li>
            <li><I18nText>Responde según tu proceso actual, aunque no estés seguro.</I18nText></li>
          </ul>
          <div className="official-source-card">
            <strong><I18nText>Trámite oficial</I18nText></strong>
            <p><I18nText>
              Para información administrativa consulta siempre la Sede
              Electrónica del Gobierno de Canarias.
            </I18nText></p>
            <a
              href="https://sede.gobiernodecanarias.org/sede/tramites/5548"
              rel="noreferrer"
              target="_blank"
            ><I18nText>
              Abrir procedimiento oficial </I18nText><ExternalLink aria-hidden="true" />
            </a>
          </div>
        </aside>
      </section>
      <PublicFooter />
    </main>
  );
}
