"use client";
import { WorkspaceGuide } from "@/app/components/WorkspaceGuide";
import {DatePicker} from "@/app/components/DatePicker";
import {usePropertyFormFeedback,PropertyFormFeedback} from "@/app/components/PropertyFormFeedback";
import {PropertyVerificationNote} from "@/app/components/PropertyVerificationNote";
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
import { useMutationRequest, propertyMutationFailureMessage } from "@/lib/mutation-request";
import type {
  PropertyDossier,
  PropertyManagerOption,
} from "@/db/properties";
import {
  canaryIslands,
  isIslandCode,
  municipalityNameForIsland,
  municipalitiesForIsland,
  municipalitiesMatchingIsland,
  type IslandCode,
} from "@/lib/canary-data";

type EditableDossier = Pick<
  PropertyDossier,
  | "activityStatus"
  | "addressLine"
  | "alias"
  | "cadastralReference"
  | "dataProfile"
  | "id"
  | "islandCode"
  | "managerName"
  | "municipality"
  | "nextAction"
  | "nextActionDueAt"
  | "ownerEmail"
  | "ownerName"
  | "ownerPhone"
  | "postalCode"
>;

export function PropertyEditForm({
  dossier,
  managers,
  organizationId,
}: {
  dossier: EditableDossier;
  managers: PropertyManagerOption[];
  organizationId: string;
}) {
  const router = useRouter();
  const feedback=usePropertyFormFeedback();
  const mutation = useMutationRequest();
  const listId = useId();
  const initialIsland = isIslandCode(dossier.islandCode)
    ? dossier.islandCode
    : "";
  const [islandCode, setIslandCode] = useState<IslandCode | "">(
    initialIsland,
  );
  const [municipality, setMunicipality] = useState(dossier.municipality);
  const [municipalityQuery, setMunicipalityQuery] = useState(
    dossier.municipality,
  );
  const [municipalityOpen, setMunicipalityOpen] = useState(false);
  const [highlightedMunicipality, setHighlightedMunicipality] = useState(-1);
  const [managerUserId, setManagerUserId] = useState(
    managers.find((manager) => manager.isCurrent)?.id ?? "",
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const municipalityOptions = municipalitiesForIsland(islandCode);
  const municipalityMatches = municipalitiesMatchingIsland(
    islandCode,
    municipalityQuery,
  );
  const municipalityLocked = municipalityOptions.length === 1;
  const anonymized = dossier.dataProfile === "pilot_anonymized";

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

  async function submit(event: FormEvent<HTMLFormElement>) {
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
      setError("Selecciona un municipio de la lista correspondiente a la isla.");
      event.currentTarget
        .querySelector<HTMLInputElement>("[data-municipality-search]")
        ?.focus();
      return;
    }
    payload.municipality = selectedMunicipality;
    if (!mutation.begin()) return;
    setSubmitting(true);

    try {
      const response = await fetch(`/api/properties/${dossier.id}`, {
        body: JSON.stringify({
          ...payload,
          action: "update",
          organizationId,
        }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      const result = (await response.json()) as { error?: string;fieldErrors?:Record<string,string> };
      if (!response.ok) {
        setError(result.fieldErrors ? "" : result.error ?? "No se pudieron guardar los cambios.");
        if(result.fieldErrors)feedback.setErrors(result.fieldErrors);
        requestAnimationFrame(()=>feedback.formRef.current?.querySelector<HTMLElement>("[role=alert]")?.focus());
        setSubmitting(false);
        return;
      }
      router.replace(`/app/properties/${dossier.id}?updated=1`);
    } catch (error) {
      setError(propertyMutationFailureMessage(error,window.location.hostname));
      requestAnimationFrame(()=>feedback.formRef.current?.querySelector<HTMLElement>("[role=alert]")?.focus());
      setSubmitting(false);
    } finally {
      mutation.end();
    }
  }

  return (
    <form ref={feedback.formRef} noValidate aria-busy={submitting} className="property-edit-form" onSubmit={submit} onChange={feedback.recheck} onBlurCapture={feedback.recheck}>
      <PropertyFormFeedback formRef={feedback.formRef} errors={feedback.errors}/>
      {error ? <p className="form-error" role="alert" tabIndex={-1}><I18nText>{error}</I18nText></p> : null}
      <div className={`edit-profile-note ${anonymized ? "anonymized" : ""}`}>
        <ShieldCheck aria-hidden="true" />
        <div>
          <strong>
            <I18nText>{anonymized ? "Prueba anonimizada" : "Expediente operativo"}</I18nText>
          </strong>
          <span>
            <I18nText>{anonymized
              ? "Solo datos ficticios. No introduzcas identificadores personales."
              : "Los datos sensibles permanecen visibles solo para perfiles autorizados."}</I18nText>
          </span>
        </div>
      </div>

      <section className="form-section">
        <div className="form-section-heading">
          <span>01</span>
          <div>
            <h2><I18nText>Vivienda y localización</I18nText></h2>
          </div>
        </div>
        <div className="form-grid">
          <label className="field field-span-2">
            <span><I18nText>Alias de la vivienda *</I18nText></span>
            <input
              defaultValue={dossier.alias}
              maxLength={80}
              minLength={2}
              name="alias"
              required
            />
          </label>
          <label className="field field-span-2">
            <span><I18nText>Dirección</I18nText></span>
            <input
              defaultValue={dossier.addressLine}
              maxLength={180}
              name="addressLine"
              placeholder="Calle Ejemplo 1"
            />
            {anonymized ? <small><I18nText>Opcional: Calle Ejemplo 1. Solo direcciones ficticias.</I18nText></small> : null}
          </label>
          <div className="field">
            <span><I18nText>Isla *</I18nText></span>
            <PremiumSelect
              ariaLabel="Isla de la vivienda"
              name="islandCode"
              onChange={(nextIsland) => {
                if (!isIslandCode(nextIsland)) return;
                const nextMunicipalities = municipalitiesForIsland(nextIsland);
                const defaultMunicipality =
                  nextMunicipalities.length === 1 ? nextMunicipalities[0] : "";
                setIslandCode(nextIsland);
                setMunicipality(defaultMunicipality);
                setMunicipalityQuery(defaultMunicipality);
                setMunicipalityOpen(false);
                setHighlightedMunicipality(-1);
              }}
              options={canaryIslands.map((island) => ({
                description:
                  island.code === "GR"
                    ? "Administrativamente pertenece a Teguise"
                    : undefined,
                label: island.name,
                value: island.code,
              }))}
              value={islandCode}
            />
          </div>
          <div className="field">
            <label htmlFor={`${listId}-search`}><I18nText>Municipio *</I18nText></label>
            <input name="municipality" type="hidden" value={municipality} />
            {municipalityLocked ? (
              <div className="municipality-locked">
                <input
                  aria-readonly="true"
                  data-municipality-search
                  id={`${listId}-search`}
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
                      ? `${listId}-${highlightedMunicipality}`
                      : undefined
                  }
                  aria-autocomplete="list"
                  aria-controls={listId}
                  aria-expanded={municipalityOpen}
                  aria-haspopup="listbox"
                  autoComplete="off"
                  data-municipality-search
                  id={`${listId}-search`}
                  onBlur={() => {
                    const exactMunicipality = municipalityNameForIsland(
                      islandCode,
                      municipalityQuery,
                    );
                    if (exactMunicipality) chooseMunicipality(exactMunicipality);
                    else {
                      setMunicipality("");
                      setMunicipalityQuery("");
                      setMunicipalityOpen(false);
                    }
                  }}
                  onChange={(event) => {
                    setMunicipality("");
                    setMunicipalityQuery(event.target.value);
                    setMunicipalityOpen(true);
                    setHighlightedMunicipality(-1);
                  }}
                  onFocus={() => setMunicipalityOpen(true)}
                  onKeyDown={handleMunicipalityKeyDown}
                  placeholder={`Buscar entre ${municipalityOptions.length} opciones`}
                  role="combobox"
                  spellCheck={false}
                  type="search"
                  value={municipalityQuery}
                />
                {municipalityOpen ? (
                  <ul className="municipality-options" id={listId} role="listbox">
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
                            id={`${listId}-${index}`}
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
                      <li className="municipality-empty"><I18nText>Sin resultados.</I18nText></li>
                    )}
                  </ul>
                ) : null}
              </div>
            )}
          </div>
          <label className="field">
            <span><I18nText>Código postal *</I18nText></span>
            <input
              defaultValue={dossier.postalCode}
              inputMode="numeric"
              maxLength={5}
              name="postalCode"
              pattern="[0-9]{5}"
              required
            />
            <small><I18nText>Formato y provincia comprobados; calle y municipio sin verificar.</I18nText></small>
          </label>
          <label className="field">
            <span><I18nText>Referencia catastral</I18nText></span>
            <input
              defaultValue={dossier.cadastralReference ?? ""}
              maxLength={30}
              name="cadastralReference"
              placeholder="DEMO-001"
            />
            <small><I18nText>Opcional: DEMO-001. Sin consulta al Catastro.</I18nText></small>
          </label>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-heading">
          <span>02</span>
          <div>
            <h2><I18nText>Gestión y siguiente paso</I18nText></h2>
          </div>
        </div>
        <div className="form-grid">
          <div className="field">
            <span><I18nText>Estado de actividad</I18nText></span>
            <PremiumSelect
              ariaLabel="Estado de actividad"
              defaultValue={dossier.activityStatus}
              name="activityStatus"
              options={[
                { label: "No iniciada", value: "not_started" },
                { label: "Activa", value: "active" },
                { label: "Pausada", value: "paused" },
                { label: "Cesada", value: "ceased" },
              ]}
            />
          </div>
          <div className="field">
            <span><I18nText>Responsable</I18nText></span>
            <PremiumSelect
              ariaLabel="Responsable de la vivienda"
              name="managerUserId"
              onChange={setManagerUserId}
              options={[
                { label: "Sin responsable", value: "" },
                ...managers.map((manager) => ({
                  label: manager.name,
                  translate: false,
                  value: manager.id,
                })),
              ]}
              value={managerUserId}
            />
            <small><I18nText>Coordina la vivienda; no concede permisos de revisión.</I18nText></small>
          </div>
          <label className="field field-span-2">
            <span><I18nText>Siguiente acción</I18nText></span>
            <LocalizedControl as="input"
              defaultValue={dossier.nextAction ?? ""}
              maxLength={160}
              name="nextAction"
              placeholder="Define el siguiente paso operativo"
            />
          </label>
          <label className="field">
            <span><I18nText>Fecha objetivo</I18nText></span>
            <DatePicker
              defaultValue={dossier.nextActionDueAt?.slice(0, 10) ?? ""}
              name="nextActionDueAt"
              disabled={submitting}
            />
          </label>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-heading">
          <span>03</span>
          <div>
            <h2><I18nText>Propietario</I18nText></h2>
          </div>
        </div>
        <div className="form-grid">
          <label className="field field-span-2">
            <span><I18nText>{anonymized ? "Alias del propietario *" : "Nombre o razón social *"}</I18nText></span>
            <input
              defaultValue={dossier.ownerName}
              maxLength={120}
              minLength={2}
              name="ownerName"
              required
            />
            <small><I18nText>Ejemplo: Propietario 02. No crea una cuenta.</I18nText></small>
          </label>
          <label className="field">
            <span><I18nText>Correo</I18nText></span>
            <input
              defaultValue={dossier.ownerEmail ?? ""}
              maxLength={180}
              name="ownerEmail"
              placeholder="propietario02@example.invalid"
              type="email"
            />
            <small><I18nText>Solo @example.invalid. No recibe correos.</I18nText></small>
          </label>
          <label className="field">
            <span><I18nText>Teléfono</I18nText></span>
            <input
              defaultValue={dossier.ownerPhone ?? ""}
              maxLength={30}
              name="ownerPhone"
              placeholder="000000000"
              type="tel"
            />
            <small><I18nText>Usa 000000000 o deja el campo vacío.</I18nText></small>
          </label>
        </div>
      </section>

      <input name="dataProfile" type="hidden" value={dossier.dataProfile} />
      <details className="editor-help"><summary><I18nText>Ayuda, privacidad y responsables</I18nText></summary><PropertyVerificationNote /><WorkspaceGuide /></details>
      <div className="form-actions">
        <button
          className="button button-secondary"
          disabled={submitting}
          onClick={() => router.push(`/app/properties/${dossier.id}`)}
          type="button"
        ><I18nText>
          Cancelar
        </I18nText></button>
        <button className="button button-primary" disabled={submitting} type="submit">
          <I18nText>{submitting ? "Guardando cambios…" : "Guardar cambios"}</I18nText>
        </button>
      </div>
    </form>
  );
}
