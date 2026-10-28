// This describes the existing pilot. It never grants paid entitlements.
// Commercial billing, pricing and signed agreements are deliberately disabled.
export function pilotLicense(organizationId: string) {
  if (!organizationId.trim()) throw new Error("An organisation is required");
  return {
    organizationId,
    plan: "pilot" as const,
    billingEnabled: false,
    autoRenewal: false,
    amountDue: 0,
    currency: "EUR" as const,
    dataScope: "fictional_or_anonymized" as const,
    commercialReady: false,
  };
}
