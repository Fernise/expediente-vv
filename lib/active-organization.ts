import { cookies } from "next/headers";
import type { OrganizationSummary } from "@/db/organizations";

export const ACTIVE_ORGANIZATION_COOKIE =
  "expediente-vv-active-organization";

export function chooseActiveOrganization(
  organizations: OrganizationSummary[],
  selectedId?: string,
): OrganizationSummary | undefined {
  return (
    organizations.find((organization) => organization.id === selectedId) ??
    organizations[0]
  );
}

export async function activeOrganizationFrom(
  organizations: OrganizationSummary[],
): Promise<OrganizationSummary | undefined> {
  const cookieStore = await cookies();
  return chooseActiveOrganization(
    organizations,
    cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value,
  );
}
