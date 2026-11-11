import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
import { OrganizationAccess } from "@/features/organizations/components/organization-access";
import type { AuthenticatedSession } from "@/lib/auth/resolve";
const session = (
  admin = false,
  aal: "aal1" | "aal2" = "aal1",
): AuthenticatedSession => ({
  status: "authenticated",
  user: { id: "qa-auth" },
  identity: {
    profileId: "qa-profile",
    authUserId: "qa-auth",
    status: "active",
    assuranceLevel: aal,
  },
  memberships: [
    {
      organizationId: "qa-org",
      profileId: "qa-profile",
      slug: "qa",
      name: "Organización <QA>",
      status: "active",
      organizationStatus: "active",
      role: admin ? "admin" : "student",
      staffRank: admin ? "principal" : null,
      allowedModules: [],
    },
  ],
});
const render = (s: AuthenticatedSession) =>
  renderToStaticMarkup(createElement(OrganizationAccess, { session: s }));
describe("selección de organización real", () => {
  it("alumno solo ve su Dashboard y conserva logout POST", () => {
    const html = render(session());
    expect(html).toContain("/o/qa/dashboard");
    expect(html).not.toContain("/o/qa/admin");
    expect(html).not.toContain("/auth/mfa");
    expect(html).toContain('action="/auth/logout"');
    expect(html).not.toContain('data-preview="synthetic"');
    expect(html).toContain("Organización &lt;QA&gt;");
  });
  it.each(["aal1", "aal2"] as const)(
    "admin %s ve acceso MFA sin conceder permisos por interfaz",
    (aal) => {
      const html = render(session(true, aal));
      expect(html).toContain("/o/qa/admin");
      expect(html).toContain('href="/auth/mfa"');
      expect(html.includes("Panel administrativo · requiere MFA")).toBe(
        aal === "aal1",
      );
    },
  );
  it("sin membresías ofrece estado vacío sin vínculos académicos", () => {
    const s = session();
    s.identity = null;
    s.memberships = [];
    const html = render(s);
    expect(html).toContain("Aún no tienes un espacio asignado");
    expect(html).not.toContain('href="/o/');
    expect(html).not.toContain("/auth/mfa");
  });
});
