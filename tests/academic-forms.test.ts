import { describe, it, expect } from "vitest";
import {
  parseAcademicForm,
  resourceUrl,
  limaInstant,
  errorNotice,
  AcademicError,
} from "@/features/academic/forms";
const id = "11111111-1111-4111-8111-111111111111";
const parse = (p: Record<string, string>) =>
  parseAcademicForm(new URLSearchParams(p));
describe("formularios académicos", () => {
  it("crea un taller con campos permitidos y sin confiar en tenant/rol enviados", () => {
    const c = parse({
      action: "course",
      slug: "mi-taller",
      title: " Taller QA ",
      description: "Texto",
      tag: "QA",
      status: "draft",
      organization_id: id,
      role: "admin",
    });
    expect(c).toMatchObject({ kind: "course", title: "Taller QA", id: null });
    expect(c).not.toHaveProperty("organization_id");
    expect(c).not.toHaveProperty("role");
  });
  it.each([
    { slug: "Con Espacios" },
    { title: "" },
    { status: "public" },
    { title: "a".repeat(201) },
  ])("rechaza taller inválido %j", (bad) => {
    expect(() =>
      parse({
        action: "course",
        slug: "qa",
        title: "QA",
        status: "draft",
        ...bad,
      }),
    ).toThrow(AcademicError);
  });
  it("exige UUID y versión para editar", () => {
    expect(() =>
      parse({ action: "student-status", id, version: "0", status: "active" }),
    ).toThrow();
    expect(() =>
      parse({
        action: "student-status",
        id: "foreign",
        version: "1",
        status: "active",
      }),
    ).toThrow();
    expect(
      parse({
        action: "student-status",
        id,
        version: "2",
        status: "suspended",
      }),
    ).toMatchObject({ version: 2, status: "suspended" });
  });
  it("no ofrece acciones de borrado ni creación de credenciales", () => {
    for (const action of ["delete", "create-user", "reset-password"])
      expect(() => parse({ action })).toThrow();
  });
  it("rechaza campos duplicados y correos inválidos", () => {
    expect(() =>
      parseAcademicForm(new URLSearchParams("action=course&action=student")),
    ).toThrow();
    expect(() =>
      parse({
        action: "student",
        id,
        version: "1",
        first_name: "QA",
        contact_email: "no-email",
      }),
    ).toThrow();
  });
  it("matricula inicialmente como active sin un upsert solicitado por el formulario", () => {
    expect(
      parse({
        action: "enrollment",
        course_id: id,
        membership_id: id,
        status: "archived",
      }),
    ).toMatchObject({ status: "active", progress_percent: 0 });
  });
  it.each(["-1", "101", "NaN"])("rechaza avance %s", (progress) =>
    expect(() =>
      parse({
        action: "enrollment",
        id,
        version: "1",
        status: "active",
        progress_percent: progress,
      }),
    ).toThrow(),
  );
  it.each([
    "https://youtu.be/qa",
    "https://drive.google.com/file/d/qa",
    "https://docs.google.com/document/d/qa",
    "https://player.vimeo.com/video/123",
  ])("admite enlace existente permitido %s", (url) =>
    expect(resourceUrl(url)).toBe(url),
  );
  it.each([
    "javascript:alert(1)",
    "http://youtu.be/x",
    "https://youtu.be.evil.test/x",
    "https://user:pass@youtu.be/x",
    "https://127.0.0.1/x",
    "https://youtu.be:8443/x",
  ])("rechaza URL %s", (url) => expect(resourceUrl(url)).toBeNull());
  it("material PDF y enlace son modalidades excluyentes", () => {
    expect(
      parse({
        action: "material",
        course_id: id,
        title: "Guía",
        source: "pdf",
        file_asset_id: id,
        external_url: "https://evil.test",
        status: "draft",
      }),
    ).toMatchObject({ file_asset_id: id, external_url: null });
  });
  it("valida fechas de Lima y su orden, incluidos días inexistentes", () => {
    expect(limaInstant("2026-11-10T09:30")).toBe("2026-11-10T14:30:00.000Z");
    expect(() => limaInstant("2026-02-30T09:30")).toThrow();
    expect(() =>
      parse({
        action: "event",
        course_id: id,
        title: "QA",
        starts_at: "2026-11-10T10:00",
        ends_at: "2026-11-10T09:00",
      }),
    ).toThrow();
  });
  it("sanea errores de proveedor sin exponer mensajes SQL", () => {
    expect(errorNotice({ code: "23505", message: "PRIVATE" })).toBe(
      "duplicate",
    );
    expect(errorNotice({ code: "40001" })).toBe("conflict");
    expect(errorNotice(Error("PRIVATE"))).toBe("failed");
  });
});
