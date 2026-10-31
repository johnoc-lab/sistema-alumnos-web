import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  parsePreviewRoute,
  sections,
  organizationSlugs,
} from "@/features/preview/routes";
import { getPreviewData } from "@/features/preview/fixtures";
import { normalizeSearch } from "@/features/preview/presentation";
import { Badge } from "@/components/ui/primitives";
describe("navegación de demostración", () => {
  it.each(organizationSlugs)("reconoce todas las secciones de %s", (slug) => {
    for (const section of sections)
      expect(
        parsePreviewRoute(["o", slug, ...section.split("/")])?.section,
      ).toBe(section);
  });
  it.each([
    ["o", "unknown", "admin"],
    ["o", "constructor", "admin"],
    ["o", "impulso", "admin", "delete"],
    ["auth", "callback"],
    ["o", "impulso", "dashboard", "cursos", ".."],
    ["o", "impulso", "dashboard", "cursos", "course", "extra"],
  ])("rechaza segmentos fuera de la lista: %s", (...segments) =>
    expect(parsePreviewRoute(segments)).toBeNull(),
  );
  it("reconoce un detalle sin convertirlo en acceso real", () =>
    expect(
      parsePreviewRoute([
        "o",
        "impulso",
        "dashboard",
        "cursos",
        "estrategia-emprendedora",
      ]),
    ).toEqual({
      organizationSlug: "impulso",
      section: "dashboard/cursos",
      courseId: "estrategia-emprendedora",
    }));
  it.each(organizationSlugs)(
    "no mezcla fixtures entre organizaciones: %s",
    (slug) => {
      const data = getPreviewData(slug);
      expect(data.courses.length).toBeGreaterThan(0);
      expect(data.students.length).toBeGreaterThan(0);
      expect(data.courses.every((c) => c.organizationSlug === slug)).toBe(true);
      expect(
        data.students.every(
          (s) =>
            s.organizationSlug === slug && s.email.endsWith("@example.test"),
        ),
      ).toBe(true);
    },
  );
  it("encuentra textos con acentos y mayúsculas", () =>
    expect(normalizeSearch("  COMUNICACIÓN ")).toBe("comunicacion"));
  it("renderiza entrada no confiable como texto en React", () => {
    const html = renderToStaticMarkup(
      createElement(Badge, null, '<img src=x onerror="alert(1)">'),
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});
