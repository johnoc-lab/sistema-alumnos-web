import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  loadAcademic,
  loadStaffAcademic,
  mutateAcademic,
  privatePdf,
  type AcademicClient,
} from "@/features/academic/data.server";
import { parseAcademicForm, errorNotice } from "@/features/academic/forms";
const org = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222";
function fake(replies: { data: unknown; error: unknown }[] = []) {
  const calls: {
    table: string;
    methods: { name: string; args: unknown[] }[];
  }[] = [];
  const from = vi.fn((table: string) => {
    const call = { table, methods: [] as { name: string; args: unknown[] }[] };
    calls.push(call);
    const response = replies.shift() ?? { data: [], error: null };
    const chain: Record<string, unknown> = {};
    for (const name of [
      "select",
      "eq",
      "in",
      "order",
      "limit",
      "maybeSingle",
      "insert",
    ])
      chain[name] = (...args: unknown[]) => {
        call.methods.push({ name, args });
        return chain;
      };
    chain.then = (
      resolve: (value: unknown) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(response).then(resolve, reject);
    return chain;
  });
  const rpc = vi.fn(
    async (): Promise<{ data: unknown; error: unknown }> => ({
      data: 2,
      error: null,
    }),
  );
  const download = vi.fn(async () => ({
    data: new Blob(["synthetic pdf"], { type: "application/pdf" }),
    error: null,
  }));
  const storageFrom = vi.fn(() => ({ download }));
  return {
    client: {
      from,
      rpc,
      storage: { from: storageFrom },
    } as unknown as AcademicClient,
    calls,
    rpc,
    download,
    storageFrom,
  };
}
const parse = (p: Record<string, string>) =>
  parseAcademicForm(new URLSearchParams(p));
describe("adaptador académico con SDK simulado", () => {
  it("todas las consultas de datos incluyen organización y límites", async () => {
    const db = fake();
    const data = await loadAcademic(db.client, org);
    expect(data.courses).toEqual([]);
    expect(db.calls).toHaveLength(9);
    for (const c of db.calls) {
      expect(c.methods).toContainEqual({
        name: "eq",
        args: ["organization_id", org],
      });
      const expectedLimit =
        c.table === "calendar_event_attendees" || c.table === "attendance_records"
          ? 2000
          : 500;
      expect(c.methods).toContainEqual({ name: "limit", args: [expectedLimit] });
    }
  });
  it("carga solo matrículas y referencias mínimas para el módulo delegado", async () => {
    const db = fake();
    const context = {
      courses: [{ id, title: "Taller", status: "published" }],
      memberships: [],
      enrollments: [],
      events: [],
    };
    db.rpc.mockResolvedValueOnce({ data: context, error: null });
    const data = await loadStaffAcademic(db.client, org, "enrollments", null);
    expect(data.courses).toEqual(context.courses);
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("staff_academic_context", {
      p_org: org,
      p_module: "enrollments",
      p_course: "",
    });
    expect(db.calls.map((call) => call.table)).toEqual(["enrollments"]);
  });
  it("el formulario anterior recibe el enlace disponible sin cambiar la respuesta original", async () => {
    const material = {
      id,
      external_url: null,
      class_url: null,
      recording_url: "https://example.test/recording",
    };
    const empty = { data: [], error: null };
    const db = fake([empty, empty, empty, { data: [material], error: null }]);
    const result = await loadAcademic(db.client, org);
    expect(result.materials[0]?.external_url).toBe(material.recording_url);
    expect(material.external_url).toBeNull();
  });
  it("una consulta fallida no se representa como un estado vacío", async () => {
    const db = fake([{ data: null, error: { code: "42501" } }]);
    await expect(loadAcademic(db.client, org)).rejects.toMatchObject({
      code: "42501",
    });
  });
  it("edita el taller mediante RPC CAS, con el org del guard y solo campos permitidos", async () => {
    const db = fake();
    await mutateAcademic(
      db.client,
      org,
      parse({
        action: "course",
        id,
        version: "3",
        title: "QA",
        description: "Texto",
        tag: "QA",
        status: "published",
      }),
    );
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("update_course", {
      p_organization_id: org,
      p_id: id,
      p_expected_version: 3,
      p_patch: {
        title: "QA",
        description: "Texto",
        tag: "QA",
        status: "published",
      },
    });
  });
  it("crear curso no acepta un tenant o campos de sistema enviados por el formulario", async () => {
    const db = fake();
    await mutateAcademic(
      db.client,
      org,
      parse({
        action: "course",
        title: "QA",
        slug: "qa",
        status: "draft",
        organization_id: id,
        row_version: "500",
      }),
    );
    expect(db.calls[0]?.methods).toContainEqual({
      name: "insert",
      args: [
        {
          organization_id: org,
          slug: "qa",
          title: "QA",
          description: "",
          tag: "",
          status: "draft",
        },
      ],
    });
  });
  it("envía una sola escritura de matrícula al tenant verificado", async () => {
    const db = fake();
    await mutateAcademic(
      db.client,
      org,
      parse({ action: "enrollment", course_id: id, membership_id: id }),
    );
    expect(db.calls.map((call) => call.table)).toEqual(["enrollments"]);
    const insert = db.calls[0]?.methods.find(
      (method) => method.name === "insert",
    )?.args[0];
    expect(insert).toMatchObject({
      organization_id: org,
      status: "active",
      course_id: id,
      membership_id: id,
    });
    expect(insert).toHaveProperty("enrolled_at");
  });
  it.each(["23503", "42501"])(
    "propaga el rechazo %s de integridad o RLS al matricular",
    async (code) => {
      const db = fake([{ data: null, error: { code } }]);
      await expect(
        mutateAcademic(
          db.client,
          org,
          parse({ action: "enrollment", course_id: id, membership_id: id }),
        ),
      ).rejects.toMatchObject({ code });
      expect(db.calls.map((call) => call.table)).toEqual(["enrollments"]);
    },
  );
  it("una matrícula duplicada no se reescribe ni se borra", async () => {
    const db = fake([{ data: null, error: { code: "23505" } }]);
    try {
      await mutateAcademic(
        db.client,
        org,
        parse({ action: "enrollment", course_id: id, membership_id: id }),
      );
      throw Error("Expected duplicate");
    } catch (e) {
      expect(errorNotice(e)).toBe("duplicate");
    }
    expect(db.rpc).not.toHaveBeenCalled();
    expect(
      db.calls
        .flatMap((c) => c.methods)
        .some((m) => m.name === "upsert" || m.name === "delete"),
    ).toBe(false);
  });
  it("cambiar matrícula utiliza RPC y conserva el registro", async () => {
    const db = fake();
    await mutateAcademic(
      db.client,
      org,
      parse({
        action: "enrollment",
        id,
        version: "2",
        status: "paused",
        progress_percent: "20",
      }),
    );
    expect(db.rpc).toHaveBeenCalledWith(
      "update_enrollment",
      expect.objectContaining({
        p_id: id,
        p_expected_version: 2,
        p_patch: { status: "paused", progress_percent: 20, completed_at: null },
      }),
    );
  });
  it("publicación de material exige PDF ready del mismo taller", async () => {
    const db = fake([{ data: null, error: null }]);
    await expect(
      mutateAcademic(
        db.client,
        org,
        parse({
          action: "material",
          course_id: id,
          title: "PDF",
          status: "published",
          source: "pdf",
          file_asset_id: id,
        }),
      ),
    ).rejects.toMatchObject({ reason: "pdf" });
    expect(db.calls[0]?.methods).toContainEqual({
      name: "eq",
      args: ["course_id", id],
    });
    expect(db.calls[0]?.methods).toContainEqual({
      name: "eq",
      args: ["status", "ready"],
    });
  });
  it("publica los enlaces de materiales en sus campos separados", async () => {
    const db = fake([{ data: { id }, error: null }]);
    await mutateAcademic(
      db.client,
      org,
      parse({
        action: "material",
        course_id: id,
        title: "Video",
        status: "published",
        source: "links",
        class_url: "https://meet.google.com/qa-clase",
        recording_url: "https://youtu.be/qa",
        help_url: "https://www.youtube.com/watch?v=ayuda-qa",
      }),
    );
    expect(db.calls[0]?.methods).toContainEqual({
      name: "insert",
      args: [
        {
          organization_id: org,
          course_id: id,
          title: "Video",
          status: "published",
          external_url: null,
          class_url: "https://meet.google.com/qa-clase",
          recording_url: "https://youtu.be/qa",
          help_url: "https://www.youtube.com/watch?v=ayuda-qa",
          file_asset_id: null,
        },
      ],
    });
    expect(db.storageFrom).not.toHaveBeenCalled();
  });
  it("aviso publicado establece fecha y curso de audiencia", async () => {
    const db = fake([{ data: { id }, error: null }]);
    await mutateAcademic(
      db.client,
      org,
      parse({
        action: "announcement",
        course_id: id,
        title: "Aviso",
        body: "Texto",
        status: "published",
      }),
    );
    const payload = db.calls[0]?.methods.find((m) => m.name === "insert")
      ?.args[0];
    expect(payload).toMatchObject({
      organization_id: org,
      course_id: id,
      status: "published",
    });
    expect(payload).toHaveProperty("published_at");
  });
  it("evento sin asistentes no se crea como programado", async () => {
    const db = fake();
    db.rpc.mockResolvedValueOnce({ data: { attendee_ids: [] }, error: null });
    await expect(
      mutateAcademic(
        db.client,
        org,
        parse({
          action: "event",
          course_id: id,
          title: "QA",
          starts_at: "2026-11-10T09:00",
          ends_at: "2026-11-10T10:00",
        }),
      ),
    ).rejects.toMatchObject({ reason: "attendees" });
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("staff_academic_context", {
      p_org: org,
      p_module: "schedule",
      p_course: id,
    });
  });
  it("PDF usa la sesión ordinaria y ruta obtenida de metadatos RLS", async () => {
    const db = fake([
      {
        data: {
          bucket_name: "course-files",
          object_path: org + "/" + id + "/guia.pdf",
          original_name: "guia.pdf",
        },
        error: null,
      },
    ]);
    const pdf = await privatePdf(db.client, org, id);
    expect(pdf.name).toBe("guia.pdf");
    expect(db.storageFrom).toHaveBeenCalledExactlyOnceWith("course-files");
    expect(db.download).toHaveBeenCalledExactlyOnceWith(
      org + "/" + id + "/guia.pdf",
    );
  });
  it("PDF no visible no llega a Storage", async () => {
    const db = fake([{ data: null, error: null }]);
    await expect(privatePdf(db.client, org, id)).rejects.toMatchObject({
      reason: "unavailable",
    });
    expect(db.storageFrom).not.toHaveBeenCalled();
  });
});
