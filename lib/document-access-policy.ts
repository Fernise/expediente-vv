import type { DataProfile } from "./pilot-data.ts";

/** No production scanner/MFA evidence is available yet: real documents fail closed. */
export function isDownloadableSecurityState(
  malwareScanStatus: string,
  dataProfile: DataProfile,
): boolean {
  return dataProfile === "pilot_anonymized" &&
    ["clean", "structural_only"].includes(malwareScanStatus);
}
