export const roles = [
  "platform_admin",
  "organization_admin",
  "manager",
  "professional",
  "owner",
] as const;

export type Role = (typeof roles)[number];

export const capabilities = [
  "organization.manage",
  "membership.manage",
  "property.create",
  "property.read",
  "property.update",
  "property.archive",
  "document.upload",
  "document.read",
  "document.delete",
  "document.security.manage",
  "comment.internal.read",
  "comment.external.read",
  "review.create",
  "review.close",
  "rules.read",
  "rules.draft",
  "rules.review",
  "rules.approve",
  "rules.publish",
  "report.generate",
  "export.csv",
  "audit.read",
  "operations.read",
  "operations.run",
  "data.export",
  "data.delete",
] as const;

export type Capability = (typeof capabilities)[number];

const capabilityMap: Record<Role, ReadonlySet<Capability>> = {
  platform_admin: new Set([
    "organization.manage",
    "rules.read",
    "rules.draft",
    "rules.review",
    "rules.approve",
    "rules.publish",
    "audit.read",
    "operations.read",
    "operations.run",
  ]),
  organization_admin: new Set(
    capabilities.filter(
      (capability) =>
        capability !== "rules.review" &&
        capability !== "rules.publish" &&
        capability !== "review.close",
    ),
  ),
  manager: new Set([
    "property.create",
    "property.read",
    "property.update",
    "property.archive",
    "document.upload",
    "document.read",
    "document.delete",
    "document.security.manage",
    "comment.internal.read",
    "comment.external.read",
    "review.create",
    "rules.read",
    "report.generate",
    "export.csv",
  ]),
  professional: new Set([
    "property.read",
    "document.read",
    "comment.internal.read",
    "comment.external.read",
    "review.create",
    "review.close",
    "rules.read",
    "rules.review",
    "report.generate",
  ]),
  owner: new Set([
    "property.read",
    "document.upload",
    "document.read",
    "comment.external.read",
    "report.generate",
  ]),
};

export function can(role: Role, capability: Capability): boolean {
  return capabilityMap[role].has(capability);
}

export function assertCan(role: Role, capability: Capability): void {
  if (!can(role, capability)) {
    throw new Error(`Role ${role} cannot perform ${capability}`);
  }
}
