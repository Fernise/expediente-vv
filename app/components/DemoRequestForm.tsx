"use client";
import { I18nText, LocalizedControl } from "@/app/components/Language";


import { type FormEvent, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Send } from "lucide-react";
import { PremiumSelect } from "@/app/components/PremiumSelect";

export function DemoRequestForm() {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const response = await fetch("/api/pilot/demo-requests", {
        body: JSON.stringify({
          ...payload,
          communicationsConsent: form.has("communicationsConsent"),
          privacyAccepted: form.has("privacyAccepted"),
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "No hemos podido enviar la solicitud.");
        return;
      }
      setSent(true);
    } catch {
      setError("No hay conexión. Comprueba la red y vuelve a intentarlo.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="demo-request-success" role="status">
        <CheckCircle2 aria-hidden="true" />
        <div>
          <span className="eyebrow"><I18nText>Solicitud recibida</I18nText></span>
          <h2><I18nText>Gracias. Revisaremos si el piloto encaja con tu equipo.</I18nText></h2>
          <p><I18nText>
            Te responderemos en el correo indicado. No envíes documentación ni
            datos de viviendas por esta vía.
          </I18nText></p>
          <Link className="button button-secondary" href="/comprobador"><I18nText>
            Probar el comprobador orientativo
          </I18nText></Link>
        </div>
      </div>
    );
  }

  return (
    <form className="demo-request-form" onSubmit={submit}>
      <div className="public-form-grid">
        <label className="field">
          <span><I18nText>Nombre y apellidos *</I18nText></span>
          <input autoComplete="name" maxLength={80} minLength={2} name="fullName" required />
        </label>
        <label className="field">
          <span><I18nText>Correo profesional *</I18nText></span>
          <input autoComplete="email" maxLength={180} name="email" required type="email" />
        </label>
        <label className="field field-span-2">
          <span><I18nText>Organización o marca profesional *</I18nText></span>
          <input autoComplete="organization" maxLength={120} minLength={2} name="organizationName" required />
        </label>
        <div className="field">
          <span><I18nText>Perfil profesional *</I18nText></span>
          <PremiumSelect
            ariaLabel="Perfil profesional"
            name="professionalProfile"
            options={[
              { label: "Gestoría", value: "gestoria" },
              { label: "Gestor/a de viviendas", value: "gestor" },
              { label: "Arquitectura o perfil técnico", value: "arquitectura" },
              { label: "Asesoría legal", value: "legal" },
              { label: "Otro perfil profesional", value: "otro" },
            ]}
            placeholder="Selecciona tu perfil"
          />
        </div>
        <div className="field">
          <span><I18nText>Viviendas gestionadas *</I18nText></span>
          <PremiumSelect
            ariaLabel="Número de viviendas gestionadas"
            name="propertyRange"
            options={[
              { label: "Entre 1 y 5", value: "1-5" },
              { label: "Entre 6 y 20", value: "6-20" },
              { label: "Entre 21 y 50", value: "21-50" },
              { label: "Más de 50", value: "51+" },
            ]}
            placeholder="Selecciona un rango"
          />
        </div>
        <label className="field field-span-2">
          <span><I18nText>¿Qué te gustaría validar? </I18nText><small><I18nText>(opcional)</I18nText></small></span>
          <LocalizedControl as="textarea"
            maxLength={600}
            name="message"
            placeholder="Por ejemplo: coordinación con colaboradores, vencimientos o control de expedientes…"
            rows={4}
          />
        </label>
        <label aria-hidden="true" className="form-honeypot"><I18nText>
          Sitio web
          </I18nText><input autoComplete="off" name="website" tabIndex={-1} />
        </label>
      </div>
      <div className="consent-stack">
        <label>
          <input name="privacyAccepted" required type="checkbox" />
          <span><I18nText>
            He leído la </I18nText><Link href="/legal/privacidad"><I18nText>información de privacidad</I18nText></Link><I18nText> y
            acepto que se usen estos datos para responder a mi solicitud. *
          </I18nText></span>
        </label>
        <label>
          <input name="communicationsConsent" type="checkbox" />
          <span><I18nText>
            Quiero recibir novedades ocasionales sobre el piloto. Puedo retirar
            este consentimiento en cualquier momento.
          </I18nText></span>
        </label>
      </div>
      {error ? <p className="form-error" role="alert"><I18nText>{error}</I18nText></p> : null}
      <button className="button button-primary button-large" disabled={submitting} type="submit">
        <Send aria-hidden="true" />
        <I18nText>{submitting ? "Enviando solicitud…" : "Solicitar demostración"}</I18nText>
      </button>
      <p className="public-form-note"><I18nText>
        No incluyas direcciones, documentos ni datos personales de propietarios.
        Conservaremos la solicitud durante un máximo de 12 meses.
      </I18nText></p>
    </form>
  );
}
