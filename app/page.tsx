import { localizedMetadata } from "@/lib/server-locale";

import { I18nText, LocalizedControl } from "@/app/components/Language";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Building2,
  Check,
  Circle,
  History,
  Info,
  LockKeyhole,
  LayoutDashboard,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { BrandMark } from "./components/BrandMark";
import { PendingLink } from "./components/PendingLink";
import { PublicFooter, PublicHeader } from "./components/PublicChrome";
import { chatGPTSignInPath, getChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({
  title: "Expediente VV — Control documental para viviendas vacacionales",
  description:
    "Organiza expedientes, documentos, vencimientos y revisiones profesionales de viviendas vacacionales en Canarias.",
  });
}

const outcomes = [
  {
    number: "01",
    text: "Qué viviendas necesitan atención",
  },
  {
    number: "02",
    text: "Qué documentos faltan o vencen pronto",
  },
  {
    number: "03",
    text: "Quién debe realizar la siguiente acción",
  },
];

export default async function Home() {
  const user = await getChatGPTUser();
  const appHref = user ? "/app" : chatGPTSignInPath("/app");

  return (
    <main className="landing-page">
      <div className="landing-orb landing-orb-one" />
      <div className="landing-orb landing-orb-two" />
      <PublicHeader appHref={appHref} signedIn={Boolean(user)} />

      <section className="landing-hero">
        <div className="hero-copy">
          <span className="pilot-chip">
            <Circle aria-hidden="true" fill="currentColor" /><I18nText> Beta privada · Canarias
          </I18nText></span>
          <h1><I18nText>
            Cada vivienda,
            </I18nText><em><I18nText>con todo su expediente a mano.</I18nText></em>
          </h1>
        </div>
        <div className="hero-introduction">
          <p><I18nText>
            Reúne viviendas, documentos y vencimientos para que tu equipo sepa
            qué falta, qué urge y quién lo mueve.
          </I18nText></p>
          <div className="hero-actions">
            <PendingLink className="button button-primary button-large" href={appHref}><I18nText>
              Explorar el panel </I18nText><ArrowRight aria-hidden="true" />
            </PendingLink>
            <Link className="button button-text button-large" href="/comprobador"><I18nText>
              Comprobar mi expediente
            </I18nText></Link>
          </div>
          <p className="legal-inline">
            <Info aria-hidden="true" /><I18nText>
            No certifica la legalidad ni sustituye el asesoramiento profesional
            o los trámites oficiales.
          </I18nText></p>
        </div>

        <LocalizedControl as="div" className="hero-product" aria-label="Vista previa del panel">
          <div className="product-window">
            <div className="window-topbar">
              <span className="mini-brand">
                <BrandMark /> <strong><I18nText>Expediente VV</I18nText></strong>
              </span>
              <div className="window-org">
                <span><I18nText>GA</I18nText></span>
                <div>
                  <small><I18nText>Organización</I18nText></small>
                  <strong><I18nText>Gestoría Atlántico</I18nText></strong>
                </div>
              </div>
              <span className="window-user"><I18nText>AM</I18nText></span>
            </div>
            <div className="preview-workbench">
              <LocalizedControl as="nav" className="preview-navigation" aria-label="Acceso a la vista de demostración">
                <span className="eyebrow"><I18nText>Espacio de trabajo</I18nText></span>
                <Link className="selected" href={appHref}><LayoutDashboard aria-hidden="true" /><I18nText> Resumen</I18nText></Link>
                <Link href={user ? "/app/properties" : chatGPTSignInPath("/app/properties")}><Building2 aria-hidden="true" /><I18nText> Viviendas</I18nText></Link>
                <Link href={user ? "/app/alerts" : chatGPTSignInPath("/app/alerts")}><BellRing aria-hidden="true" /><I18nText> Avisos</I18nText></Link>
                <span className="preview-navigation-note"><I18nText>Vista de ejemplo</I18nText><br /><I18nText>Datos ficticios</I18nText></span>
              </LocalizedControl>
              <div className="window-body">
              <div className="window-title">
                <div>
                  <small><I18nText>Tu mesa de trabajo</I18nText></small>
                  <h2><I18nText>Necesitan atención</I18nText></h2>
                </div>
                <Link href={appHref}>
                  <Plus aria-hidden="true" /><I18nText> Vivienda
                </I18nText></Link>
              </div>
              <div className="preview-metrics">
                <article>
                  <span><I18nText>Pendientes</I18nText></span>
                  <strong>8</strong>
                  <small><I18nText>documentación</I18nText></small>
                </article>
                <article>
                  <span><I18nText>Vencen pronto</I18nText></span>
                  <strong>5</strong>
                  <small><I18nText>próximos 30 días</I18nText></small>
                </article>
                <article>
                  <span><I18nText>A revisión</I18nText></span>
                  <strong>3</strong>
                  <small><I18nText>por profesional</I18nText></small>
                </article>
              </div>
              <div className="preview-list">
                <div className="preview-list-heading"><span><I18nText>Vivienda / ubicación</I18nText></span><span><I18nText>Estado del expediente</I18nText></span></div>
                <Link aria-label="Abrir la demostración desde Casa Atlántico" href={appHref}>
                  <span className="preview-home coral"><I18nText>CA</I18nText></span>
                  <div>
                    <strong><I18nText>Casa Atlántico</I18nText></strong>
                    <small><I18nText>Las Palmas de G.C.</I18nText></small>
                  </div>
                  <span className="preview-status amber">
                    <Circle aria-hidden="true" fill="currentColor" /><I18nText> Pendiente documentación
                  </I18nText></span>
                  <ArrowRight aria-hidden="true" />
                </Link>
                <Link aria-label="Abrir la demostración desde Villa Marea" href={appHref}>
                  <span className="preview-home violet"><I18nText>VM</I18nText></span>
                  <div>
                    <strong><I18nText>Villa Marea</I18nText></strong>
                    <small><I18nText>Puerto de la Cruz</I18nText></small>
                  </div>
                  <span className="preview-status violet">
                    <Circle aria-hidden="true" fill="currentColor" /><I18nText> Requiere revisión
                  </I18nText></span>
                  <ArrowRight aria-hidden="true" />
                </Link>
                <Link aria-label="Abrir la demostración desde Apartamento Drago" href={appHref}>
                  <span className="preview-home blue"><I18nText>AD</I18nText></span>
                  <div>
                    <strong><I18nText>Apartamento Drago</I18nText></strong>
                    <small><I18nText>Teguise</I18nText></small>
                  </div>
                  <span className="preview-status blue">
                    <Circle aria-hidden="true" fill="currentColor" /><I18nText> Preparado para revisión
                  </I18nText></span>
                  <ArrowRight aria-hidden="true" />
                </Link>
              </div>
              <div className="preview-workbench-footer"><span><I18nText>3 expedientes de ejemplo</I18nText></span><Link href={appHref}><I18nText>Ver el espacio completo </I18nText><ArrowRight aria-hidden="true" /></Link></div>
              </div>
            </div>
          </div>
          <LocalizedControl as="div" className="hero-proofline" aria-label="Funciones destacadas">
            <span><Check aria-hidden="true" /><I18nText> Historial de versiones</I18nText></span>
            <span><BellRing aria-hidden="true" /><I18nText> Avisos con tiempo</I18nText></span>
          </LocalizedControl>
        </LocalizedControl>
      </section>

      <section className="outcome-strip" id="producto">
        <div className="outcome-intro">
          <span className="eyebrow"><I18nText>Nada más entrar</I18nText></span>
          <h2><I18nText>Lo importante, sin rebuscar en carpetas.</I18nText></h2>
        </div>
        <div className="outcome-grid">
          {outcomes.map((outcome) => (
            <article key={outcome.number}>
              <span>{outcome.number}</span>
              <p><I18nText>{outcome.text}</I18nText></p>
            </article>
          ))}
        </div>
      </section>

      <section className="professional-section" id="profesionales">
        <div>
          <span className="eyebrow"><I18nText>Trabajo real</I18nText></span>
          <h2><I18nText>Hecho para trabajar, no para adivinar.</I18nText></h2>
        </div>
        <div className="professional-grid">
          <article>
            <span><LockKeyhole aria-hidden="true" /></span>
            <h3><I18nText>Cada equipo, su espacio</I18nText></h3>
            <p><I18nText>Roles y accesos claros para que cada persona vea lo que necesita.</I18nText></p>
          </article>
          <article>
            <span><History aria-hidden="true" /></span>
            <h3><I18nText>Se ve qué cambió</I18nText></h3>
            <p><I18nText>Versiones, fechas y actividad sin depender de la memoria del equipo.</I18nText></p>
          </article>
          <article>
            <span><ShieldCheck aria-hidden="true" /></span>
            <h3><I18nText>Las dudas siguen siendo dudas</I18nText></h3>
            <p><I18nText>Lo pendiente queda señalado hasta que una persona lo revise.</I18nText></p>
          </article>
        </div>
      </section>

      <section className="pilot-section" id="piloto">
        <div>
          <span className="pilot-chip light"><I18nText>Beta privada · acceso autorizado</I18nText></span>
          <h2><I18nText>Queremos probarlo con quienes hacen este trabajo a diario.</I18nText></h2>
          <p><I18nText>
            Empezamos con datos ficticios o anonimizados. Buscamos gestorías y
            equipos de Canarias que quieran decirnos qué funciona y qué sobra.
          </I18nText></p>
        </div>
        <div className="pilot-actions">
          <Link className="button button-light button-large" href="/solicitar-demo"><I18nText>
            Solicitar demostración </I18nText><ArrowRight aria-hidden="true" />
          </Link>
          <PendingLink className="button button-ghost button-large" href={appHref}><I18nText>
            Entrar al panel
          </I18nText></PendingLink>
        </div>
      </section>

      <PublicFooter />
      <LocalizedControl as="section" aria-label="Información legal" className="landing-legal">
        <article id="aviso-legal">
          <span>01</span>
          <div>
            <h2><I18nText>Aviso legal</I18nText></h2>
            <p><I18nText>
              Expediente VV organiza información y tareas. No certifica la
              legalidad ni sustituye trámites oficiales o asesoramiento
              profesional. Contacto del piloto: </I18nText>{" "}
              <a href="mailto:expedientevv.canarias@gmail.com"><I18nText>
                expedientevv.canarias@gmail.com
              </I18nText></a>.
            </p>
            <Link href="/legal/aviso-legal"><I18nText>Leer aviso legal completo</I18nText></Link>
          </div>
        </article>
        <article id="privacidad">
          <span>02</span>
          <div>
            <h2><I18nText>Privacidad</I18nText></h2>
            <p><I18nText>
              El piloto separa los datos por organización, limita el acceso
              según el rol y mantiene los documentos en almacenamiento privado.
              La administración puede exportar el espacio y programar su borrado
              con 30 días de recuperación. Antes de tratar datos reales deben
              definirse las responsabilidades y plazos aplicables. Las
              solicitudes de demostración se conservan un máximo de 12 meses y
              el consentimiento para novedades es opcional.
            </I18nText></p>
            <Link href="/legal/privacidad"><I18nText>Leer información de privacidad</I18nText></Link>
          </div>
        </article>
        <article id="fuentes-oficiales">
          <span>03</span>
          <div>
            <h2><I18nText>Fuentes oficiales</I18nText></h2>
            <p><I18nText>
              Las reglas del laboratorio conservan su fuente, versión y fecha de
              consulta para que puedan ser revisadas. Consulta también el </I18nText>{" "}
              <a
                href="https://sede.gobiernodecanarias.org/sede/tramites/5548"
                rel="noreferrer"
                target="_blank"
              ><I18nText>
                procedimiento oficial en la Sede del Gobierno de Canarias
              </I18nText></a>.
            </p>
            <Link href="/legal/fuentes-oficiales"><I18nText>Consultar fuentes y alcance</I18nText></Link>
          </div>
        </article>
      </LocalizedControl>
    </main>
  );
}
