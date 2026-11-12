import {
  isStaffPermission,
  isStaffRank,
  validStaffPermissions,
} from "@/lib/authorization/staff";
import type {
  VerifiedIdentity,
  VerifiedMembership,
} from "@/lib/authorization/access";
export type OrganizationMembership = VerifiedMembership & {
  slug: string;
  name: string;
};
export type AuthenticatedSession = {
  status: "authenticated";
  user: { id: string };
  identity: VerifiedIdentity | null;
  memberships: OrganizationMembership[];
};
export type SessionResult =
  | AuthenticatedSession
  | { status: "unconfigured" | "anonymous" | "unavailable"; user: null };
type Result<T> = { data: T | null; error: unknown };
export interface IdentityReader {
  user(): Promise<
    Result<{ id: string; is_anonymous?: boolean; email_confirmed_at?: string }>
  >;
  claims(): Promise<
    Result<{
      sub?: string;
      aal?: string;
      session_id?: string;
      is_anonymous?: boolean;
    }>
  >;
  profile(): Promise<Result<{ id: string; status: string }>>;
  memberships(profileId: string): Promise<
    Result<
      {
        profile_id: string;
        organization_id: string;
        role: string;
        status: string;
        staff_rank?: string | null;
        allowed_modules?: string[];
      }[]
    >
  >;
  organizations(
    ids: string[],
  ): Promise<
    Result<{ id: string; slug: string; name: string; status: string }[]>
  >;
}
export async function resolveSession(
  reader: IdentityReader,
): Promise<SessionResult> {
  try {
    const user = await reader.user();
    if (user.error || !user.data) return { status: "anonymous", user: null };
    const claims = await reader.claims();
    if (
      claims.error ||
      claims.data?.sub !== user.data.id ||
      user.data.is_anonymous ||
      claims.data.is_anonymous ||
      !user.data.email_confirmed_at
    )
      return { status: "anonymous", user: null };
    const profile = await reader.profile();
    if (profile.error) return { status: "unavailable", user: null };
    const base = {
      status: "authenticated" as const,
      user: { id: user.data.id },
      identity: null,
      memberships: [],
    };
    if (!profile.data || profile.data.status !== "active") return base;
    const identity: VerifiedIdentity = {
      profileId: profile.data.id,
      authUserId: user.data.id,
      status: "active",
      assuranceLevel: claims.data.aal === "aal2" ? "aal2" : "aal1",
    };
    const membership = await reader.memberships(profile.data.id);
    if (membership.error) return { status: "unavailable", user: null };
    const valid = (membership.data ?? []).filter(
      (m) =>
        m.profile_id === profile.data!.id &&
        m.status === "active" &&
        ["student", "admin"].includes(m.role),
    );
    if (!valid.length) return { ...base, identity };
    const orgs = await reader.organizations([
      ...new Set(valid.map((m) => m.organization_id)),
    ]);
    if (orgs.error) return { status: "unavailable", user: null };
    const memberships: OrganizationMembership[] = valid.flatMap((m) => {
      const org = orgs.data?.find(
        (o) => o.id === m.organization_id && o.status === "active",
      );
      const staffRank =
        m.role === "admin" && isStaffRank(m.staff_rank) ? m.staff_rank : null;
      const allowedModules = m.allowed_modules;
      if (
        m.role === "admin" &&
        (!staffRank ||
          !Array.isArray(allowedModules) ||
          !allowedModules.every(isStaffPermission) ||
          !validStaffPermissions(staffRank, allowedModules))
      )
        return [];
      return org
        ? [
            {
              organizationId: org.id,
              profileId: profile.data!.id,
              organizationStatus: "active",
              status: "active",
              role: m.role as "admin" | "student",
              staffRank,
              allowedModules: staffRank
                ? (allowedModules ?? []).filter(isStaffPermission)
                : [],
              slug: org.slug,
              name: org.name,
            },
          ]
        : [];
    });
    return {
      status: "authenticated",
      user: { id: user.data.id },
      identity,
      memberships,
    };
  } catch {
    return { status: "unavailable", user: null };
  }
}
