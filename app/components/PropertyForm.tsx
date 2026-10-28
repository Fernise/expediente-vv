"use client";
import { I18nText, LocalizedControl } from "@/app/components/Language";


import {
  type FormEvent,
  type KeyboardEvent,
  useId,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Check, ShieldCheck } from "lucide-react";
import { PremiumSelect } from "@/app/components/PremiumSelect";
import { DatePicker } from "@/app/components/DatePicker";
import {usePropertyFormFeedback,PropertyFormFeedback} from "@/app/components/PropertyFormFeedback";
import {PropertyVerificationNote} from "@/app/components/PropertyVerificationNote";
import { useMutationRequest, propertyMutationFailureMessage } from "@/lib/mutation-request";
import {
  canaryIslands,
  isIslandCode,
  municipalityNameForIsland,
  municipalitiesForIsland,
  municipalitiesMatchingIsland,
  type IslandCode,
} from "@/lib/canary-data";

export function PropertyForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const feedback=usePropertyFormFeedback();
  const mutation = useMutationRequest();
  const [error, setError] = useState("");
  const [islandCode, setIslandCode] = useState<IslandCode | "">("");
  const [municipality, setMunicipality] = useState("");
  const [municipalityQuery, setMunicipalityQuery] = useState("");
  const [municipalityOpen, setMunicipalityOpen] = useState(false);
  const [highlightedMunicipality, setHighlightedMunicipality] = useState(-1);
  const pilotAnonymized = true;
  const [ownerName, setOwnerName] = useState("Propietario 01");
  const [submitting, setSubmitting] = useState(false);
  const municipalityListId = useId();
  const municipalityOptions = municipalitiesForIsland(islandCode);
  const municipalityMatches = municipalitiesMatchingIsland(
    islandCode,
    municipalityQuery,
  );
  const municipalityLocked = municipalityOptions.length === 1;

  function chooseMunicipality(value: string) {
    setMunicipality(value);
    setMunicipalityQuery(value);
    setMunicipalityOpen(false);
    setHighlightedMunicipality(-1);
    setError("");
  }

  function handleMunicipalityKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    if (municipalityLocked) return;
    if (event.key === "ArrowDown" && municipalityMatches.length) {
      event.preventDefault();
      setMunicipalityOpen(true);
      setHighlightedMunicipality((current) =>
        current < municipalityMatches.length - 1 ? current + 1 : 0,
      );
    } else if (event.key === "ArrowUp" && municipalityMatches.length) {
      event.preventDefault();
      setMunicipalityOpen(true);
      setHighlightedMunicipality((current) =>
        current > 0 ? current - 1 : municipalityMatches.length - 1,
      );
    } else if (
      event.key === "Enter" &&
      municipalityOpen &&
      highlightedMunicipality >= 0
    ) {
      event.preventDefault();
      chooseMunicipality(municipalityMatches[highlightedMunicipality]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setMunicipalityQuery(municipality);
      setMunicipalityOpen(false);
      setHighlightedMunicipality(-1);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    if(!feedback.validate(payload))return;
    const selectedMunicipality = municipalityNameForIsland(
      String(payload.islandCode ?? ""),
      String(payload.municipality ?? ""),
    );
    if (!selectedMunicipality) {
      setError("Selecciona uno de los municipios disponibles para la isla.");
      const municipalityInput =
        event.currentTarget.querySelector<HTMLInputElement>(
          "[data-municipality-search]",
        );
      municipalityInput?.focus();
      return;
    }
    payload.municipality = selectedMunicipality;
    if (!mutation.begin()) return;
    setSubmitting(true);

    try {
      const body = JSON.stringify({ ...payload, organizationId });
      const response = await fetch("/api/properties", {
        body,
        headers: { "content-type": "application/json", ...await mutation.headers(body) },
        method: "POST",
      });
      const result = (await response.json()) as {
        error?: string;
        fieldErrors?:Record<string,string>;
        property?: { id: string };
      };
      if (!response.ok || !result.property) {
        if (response.status < 500 && response.status !== 409) mutation.clear();
        setError(result.fieldErrors ? "" : result.error ?? "No hemos podido crear la vivienda.");
        if(result.fieldErrors)feedback.setErrors(result.fieldErrors);
        requestAnimationFrame(()=>feedback.formRef.current?.querySelector<HTMLElement>("[role=alert]")?.focus());
        setSubmitting(false);
        return;
      }
      router.replace(`/app/properties/${result.property.id}?created=1`);
    } catch (error) {
      setError(propertyMutationFailureMessage(error,window.location.hostname));
      requestAnimationFrame(()=>feedback.formRef.current?.querySelector<HTMLElement>("[role=alert]")?.focus());
      setSubmitting(false);
    } finally {
      mutation.end();
    }
  }

  return (
    <form ref={feedback.formRef} noValidate aria-busy={submitting} className="property-form" onSubmit={handleSubmit} onChange={feedback.recheck} onBlurCapture={feedback.recheck}>
      <PropertyFormFeedback formRef={feedback.formRef} errors={feedback.errors}/>
      {error ? <p className="form-error" role="alert" tabIndex={-1}><I18nText>{error}</I18nText></p> : null}
      <PropertyVerificationNote />
      <section className={`pilot-mode-card ${pilotAnonymized ? "active" : ""}`}>
        <div className="pilot-mode-icon"><ShieldCheck aria-hidden="true" /></div>
        <div>
          <span className="eyebrow"><I18nText>Prueba controlada</I18nText></span>
          <h2><I18nText>Usar datos anonimizados</I18nText></h2>
          <p><I18nText>
            Mantén fuera del expediente los identificadores directos y activa
            avisos adicionales en comentarios y documentos.
          </I18nText></p>
          {pilotAnonymized ? (
            <ul>
              <li><I18nText>Dirección y catastro opcionales con formatos de prueba</I18nText></li>
              <li><I18nText>Propietario identificado solo mediante alias</I18nText></li>
              <li><I18nText>Contactos ficticios; sin DNI, NIE, IBAN ni firmas</I18nText></li>
            </ul>
          ) : null}
        </div>
        <LocalizedControl as="label"
          className="pilot-mode-toggle"
          title="Los datos reales se habilitarán cuando la identidad reforzada y el antivirus externo estén verificados."
        >
          <input
            checked
            disabled
            readOnly
            type="checkbox"
          />
          <span><I18nText>Obligatorio en el piloto</I18nText></span>
        </LocalizedControl>
        <input
          name="dataProfile"
          type="hidden"
          value="pilot_anonymized"
        />
      </section>

      <section className="form-section">
        <div className="form-section-heading">
          <span>01</span>
          <div>
            <h2><I18nText>Identificación de la vivienda</I18nText></h2>
            <p><I18nText>Identifica el expediente sin añadir información innecesaria.</I18nText></p>
          </div>
        </div>
        <div className="form-grid">
          <label className="field field-span-2">
            <span><I18nText>Alias de la vivienda *</I18nText></span>
            <LocalizedControl as="input"
              autoFocus
              maxLength={80}
              minLength={2}
              name="alias"
              placeholder={pilotAnonymized ? "Ej. Vivienda piloto 01" : "Ej. Casa Atlántico"}
              required
            />
          </label>
          <label className="field field-span-2">
            <span><I18nText>Dirección</I18nText></span>
            <LocalizedControl as="input"
              autoComplete={pilotAnonymized ? "off" : "street-address"}
              maxLength={180}
              minLength={2}
              name="addressLine"
              placeholder={
                pilotAnonymized
                  ? "Calle Ejemplo 1"
                  : "Calle, número y unidad (opcional)"
              }
            />
            <small>
              <I18nText>{pilotAnonymized
                ? "Opcional: Calle Ejemplo 1, Calle Ficticia 2 o Calle Inventada 3. No uses una dirección real."
                : "Opcional. Puedes completarla más adelante."}</I18nText>
            </small>
          </label>
          <div className="field">
            <span><I18nText>Isla *</I18nText></span>
            <PremiumSelect
              ariaLabel="Isla de la vivienda"
              name="islandCode"
              onChange={(nextIsland) => {
                if (!isIslandCode(nextIsland)) {
                  setIslandCode("");
                  setMunicipality("");
                  return;
                }
                const nextMunicipalities =
                  municipalitiesForIsland(nextIsland);
                const defaultMunicipality =
                  nextMunicipalities.length === 1
                    ? nextMunicipalities[0]
                    : "";
                setIslandCode(nextIsland);
                setMunicipality(defaultMunicipality);
                setMunicipalityQuery(defaultMunicipality);
                setMunicipalityOpen(false);
                setHighlightedMunicipality(-1);
                setError("");
              }}
              options={canaryIslands.map((island) => ({
                description:
                  island.code === "GR"
                    ? "Administrativamente pertenece a Teguise"
                    : undefined,
                label: island.name,
                value: island.code,
              }))}
              placeholder="Selecciona una isla"
              value={islandCode}
            />
          </div>
          <div className="field">
            <label htmlFor={`${municipalityListId}-search`}><I18nText>
              Municipio *
            </I18nText></label>
            <input name="municipality" type="hidden" value={municipality} />
            {municipalityLocked ? (
              <div className="municipality-locked">
                <input
                  aria-describedby="municipality-help"
                  aria-readonly="true"
                  data-municipality-search
                  id={`${municipalityListId}-search`}
                  readOnly
                  value={municipality}
                />
                <span><I18nText>Asignado por la isla</I18nText></span>
              </div>
            ) : (
              <div className="municipality-combobox">
                <LocalizedControl as="input"
                  aria-activedescendant={
                    municipalityOpen && highlightedMunicipality >= 0
                      ? `${municipalityListId}-${highlightedMunicipality}`
                      : undefined
                  }
                  aria-autocomplete="list"
                  aria-controls={municipalityListId}
                  aria-describedby="municipality-help"
                  aria-expanded={municipalityOpen}
                  aria-haspopup="listbox"
                  autoComplete="off"
                  data-municipality-search
                  disabled={!islandCode}
                  id={`${municipalityListId}-search`}
                  maxLength={100}
                  onBlur={() => {
                    const exactMunicipality = municipalityNameForIsland(
                      islandCode,
                      municipalityQuery,
                    );
                    if (exactMunicipality) {
                      chooseMunicipality(exactMunicipality);
                    } else {
                      setMunicipality("");
                      setMunicipalityQuery("");
                      setMunicipalityOpen(false);
                      setHighlightedMunicipality(-1);
                    }
                  }}
                  onChange={(event) => {
                    setMunicipality("");
                    setMunicipalityQuery(event.target.value);
                    setMunicipalityOpen(true);
                    setHighlightedMunicipality(-1);
                  }}
                  onFocus={() => {
                    if (islandCode) setMunicipalityOpen(true);
                  }}
                  onKeyDown={handleMunicipalityKeyDown}
                  placeholder={
                    islandCode
                      ? `Buscar entre ${municipalityOptions.length} opciones`
                      : "Selecciona primero una isla"
                  }
                  role="combobox"
                  spellCheck={false}
                  type="search"
                  value={municipalityQuery}
                />
                {municipalityOpen && islandCode ? (
                  <ul
                    className="municipality-options"
                    id={municipalityListId}
                    role="listbox"
                  >
                    {municipalityMatches.length ? (
                      municipalityMatches.map((option, index) => (
                        <li key={option} role="presentation">
                          <button
                            aria-selected={municipality === option}
                            className={
                              highlightedMunicipality === index
                                ? "highlighted"
                                : undefined
                            }
                            id={`${municipalityListId}-${index}`}
                            onClick={() => chooseMunicipality(option)}
                            onMouseDown={(event) => event.preventDefault()}
                            role="option"
                            type="button"
                          >
                            <span>{option}</span>
                            {municipality === option ? (
                              <Check aria-hidden="true" />
                            ) : null}
                          </button>
                        </li>
                      ))
                    ) : (
                      <li className="municipality-empty"><I18nText>
                        No hay municipios con esa búsqueda.
                      </I18nText></li>
                    )}
                  </ul>
                ) : null}
              </div>
            )}
            <small id="municipality-help">
              {municipalityLocked
                ? "La Graciosa pertenece administrativamente a Teguise."
                : islandCode
                ? `${municipalityOptions.length} ${
                    municipalityOptions.length === 1
                      ? "municipio disponible"
                      : "municipios disponibles"
                  }. Escribe y elige una opción de la lista.`
                : "Las opciones aparecerán al seleccionar la isla."}
            </small>
          </div>
          <label className="field">
            <span><I18nText>Código postal *</I18nText></span>
            <input
              autoComplete="postal-code"
              inputMode="numeric"
              maxLength={5}
              name="postalCode"
              pattern="[0-9]{5}"
              required
            />
            <small><I18nText>Comprobación parcial: formato y provincia. La relación con municipio y calle aún no está verificada.</I18nText></small>
          </label>
          <label className="field">
            <span><I18nText>Referencia catastral</I18nText></span>
            <input
              maxLength={30}
              name="cadastralReference"
              placeholder="DEMO-001"
            />
            <small>
              <I18nText>{pilotAnonymized
                ? "Opcional: DEMO- seguido de letras o números. No se consulta el Catastro."
                : "Opcional. Se tratará como dato restringido."}</I18nText>
            </small>
          </label>
          <div className="field">
            <span><I18nText>Estado de actividad</I18nText></span>
            <PremiumSelect
              ariaLabel="Estado de actividad"
              defaultValue="not_started"
              name="activityStatus"
              options={[
                { label: "No iniciada", value: "not_started" },
                { label: "Activa", value: "active" },
                { label: "Pausada", value: "paused" },
                { label: "Cesada", value: "ceased" },
              ]}
            />
          </div>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-heading">
          <span>02</span>
          <div>
            <h2><I18nText>Propietario</I18nText></h2>
            <p><I18nText>Solo pedimos los datos necesarios para coordinar el expediente.</I18nText></p>
          </div>
        </div>
        <div className="form-grid">
          <label className="field field-span-2">
            <span>
              <I18nText>{pilotAnonymized ? "Alias del propietario *" : "Nombre o razón social *"}</I18nText>
            </span>
            <input
              maxLength={120}
              minLength={2}
              name="ownerName"
              onChange={(event) => setOwnerName(event.target.value)}
              required
              value={ownerName}
            />
            {pilotAnonymized ? (
              <small><I18nText>Puedes cambiarlo: Propietario 02 o Titular A-2. Este alias no crea una cuenta.</I18nText></small>
            ) : null}
          </label>
          <label className="field">
            <span><I18nText>Correo</I18nText></span>
            <input
              autoComplete="off"
              maxLength={180}
              name="ownerEmail"
              placeholder="propietario02@example.invalid"
              type="email"
            />
            <small><I18nText>Solo @example.invalid. Contacto ficticio; no crea una cuenta ni recibe avisos.</I18nText></small>
          </label>
          <label className="field">
            <span><I18nText>Teléfono</I18nText></span>
            <input
              autoComplete="off"
              maxLength={30}
              name="ownerPhone"
              placeholder="000000000"
              type="tel"
            />
            <small><I18nText>Usa 000000000 o deja el campo vacío.</I18nText></small>
          </label>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-heading">
          <span>03</span>
          <div>
            <h2><I18nText>Siguiente acción</I18nText></h2>
            <p><I18nText>
              Define el primer paso. Después podrás cambiar responsable y fecha.
            </I18nText></p>
          </div>
        </div>
        <div className="form-grid">
          <label className="field field-span-2">
            <span><I18nText>Próxima acción</I18nText></span>
            <LocalizedControl as="input"
              maxLength={160}
              name="nextAction"
              placeholder="Completar documentación pendiente"
            />
          </label>
          <label className="field">
            <span><I18nText>Fecha objetivo</I18nText></span>
            <DatePicker name="nextActionDueAt" disabled={submitting} />
          </label>
        </div>
      </section>

      <div className="form-actions">
        <button
          className="button button-secondary"
          disabled={submitting}
          onClick={() => router.push("/app/properties")}
          type="button"
        ><I18nText>
          Cancelar
        </I18nText></button>
        <button className="button button-primary" disabled={submitting} type="submit">
          <I18nText>{submitting ? "Creando y abriendo…" : "Crear vivienda"}</I18nText>
        </button>
      </div>
      <p className="form-legal-note"><I18nText>
        Al crearla, entrarás directamente en su expediente. El checklist inicial
        es un borrador operativo y no constituye asesoramiento jurídico.
      </I18nText></p>
    </form>
  );
}
