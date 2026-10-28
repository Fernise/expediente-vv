
import { I18nText, LocalizedControl } from "@/app/components/Language";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Circle,
  Download,
  Plus,
  Search,
} from "lucide-react";
import { PremiumSelect } from "@/app/components/PremiumSelect";
import { PendingLink } from "@/app/components/PendingLink";
import { WorkspaceShell } from "@/app/components/WorkspaceShell";
import { listOrganizationsForActor } from "@/db/organizations";
import { listProperties, propertyLocationLabel } from "@/db/properties";
import { requireActor } from "@/lib/auth";
import { activeOrganizationFrom } from "@/lib/active-organization";
import { canaryIslands } from "@/lib/canary-data";
import { can, type Role } from "@/lib/permissions";
import {
  dossierStatusLabels,
  statusTone,
  type DossierStatus,
} from "@/lib/property-status";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  archived?: string;
  island?: string;
  manager?: string;
  municipality?: string;
  owner?: string;
  q?: string;
  status?: string;
}>;

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const actor = await requireActor("/app/properties");
  const organizations = await listOrganizationsForActor(actor);
  const organization = await activeOrganizationFrom(organizations);
  const filters = await searchParams;

  if (!organization) {
    return (
      <main className="app-gate">
        <section className="gate-card">
          <h1><I18nText>Primero crea una organización</I18nText></h1>
          <Link className="button button-primary" href="/app"><I18nText>Volver al inicio</I18nText></Link>
        </section>
      </main>
    );
  }

  const archived = filters.archived === "1";
  const canExport = can(organization.role as Role, "export.csv");
  const [properties, filterProperties] = await Promise.all([
    listProperties(actor, organization.id, {
      archived,
      island: filters.island,
      managerUserId: filters.manager,
      municipality: filters.municipality,
      ownerId: filters.owner,
      query: filters.q,
      status: filters.status,
    }),
    listProperties(actor, organization.id, { archived }),
  ]);
  const municipalities = uniqueStrings(
    filterProperties.map((property) => property.municipality),
  );
  const owners = uniquePeople(
    filterProperties.map((property) => ({
      id: property.ownerId,
      name: property.ownerName,
    })),
  );
  const managers = uniquePeople(
    filterProperties
      .filter((property) => property.managerUserId)
      .map((property) => ({
        id: property.managerUserId!,
        name: property.managerName,
      })),
  );

  return (
    <WorkspaceShell
      active="properties"
      actor={actor}
      organization={organization}
      organizations={organizations}
    >
      <div className="workspace-content">
        <header className="page-heading properties-heading">
          <div>
            <span className="eyebrow"><I18nText>Expedientes</I18nText></span>
            <h1><I18nText>Viviendas</I18nText></h1>
            <p>
              {properties.length}<I18nText> resultado</I18nText><I18nText>{properties.length === 1 ? "" : "s"}</I18nText><I18nText> en</I18nText>{" "}
              {organization.name}.
            </p>
          </div>
          <div className="page-heading-actions">
            {canExport ? (
              <a
                className="button button-secondary"
                href={`/api/exports/properties?organizationId=${encodeURIComponent(organization.id)}`}
              >
                <Download aria-hidden="true" /><I18nText> Exportar CSV
              </I18nText></a>
            ) : null}
            <Link className="button button-primary" href="/app/properties/new">
              <Plus aria-hidden="true" /><I18nText> Añadir vivienda
            </I18nText></Link>
          </div>
        </header>

        <form className="property-filters" method="get">
          <div className="property-filter-primary">
            <label className="search-field">
              <span className="sr-only"><I18nText>Buscar vivienda</I18nText></span>
              <Search aria-hidden="true" />
              <LocalizedControl as="input"
                defaultValue={filters.q ?? ""}
                name="q"
                placeholder="Buscar por alias, referencia, municipio o propietario"
              />
            </label>
            <PremiumSelect
              ariaLabel="Filtrar por isla"
              defaultValue={filters.island ?? ""}
              key={`island-${filters.island ?? "all"}`}
              name="island"
              options={[
                { label: "Todas las islas", value: "" },
                ...canaryIslands.map((island) => ({
                  label: island.name,
                  value: island.code,
                })),
              ]}
            />
            <PremiumSelect
              ariaLabel="Filtrar por estado"
              defaultValue={filters.status ?? ""}
              key={`status-${filters.status ?? "all"}`}
              name="status"
              options={[
                { label: "Todos los estados", value: "" },
                ...Object.entries(dossierStatusLabels).map(
                  ([value, label]) => ({ label, value }),
                ),
              ]}
            />
            <label className="archive-filter">
              <input
                defaultChecked={filters.archived === "1"}
                name="archived"
                type="checkbox"
                value="1"
              /><I18nText>
              Archivadas
            </I18nText></label>
            <button className="button button-secondary" type="submit"><I18nText>Filtrar</I18nText></button>
            {hasFilters(filters) ? (
              <Link className="clear-filters" href="/app/properties"><I18nText>Limpiar</I18nText></Link>
            ) : null}
          </div>
          <div className="property-filter-secondary">
            <div className="property-filter-select">
              <span><I18nText>Municipio</I18nText></span>
              <PremiumSelect
                ariaLabel="Filtrar por municipio"
                defaultValue={filters.municipality ?? ""}
                key={`municipality-${filters.municipality ?? "all"}`}
                name="municipality"
                options={[
                  { label: "Todos", value: "" },
                  ...municipalities.map((municipality) => ({
                    label: municipality,
                    value: municipality,
                  })),
                ]}
              />
            </div>
            <div className="property-filter-select">
              <span><I18nText>Responsable</I18nText></span>
              <PremiumSelect
                ariaLabel="Filtrar por responsable"
                defaultValue={filters.manager ?? ""}
                key={`manager-${filters.manager ?? "all"}`}
                name="manager"
                options={[
                  { label: "Todos", value: "" },
                  { label: "Sin responsable", value: "unassigned" },
                  ...managers.map((manager) => ({
                    label: manager.name,
                    value: manager.id,
                  })),
                ]}
              />
            </div>
            <div className="property-filter-select">
              <span><I18nText>Propietario</I18nText></span>
              <PremiumSelect
                ariaLabel="Filtrar por propietario"
                defaultValue={filters.owner ?? ""}
                key={`owner-${filters.owner ?? "all"}`}
                name="owner"
                options={[
                  { label: "Todos", value: "" },
                  ...owners.map((owner) => ({
                    label: owner.name,
                    value: owner.id,
                  })),
                ]}
              />
            </div>
          </div>
        </form>

        {properties.length === 0 ? (
          <div className="empty-state property-empty">
            <span><Building2 aria-hidden="true" /></span>
            <div>
              <h2><I18nText>No encontramos viviendas</I18nText></h2>
              <p><I18nText>
                Cambia los filtros o crea un nuevo expediente para esta
                organización.
              </I18nText></p>
            </div>
            <Link className="button button-primary" href="/app/properties/new"><I18nText>
              Añadir vivienda
            </I18nText></Link>
          </div>
        ) : (
          <LocalizedControl as="div" className="properties-table" role="table" aria-label="Viviendas">
            <div className="properties-table-head" role="row">
              <span role="columnheader"><I18nText>Vivienda</I18nText></span>
              <span role="columnheader"><I18nText>Estado orientativo</I18nText></span>
              <span role="columnheader"><I18nText>Propietario</I18nText></span>
              <span role="columnheader"><I18nText>Responsable</I18nText></span>
              <span aria-hidden="true" />
            </div>
            {properties.map((property) => (
              <article className="properties-table-row" key={property.id} role="row">
                <div className="property-identity" role="cell">
                  <span className="property-monogram" aria-hidden="true">
                    {property.alias.slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <h2>{property.alias}</h2>
                    {property.dataProfile === "pilot_anonymized" ? (
                      <span className="pilot-property-chip"><I18nText>Prueba anonimizada</I18nText></span>
                    ) : null}
                    <p>{property.internalReference}</p>
                    <small>
                      {propertyLocationLabel(
                        property.islandCode,
                        property.municipality,
                      )}
                    </small>
                  </div>
                </div>
                <div className="table-status" role="cell">
                  <span
                    className={`status-badge ${statusTone(property.dossierStatus as DossierStatus)}`}
                  >
                    <Circle aria-hidden="true" fill="currentColor" />{" "}
                    <I18nText>{dossierStatusLabels[property.dossierStatus as DossierStatus]}</I18nText>
                  </span>
                  <small>{property.pendingItems}<I18nText> pendientes</I18nText></small>
                </div>
                <span role="cell">{property.ownerName}</span>
                <span role="cell">{property.managerName}</span>
                <PendingLink
                  aria-label={`Abrir expediente ${property.alias}`}
                  className="table-open"
                  href={`/app/properties/${property.id}`}
                  prefetch
                  role="cell"
                ><I18nText>
                  Abrir </I18nText><ArrowRight aria-hidden="true" />
                </PendingLink>
              </article>
            ))}
          </LocalizedControl>
        )}
      </div>
    </WorkspaceShell>
  );
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) =>
    left.localeCompare(right, "es"),
  );
}

function uniquePeople(
  values: Array<{ id: string; name: string }>,
): Array<{ id: string; name: string }> {
  return Array.from(
    new Map(values.map((value) => [value.id, value])).values(),
  ).sort((left, right) => left.name.localeCompare(right.name, "es"));
}

function hasFilters(filters: Awaited<SearchParams>): boolean {
  return Boolean(
    filters.q ||
      filters.island ||
      filters.status ||
      filters.municipality ||
      filters.manager ||
      filters.owner ||
      filters.archived,
  );
}
