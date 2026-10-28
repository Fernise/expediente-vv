import type { PropertyListItem } from "../db/properties.ts";
import { islandName } from "./canary-data.ts";
import { dossierStatusLabels } from "./property-status.ts";

const activityLabels: Record<string, string> = {
  active: "Activa",
  ceased: "Cesada",
  not_started: "No iniciada",
  paused: "Pausada",
};

export function buildPropertiesCsv(properties: PropertyListItem[]): string {
  const rows = [
    [
      "Referencia",
      "Alias",
      "Isla",
      "Municipio",
      "Estado de actividad",
      "Estado orientativo",
      "Perfil de datos",
      "Propietario",
      "Responsable",
      "Siguiente acción",
      "Fecha objetivo",
      "Pendientes",
    ],
    ...properties.map((property) => [
      property.internalReference,
      property.alias,
      islandName(property.islandCode),
      property.municipality,
      activityLabels[property.activityStatus] ?? property.activityStatus,
      dossierStatusLabels[property.dossierStatus],
      property.dataProfile === "pilot_anonymized"
        ? "Prueba anonimizada"
        : "Operativo",
      property.ownerName,
      property.managerName,
      property.nextAction ?? "",
      property.nextActionDueAt ?? "",
      String(property.pendingItems),
    ]),
  ];

  return `\uFEFF${rows
    .map((row) => row.map(csvCell).join(";"))
    .join("\r\n")}\r\n`;
}

function csvCell(value: string): string {
  if (!/[;"\r\n]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}
