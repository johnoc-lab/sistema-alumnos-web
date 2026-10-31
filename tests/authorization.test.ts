import { describe, it, expect } from "vitest";
import {
  authorizeOrganization,
  type VerifiedIdentity,
  type VerifiedMembership,
} from "@/lib/authorization/access";
const identity: VerifiedIdentity = {
  profileId: "test-profile",
  authUserId: "test-auth",
  status: "active",
  assuranceLevel: "aal2",
};
const member: VerifiedMembership = {
  organizationId: "org-a",
  profileId: "test-profile",
  organizationStatus: "active",
  status: "active",
  role: "student",
};
describe("autorización por organización (dominio, sin proveedor Auth)", () => {
  it("rechaza una membresía incluso Admin cuando falta identidad", () =>
    expect(
      authorizeOrganization(
        null,
        { ...member, role: "admin" },
        "org-a",
        "admin",
      ),
    ).toEqual({ allowed: false, reason: "authentication_required" }));
  it("rechaza identidad bloqueada", () =>
    expect(
      authorizeOrganization(
        { ...identity, status: "blocked" },
        member,
        "org-a",
        "student",
      ).allowed,
    ).toBe(false));
  it("rechaza membresía que pertenece a otra persona", () =>
    expect(
      authorizeOrganization(
        identity,
        { ...member, profileId: "other" },
        "org-a",
        "student",
      ).allowed,
    ).toBe(false));
  it("rechaza acceso a otra organización aunque el rol sea Admin", () =>
    expect(
      authorizeOrganization(
        identity,
        { ...member, role: "admin" },
        "org-b",
        "admin",
      ),
    ).toEqual({ allowed: false, reason: "organization_mismatch" }));
  it.each(["invited", "suspended"] as const)("rechaza membresía %s", (status) =>
    expect(
      authorizeOrganization(identity, { ...member, status }, "org-a", "student")
        .allowed,
    ).toBe(false),
  );
  it("rechaza organización suspendida", () =>
    expect(
      authorizeOrganization(
        identity,
        { ...member, organizationStatus: "suspended" },
        "org-a",
        "student",
      ).allowed,
    ).toBe(false));
  it("no asciende alumno a Admin", () =>
    expect(authorizeOrganization(identity, member, "org-a", "admin")).toEqual({
      allowed: false,
      reason: "admin_required",
    }));
  it("exige MFA para el área Admin", () =>
    expect(
      authorizeOrganization(
        { ...identity, assuranceLevel: "aal1" },
        { ...member, role: "admin" },
        "org-a",
        "admin",
      ),
    ).toEqual({ allowed: false, reason: "mfa_required" }));
  it("admite solo una identidad y membresía verificadas del tenant solicitado", () =>
    expect(
      authorizeOrganization(
        identity,
        { ...member, role: "admin" },
        "org-a",
        "admin",
      ),
    ).toEqual({
      allowed: true,
      organizationId: "org-a",
      profileId: "test-profile",
      role: "admin",
    }));
});
