import "server-only";
import { readSession } from "./session.server";
import {
  authorizeOrganization,
  type OrganizationAccessRole,
} from "@/lib/authorization/access";
import type { StaffRequirement } from "@/lib/authorization/staff";
export async function organizationAccess(
  slug: string,
  role: OrganizationAccessRole,
  permission?: StaffRequirement,
) {
  const session = await readSession();
  if (session.status !== "authenticated")
    return { session, allowed: false as const, reason: session.status };
  const membership = session.memberships.find((m) => m.slug === slug);
  const decision = authorizeOrganization(
    session.identity,
    membership ?? null,
    membership?.organizationId ?? "",
    role,
    permission,
  );
  return { session, ...decision, membership };
}
