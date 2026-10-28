export const canaryIslands = [
  { code: "GC", name: "Gran Canaria" },
  { code: "TF", name: "Tenerife" },
  { code: "LZ", name: "Lanzarote" },
  { code: "FV", name: "Fuerteventura" },
  { code: "LP", name: "La Palma" },
  { code: "LG", name: "La Gomera" },
  { code: "EH", name: "El Hierro" },
  { code: "GR", name: "La Graciosa" },
] as const;

export type IslandCode = (typeof canaryIslands)[number]["code"];

export const canaryMunicipalitySources = {
  islandGrouping:
    "https://www.gobiernodecanarias.org/transparencia/temas/institucional-organizativa/instituciones/informacion-sobre-las-islas-canarias/geografia-canarias/index.html",
  officialNames:
    "https://www.ine.es/daco/daco42/codmun/codmun_anual.htm",
} as const;

export const municipalitiesByIsland = {
  EH: ["El Pinar de El Hierro", "Frontera", "Valverde"],
  FV: [
    "Antigua",
    "Betancuria",
    "La Oliva",
    "Pájara",
    "Puerto del Rosario",
    "Tuineje",
  ],
  GC: [
    "Agaete",
    "Agüimes",
    "Artenara",
    "Arucas",
    "Firgas",
    "Gáldar",
    "Ingenio",
    "La Aldea de San Nicolás",
    "Las Palmas de Gran Canaria",
    "Mogán",
    "Moya",
    "San Bartolomé de Tirajana",
    "Santa Brígida",
    "Santa Lucía de Tirajana",
    "Santa María de Guía de Gran Canaria",
    "Tejeda",
    "Telde",
    "Teror",
    "Valleseco",
    "Valsequillo de Gran Canaria",
    "Vega de San Mateo",
  ],
  GR: ["Teguise"],
  LG: [
    "Agulo",
    "Alajeró",
    "Hermigua",
    "San Sebastián de la Gomera",
    "Valle Gran Rey",
    "Vallehermoso",
  ],
  LP: [
    "Barlovento",
    "Breña Alta",
    "Breña Baja",
    "El Paso",
    "Fuencaliente de la Palma",
    "Garafía",
    "Los Llanos de Aridane",
    "Puntagorda",
    "Puntallana",
    "San Andrés y Sauces",
    "Santa Cruz de la Palma",
    "Tazacorte",
    "Tijarafe",
    "Villa de Mazo",
  ],
  LZ: [
    "Arrecife",
    "Haría",
    "San Bartolomé",
    "Teguise",
    "Tías",
    "Tinajo",
    "Yaiza",
  ],
  TF: [
    "Adeje",
    "Arafo",
    "Arico",
    "Arona",
    "Buenavista del Norte",
    "Candelaria",
    "El Rosario",
    "El Sauzal",
    "El Tanque",
    "Fasnia",
    "Garachico",
    "Granadilla de Abona",
    "Guía de Isora",
    "Güímar",
    "Icod de los Vinos",
    "La Guancha",
    "La Matanza de Acentejo",
    "La Orotava",
    "La Victoria de Acentejo",
    "Los Realejos",
    "Los Silos",
    "Puerto de la Cruz",
    "San Cristóbal de La Laguna",
    "San Juan de la Rambla",
    "San Miguel de Abona",
    "Santa Cruz de Tenerife",
    "Santa Úrsula",
    "Santiago del Teide",
    "Tacoronte",
    "Tegueste",
    "Vilaflor de Chasna",
  ],
} as const satisfies Record<IslandCode, readonly string[]>;

export function islandName(code: string): string {
  return (
    canaryIslands.find((island) => island.code === code)?.name ??
    "Isla sin especificar"
  );
}

export function isIslandCode(value: string): value is IslandCode {
  return canaryIslands.some((island) => island.code === value);
}

export function municipalitiesForIsland(code: string): readonly string[] {
  return isIslandCode(code) ? municipalitiesByIsland[code] : [];
}

export function municipalityNameForIsland(
  islandCode: string,
  value: string,
): string | null {
  const normalizedValue = normalizeMunicipality(value);
  return (
    municipalitiesForIsland(islandCode).find(
      (municipality) =>
        normalizeMunicipality(municipality) === normalizedValue,
    ) ?? null
  );
}

export function municipalitiesMatchingIsland(
  islandCode: string,
  query: string,
): readonly string[] {
  const normalizedQuery = normalizeMunicipality(query);
  const municipalities = municipalitiesForIsland(islandCode);
  if (!normalizedQuery) return municipalities;
  return municipalities.filter((municipality) =>
    normalizeMunicipality(municipality).includes(normalizedQuery),
  );
}

export function isMunicipalityForIsland(
  islandCode: string,
  value: string,
): boolean {
  return municipalityNameForIsland(islandCode, value) !== null;
}

function normalizeMunicipality(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es");
}
