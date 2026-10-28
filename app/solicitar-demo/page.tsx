import { localizedMetadata } from "@/lib/server-locale";

import { I18nText } from "@/app/components/Language";
import type { Metadata } from "next";
import { Clock3, LockKeyhole, Users } from "lucide-react";
import { DemoRequestForm } from "@/app/components/DemoRequestForm";
import { PublicFooter, PublicHeader } from "@/app/components/PublicChrome";
import { chatGPTSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({
  title: "Solicitar demostración — Expediente VV",
  description:
    "Solicita acceso al piloto privado de Expediente VV para profesionales de Canarias.",
  });
}

export default async function DemoRequestPage() {
  const user = await getChatGPTUser();
  const appHref = user ? "/app" : chatGPTSignInPath("/app");
  return (
    <main className="public-page">
      <PublicHeader appHref={appHref} signedIn={Boolean(user)} />
      <section className="demo-request-layout">
        <div className="demo-request-copy">
          <span className="pilot-chip"><I18nText>Piloto privado · Canarias</I18nText></span>
          <h1><I18nText>Cuéntanos cómo gestionas tus expedientes.</I18nText></h1>
          <p><I18nText>
            Buscamos equipos profesionales que quieran probar un flujo de
            control documental con información ficticia o anonimizada.
          </I18nText></p>
          <div className="demo-expectations">
            <article><Clock3 aria-hidden="true" /><div><strong><I18nText>Respuesta personal</I18nText></strong><span><I18nText>Revisaremos el encaje y te contactaremos por correo.</I18nText></span></div></article>
            <article><Users aria-hidden="true" /><div><strong><I18nText>Validación acompañada</I18nText></strong><span><I18nText>Nos interesa el proceso de tu equipo, no venderte una promesa.</I18nText></span></div></article>
            <article><LockKeyhole aria-hidden="true" /><div><strong><I18nText>Datos mínimos</I18nText></strong><span><I18nText>No pedimos documentos, direcciones ni información de propietarios.</I18nText></span></div></article>
          </div>
        </div>
        <div className="demo-form-card">
          <span className="eyebrow"><I18nText>Solicitud de acceso</I18nText></span>
          <h2><I18nText>Datos profesionales</I18nText></h2>
          <p><I18nText>Los utilizaremos para responder y valorar la participación en el piloto.</I18nText></p>
          <DemoRequestForm />
        </div>
      </section>
      <PublicFooter />
    </main>
  );
}
