export type OrganizationRole = "student" | "admin";
export interface VerifiedIdentity {
  readonly profileId: string;
  readonly authUserId: string;
  readonly status: "active" | "blocked";
  readonly assuranceLevel: "aal1" | "aal2";
}
export interface VerifiedMembership {
  readonly organizationId: string;
  readonly profileId: string;
  readonly organizationStatus: "active" | "suspended";
  readonly status: "active" | "suspended" | "invited";
  readonly role: OrganizationRole;
}
export type AccessDecision =
  | {
      allowed: true;
      organizationId: string;
      profileId: string;
      role: OrganizationRole;
    }
  | {
      allowed: false;
      reason:
        | "authentication_required"
        | "inactive_identity"
        | "membership_required"
        | "organization_mismatch"
        | "inactive_membership"
        | "admin_required"
        | "mfa_required";
    };
/** Solo admite identidad y membresía previamente verificadas por adaptadores de servidor.
 * No es una política RLS y nunca se invoca con fixtures o roles enviados por un formulario. */
export function authorizeOrganization(
  identity: VerifiedIdentity | null,
  membership: VerifiedMembership | null,
  organizationId: string,
  requiredRole: OrganizationRole,
): AccessDecision {
  if (!identity) return { allowed: false, reason: "authentication_required" };
  if (identity.status !== "active")
    return { allowed: false, reason: "inactive_identity" };
  if (!membership || membership.profileId !== identity.profileId)
    return { allowed: false, reason: "membership_required" };
  if (membership.organizationId !== organizationId)
    return { allowed: false, reason: "organization_mismatch" };
  if (
    membership.status !== "active" ||
    membership.organizationStatus !== "active"
  )
    return { allowed: false, reason: "inactive_membership" };
  if (requiredRole === "admin" && membership.role !== "admin")
    return { allowed: false, reason: "admin_required" };
  if (requiredRole === "admin" && identity.assuranceLevel !== "aal2")
    return { allowed: false, reason: "mfa_required" };
  return {
    allowed: true,
    organizationId,
    profileId: identity.profileId,
    role: membership.role,
  };
}
