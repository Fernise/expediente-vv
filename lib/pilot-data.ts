export type DataProfile = "pilot_anonymized" | "standard";

const directIdentifierPatterns = [
  { label: "un correo electrónico", pattern: /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/i },
  { label: "un DNI o NIE", pattern: /\b(?:\d{8}[A-Z]|[XYZ]\d{7}[A-Z])\b/i },
  { label: "un IBAN", pattern: /\bES\d{22}\b/i },
  {
    label: "un teléfono",
    pattern: /(?:^|\D)(?:\+?34[\s.-]*)?[6789](?:[\s.-]*\d){8}(?:\D|$)/,
  },
] as const;

export function directIdentifierLabel(value: string): string | null {
  for (const identifier of directIdentifierPatterns) {
    if (identifier.pattern.test(value)) return identifier.label;
  }
  return null;
}

export function isPilotOwnerAlias(value: string): boolean {
  return /^(?:Propietario|Titular)\s+(?=[A-Za-z0-9-]*\d)[A-Za-z0-9-]{1,20}$/i.test(
    value.trim(),
  );
}

export function isDataProfile(value: string): value is DataProfile {
  return value === "pilot_anonymized" || value === "standard";
}

export function syntheticPropertyError(input: { addressLine?: string; cadastralReference?: string; ownerEmail?: string; ownerPhone?: string }): string | null {
  const address = input.addressLine?.trim() ?? "";
  const cadastral = input.cadastralReference?.trim() ?? "";
  const email = input.ownerEmail?.trim() ?? "";
  const phone = input.ownerPhone?.trim() ?? "";
  if (address && !/^Calle (?:Ejemplo|Ficticia|Inventada) [0-9]{1,4}$/i.test(address)) return "Usa una dirección ficticia como Calle Ejemplo 1. Las direcciones reales siguen bloqueadas.";
  if (cadastral && !/^DEMO-[A-Z0-9]{1,20}$/i.test(cadastral)) return "Usa una referencia de prueba como DEMO-001, no una referencia catastral real.";
  if (email && !/^[a-z0-9._-]+@example\.invalid$/i.test(email)) return "Usa un correo ficticio terminado en @example.invalid. No se enviarán mensajes a ese contacto.";
  if (phone && !/^0{9}$/.test(phone)) return "Para el teléfono de prueba usa 000000000 o déjalo vacío. No introduzcas un número real.";
  return null;
}
