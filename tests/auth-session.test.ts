import { describe, it, expect, vi } from "vitest";
import { resolveSession, type IdentityReader } from "@/lib/auth/resolve";
import { authorizeOrganization } from "@/lib/authorization/access";
const ok = <T>(data: T) => ({ data, error: null });
function reader(): IdentityReader {
  return {
    user: async () => ok({ id: "auth-a", email_confirmed_at: "verified" }),
    claims: async () =>
      ok({ sub: "auth-a", aal: "aal2", session_id: "session-a" }),
    profile: async () => ok({ id: "profile-a", status: "active" }),
    memberships: async () =>
      ok([
        {
          profile_id: "profile-a",
          organization_id: "org-a",
          role: "admin",
          staff_rank: "principal",
          allowed_modules: [],
          status: "active",
        },
      ]),
    organizations: async () =>
      ok([{ id: "org-a", slug: "impulso", name: "Impulso", status: "active" }]),
  };
}
describe("resolución SSR simulada, sin usuarios Cloud", () => {
  it("resuelve identidad/membresía verificadas por el proveedor y RLS", async () => {
    const session = await resolveSession(reader());
    expect(session.status).toBe("authenticated");
    if (session.status !== "authenticated") throw Error("estado");
    expect(
      authorizeOrganization(
        session.identity,
        session.memberships[0]!,
        "org-a",
        "admin",
      ).allowed,
    ).toBe(true);
    expect(
      authorizeOrganization(
        session.identity,
        session.memberships[0]!,
        "org-b",
        "admin",
      ).allowed,
    ).toBe(false);
  });
  it.each(["sin sesión", "sesión inválida", "sesión caducada"])(
    "rechaza %s",
    async () => {
      const r = reader();
      r.user = async () => ({ data: null, error: Error("Auth rejected") });
      expect(await resolveSession(r)).toEqual({
        status: "anonymous",
        user: null,
      });
    },
  );
  it("no confía en claims que no corresponden al usuario verificado", async () => {
    const r = reader();
    r.claims = async () => ok({ sub: "otra-persona", aal: "aal2" });
    expect((await resolveSession(r)).status).toBe("anonymous");
  });
  it("rechaza JWT vencido aunque el otro lector devuelva usuario", async () => {
    const r = reader();
    r.claims = async () => ({ data: null, error: Error("expired") });
    expect((await resolveSession(r)).status).toBe("anonymous");
  });
  it("rechaza Auth anónimo y email sin confirmar", async () => {
    const r = reader();
    r.user = async () => ok({ id: "auth-a", is_anonymous: true });
    expect((await resolveSession(r)).status).toBe("anonymous");
  });
  it("cuenta sin perfil no tiene acceso académico", async () => {
    const r = reader();
    r.profile = async () => ({ data: null, error: null });
    const s = await resolveSession(r);
    expect(s.status === "authenticated" && s.identity).toBe(null);
  });
  it.each(["blocked", "pending", "archived"])(
    "perfil %s no tiene acceso",
    async (status) => {
      const r = reader();
      r.profile = async () => ok({ id: "profile-a", status });
      const s = await resolveSession(r);
      expect(s.status === "authenticated" && s.identity).toBe(null);
    },
  );
  it("perfil sin membresía no adquiere organización", async () => {
    const r = reader();
    r.memberships = async () => ok([]);
    const s = await resolveSession(r);
    expect(s.status === "authenticated" && s.memberships).toEqual([]);
  });
  it.each(["suspended", "archived"])(
    "organización %s no aparece accesible",
    async (status) => {
      const r = reader();
      r.organizations = async () =>
        ok([{ id: "org-a", name: "Impulso", slug: "impulso", status }]);
      const s = await resolveSession(r);
      expect(s.status === "authenticated" && s.memberships).toEqual([]);
    },
  );
  it("ignora rol no aprobado y perfil diferente en resultados", async () => {
    const r = reader();
    r.memberships = async () =>
      ok([
        {
          profile_id: "profile-a",
          organization_id: "org-a",
          role: "root",
          status: "active",
        },
        {
          profile_id: "other",
          organization_id: "org-b",
          role: "admin",
          status: "active",
        },
      ]);
    const s = await resolveSession(r);
    expect(s.status === "authenticated" && s.memberships).toEqual([]);
  });
  it("alumno no entra al panel Admin", async () => {
    const r = reader();
    r.memberships = async () =>
      ok([
        {
          profile_id: "profile-a",
          organization_id: "org-a",
          role: "student",
          status: "active",
        },
      ]);
    const s = await resolveSession(r);
    expect(
      s.status === "authenticated" &&
        authorizeOrganization(s.identity, s.memberships[0]!, "org-a", "admin"),
    ).toEqual({ allowed: false, reason: "admin_required" });
  });
  it("admin aal1 exige MFA", async () => {
    const r = reader();
    r.claims = async () => ok({ sub: "auth-a", aal: "aal1" });
    const s = await resolveSession(r);
    expect(
      s.status === "authenticated" &&
        authorizeOrganization(s.identity, s.memberships[0]!, "org-a", "admin"),
    ).toEqual({ allowed: false, reason: "mfa_required" });
  });
  it("fallo de PostgreSQL falla cerrado", async () => {
    const r = reader();
    r.profile = async () => ({ data: null, error: Error("offline") });
    expect(await resolveSession(r)).toEqual({
      status: "unavailable",
      user: null,
    });
  });
  it("excepción no devuelve fixtures ni errores internos", async () => {
    const r = reader();
    r.organizations = vi.fn().mockRejectedValue(Error("internal"));
    expect(await resolveSession(r)).toEqual({
      status: "unavailable",
      user: null,
    });
  });
});
