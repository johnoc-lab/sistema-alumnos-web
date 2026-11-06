import "server-only";
import { readSession } from "./session.server";
import {
  authorizeOrganization,
  type OrganizationRole,
} from "@/lib/authorization/access";
export async function organizationAccess(slug: string, role: OrganizationRole) {
  const session = await readSession();
  if (session.status !== "authenticated")
    return { session, allowed: false as const, reason: session.status };
  const membership = session.memberships.find((m) => m.slug === slug);
  const decision = authorizeOrganization(
    session.identity,
    membership ?? null,
    membership?.organizationId ?? "",
    role,
  );
  return { session, ...decision, membership };
}
