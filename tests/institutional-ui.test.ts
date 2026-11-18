import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
vi.mock("server-only", () => ({}));
import { OrganizationIdentity } from "@/components/institutional/identity";
import { CourseTile } from "@/features/academic/course-tile";
import { enrollmentHtml, challengeHtml } from "@/lib/auth/mfa-html";
import { AcademicShell } from "@/features/academic/shell";
const render = (component: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(component);
describe("identidad institucional y presentación segura", () => {
  it("reutiliza el logotipo y el isotipo de Impulso Cero según el espacio", () => {
    const lockup = "/brands/impulso-cero-lockup.png";
    const mark = "/brands/impulso-cero-marca.png";
    const identity = { slug: "impulso-cero", name: "Impulso Cero" };
    for (const asset of [lockup, mark]) {
      expect(readFileSync("public" + asset).subarray(1, 4).toString()).toBe("PNG");
    }
    const compact = render(createElement(OrganizationIdentity, identity));
    const prominent = render(
      createElement(OrganizationIdentity, { ...identity, prominent: true }),
    );
    expect(compact).toContain('src="' + mark + '"');
    expect(compact).not.toContain(lockup);
    expect(prominent).toContain('src="' + lockup + '"');
    expect(prominent).toContain('src="' + mark + '"');
  });
  it.each(["incubadora", "qa", "toString", "__proto__"])(
    "sin logo %s conserva nombre y representación neutra",
    (slug) => {
      const html = render(
        createElement(OrganizationIdentity, {
          slug,
          name: "Organización <QA>",
        }),
      );
      expect(html).not.toContain("<img");
      expect(html).toContain("Organización &lt;QA&gt;");
    },
  );
  it("la tarjeta muestra progreso cero real y no inventa progreso cuando falta", () => {
    const props = {
      title: "Taller QA",
      description: "Descripción",
      tag: "Aprendizaje",
      href: "/o/qa/dashboard/cursos/11111111-1111-4111-8111-111111111111",
    };
    const zero = render(createElement(CourseTile, { ...props, progress: 0 }));
    expect(zero).toContain("0% completado");
    expect(zero).toContain('<progress value="0" max="100"');
    const unknown = render(
      createElement(CourseTile, { ...props, progress: null }),
    );
    expect(unknown).toContain("Sin avance registrado");
    expect(unknown).not.toContain("<progress");
    expect(unknown).not.toContain("0% completado");
  });
  it("títulos y descripciones no se insertan como HTML", () => {
    const html = render(
      createElement(CourseTile, {
        title: "<script>bad()</script>",
        description: "<img src=x>",
        tag: "<QA>",
        href: "/o/qa/dashboard/cursos/qa",
        progress: 25,
      }),
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x>");
  });
  it("navegación de alumno conserva rutas propias sin exponer acciones administrativas", () => {
    const html = render(
      createElement(AcademicShell, {
        slug: "qa",
        name: "QA",
        admin: false,
        section: "dashboard/cursos",
        children: "contenido",
      }),
    );
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("/o/qa/dashboard/cursos");
    expect(html).not.toContain("/o/qa/admin");
    expect(html).not.toContain("/auth/mfa");
    expect(html).toContain('action="/auth/logout"');
  });
  it("MFA HTML conserva POST, campos y escaping sin scripts ni semilla textual", () => {
    const enroll = enrollmentHtml(
      "data:image/svg+xml;base64,SYNTHETIC_ONLY",
      'factor"><script>bad()</script>',
    );
    expect(enroll).toContain('action="/auth/mfa/challenge" method="post"');
    expect(enroll).toContain('name="factor_id"');
    expect(enroll).toContain("&quot;&gt;&lt;script&gt;");
    expect(enroll).not.toContain("<script>");
    const verify = challengeHtml("factor-synthetic", "challenge-synthetic");
    for (const text of [
      'action="/auth/mfa/verify" method="post"',
      'name="factor_id"',
      'name="challenge_id"',
      'name="code"',
      'pattern="[0-9]{6}"',
      'autocomplete="one-time-code"',
    ])
      expect(verify).toContain(text);
    expect(verify).not.toContain("<img");
    expect(verify).not.toContain("<script");
  });
});
