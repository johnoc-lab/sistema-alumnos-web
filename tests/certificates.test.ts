import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
const { access, rpc, createClient, from, select, eq, maybeSingle } = vi.hoisted(
  () => ({
    access: vi.fn(),
    rpc: vi.fn(),
    createClient: vi.fn(),
    from: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  }),
);
vi.mock("@/lib/auth/access.server", () => ({ organizationAccess: access }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createClient,
}));
vi.mock("@/lib/supabase/config", () => ({
  authConfig: () => ({ origin: "https://alumnos.example.test" }),
  authOrigin: (value: string) => value,
  noStoreHeaders: { "Cache-Control": "private, no-store" },
}));

import {
  certificateDownload,
  certificatePost,
} from "@/features/certificates/certificates.server";
import { certificatePdf } from "@/features/certificates/pdf";
import { StaffCertificates } from "@/features/certificates/pages";
const id = "11111111-1111-4111-8111-111111111111";
const org = "22222222-2222-4222-8222-222222222222";
const profile = "33333333-3333-4333-8333-333333333333";
const snapshot = {
  participant: "María Muñoz",
  course: "Diseño (2026)",
  institution: "Fundación Ñandú",
};
const issue = {
  snapshot,
  issued_at: "2026-11-14T20:00:00Z",
  serial: "CERT-QA",
};
const origin = "https://alumnos.example.test";
const form = (action: string, source = origin) =>
  new Request(origin + "/acciones", {
    method: "POST",
    headers: { origin: source },
    body: new URLSearchParams({ action, id }),
  });
beforeEach(() => {
  vi.resetAllMocks();
  access.mockResolvedValue({
    allowed: true,
    membership: {
      organizationId: org,
      staffRank: "teacher",
      profileId: profile,
    },
  });
  createClient.mockResolvedValue({ rpc, from });
  rpc.mockResolvedValue({ data: id });
  from.mockReturnValue({ select });
  select.mockReturnValue({ eq });
  eq.mockReturnValue({ eq, maybeSingle });
  maybeSingle.mockResolvedValue({ data: issue, error: null });
});

describe("formulario de recomendación", () => {
  it("mantiene la elección de taller y la recomendación como formularios separados", async () => {
    access.mockResolvedValue({
      allowed: true,
      membership: {
        organizationId: org,
        name: "Impulso Cero",
        staffRank: "teacher",
        allowedModules: ["certificates", "certificates.recommend"],
      },
    });
    rpc.mockResolvedValue({
      data: {
        courses: [{ id, title: "Taller de prueba" }],
        students: [{ id: profile, name: "Alumno de prueba" }],
        pending: [],
      },
      error: null,
    });
    const html = renderToStaticMarkup(
      await StaffCertificates({ slug: "impulso-cero", course: id }),
    );
    expect(rpc).toHaveBeenCalledWith("certificate_staff_context", {
      p_org: org,
      p_course: id,
    });
    expect(html).toContain('aria-labelledby="recommend-certificate-title"');
    const forms = html.match(/<form[^>]*action="\/o\/impulso-cero\/admin\/certificados(?:\/acciones)?"[^>]*>[^]*?<\/form>/g);
    expect(forms).toHaveLength(2);
    const [picker, recommendation] = forms!;
    expect(picker).toContain('method="get"');
    expect(picker).toContain('name="course"');
    expect(picker).toContain("Ver alumnos matriculados");
    expect(recommendation).toContain('method="post"');
    expect(recommendation).toContain('action="/o/impulso-cero/admin/certificados/acciones"');
    expect(recommendation).toContain('value="recommend"');
    expect(recommendation).toContain('name="id"');
    expect(html).not.toContain("Recomendaciones pendientes");
  });
});

describe("operaciones de certificados", () => {
  it.each([
    ["recommend", "certificates.recommend", "recommended"],
    ["approve", "certificates.approve", "approved"],
    ["reject", "certificates.approve", "rejected"],
  ])(
    "usa la organización y permiso de sesión para %s",
    async (action, permission, notice) => {
      const response = await certificatePost(form(action), "qa");
      expect(access).toHaveBeenCalledWith("qa", "admin", permission);
      expect(rpc).toHaveBeenCalledWith(
        action === "recommend" ? "recommend_certificate" : "decide_certificate",
        action === "recommend"
          ? { p_org: org, p_enrollment: id }
          : {
              p_org: org,
              p_recommendation: id,
              p_approve: action === "approve",
            },
      );
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(
        origin + "/o/qa/admin/certificados?notice=" + notice,
      );
    },
  );
  it("rechaza origen ajeno y accesos no autorizados antes de mutar", async () => {
    expect(
      (
        await certificatePost(
          form("approve", "https://otro.example.test"),
          "qa",
        )
      ).status,
    ).toBe(403);
    expect(access).not.toHaveBeenCalled();
    access.mockResolvedValue({ allowed: false });
    expect((await certificatePost(form("approve"), "qa")).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("restringe descarga a alumnos y devuelve 404 si la consulta no ve el certificado", async () => {
    access.mockResolvedValueOnce({ allowed: false });
    expect((await certificateDownload("qa", id, false)).status).toBe(404);
    expect(from).not.toHaveBeenCalled();
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect((await certificateDownload("qa", id, false)).status).toBe(404);
    expect(access).toHaveBeenCalledWith("qa", "student");
    expect(from).toHaveBeenCalledWith("certificate_issues");
    expect(eq.mock.calls).toEqual(
      expect.arrayContaining([
        ["organization_id", org],
        ["id", id],
        ["status", "issued"],
      ]),
    );
  });
  it.each([true, false])(
    "entrega el PDF privado con el modo solicitado (%s)",
    async (inline) => {
      const response = await certificateDownload("qa", id, inline);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("content-type")).toBe("application/pdf");
      expect(response.headers.get("content-disposition")).toMatch(
        inline ? /^inline;/ : /^attachment;/,
      );
      expect((await response.text()).startsWith("%PDF-1.4")).toBe(true);
    },
  );
});

it("genera un PDF válido con tildes y ñ en la página", () => {
  const pdf = Buffer.from(
    certificatePdf({
      ...snapshot,
      date: "14 de noviembre de 2026",
      serial: "CERT-QA",
    }),
  ).toString("ascii");
  const offset = Number(/startxref\n(\d+)/.exec(pdf)?.[1]);
  expect(pdf.slice(offset)).toMatch(/^xref\n0 7\n/);
  for (const [i, entry] of [...pdf.matchAll(/^(\d{10}) 00000 n $/gm)].entries())
    expect(pdf.slice(Number(entry[1]))).toMatch(
      new RegExp("^" + (i + 1) + " 0 obj"),
    );
  expect(pdf).toContain("/WinAnsiEncoding");
  const strings = [...pdf.matchAll(/<([0-9a-f]+)> Tj/g)].map((m) =>
    Buffer.from(m[1]!, "hex").toString("latin1"),
  );
  expect(strings).toEqual(
    expect.arrayContaining(["María Muñoz", "Diseño (2026)", "Fundación Ñandú"]),
  );
});
