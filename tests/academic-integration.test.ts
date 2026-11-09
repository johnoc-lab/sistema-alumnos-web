import { it, expect, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFile, readdir } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
import {
  mutateAcademic,
  loadAcademic,
  type AcademicClient,
} from "@/features/academic/data.server";
import { parseAcademicForm } from "@/features/academic/forms";
import { AcademicView } from "@/features/academic/academic-page";

// Solo transporte de pruebas: traduce el subconjunto de consultas usado por la app
// a PostgreSQL embebido real. No emula Auth ni PostgREST; nunca se importa en src/.
function sqlClient(db: PGlite): AcademicClient {
  const ident = (s: string) => {
    if (!/^[a-z_]+$/.test(s)) throw Error("unsupported_test_identifier");
    return '"' + s + '"';
  };
  const tables = new Set([
    "courses",
    "organization_memberships",
    "enrollments",
    "materials",
    "announcements",
    "calendar_events",
    "calendar_event_attendees",
    "attendance_records",
    "file_assets",
  ]);
  return {
    from(table: string) {
      if (!tables.has(table)) throw Error("unsupported_test_table");
      let columns = "*",
        single = false,
        limit = 500;
      let insert: Record<string, unknown> | undefined;
      const filters: string[] = [],
        orders: string[] = [],
        params: unknown[] = [];
      const bind = (v: unknown) => {
        params.push(v);
        return "$" + params.length;
      };
      const chain = {
        select(value: string) {
          columns = value === "*" ? "*" : value.split(",").map(ident).join(",");
          return chain;
        },
        eq(key: string, value: unknown) {
          filters.push(ident(key) + "=" + bind(value));
          return chain;
        },
        in(key: string, values: unknown[]) {
          filters.push(ident(key) + " IN (" + values.map(bind).join(",") + ")");
          return chain;
        },
        order(key: string, options?: { ascending?: boolean }) {
          orders.push(
            ident(key) + (options?.ascending === false ? " DESC" : " ASC"),
          );
          return chain;
        },
        limit(value: number) {
          limit = value;
          return chain;
        },
        maybeSingle() {
          single = true;
          return chain;
        },
        insert(value: Record<string, unknown>) {
          insert = value;
          return chain;
        },
        async then(
          resolve: (v: unknown) => unknown,
          reject: (e: unknown) => unknown,
        ) {
          try {
            let sql: string;
            if (insert) {
              sql =
                "INSERT INTO public." +
                ident(table) +
                " (" +
                Object.keys(insert).map(ident).join(",") +
                ") VALUES (" +
                Object.values(insert).map(bind).join(",") +
                ")";
            } else {
              sql =
                "SELECT " +
                columns +
                " FROM public." +
                ident(table) +
                (filters.length ? " WHERE " + filters.join(" AND ") : "") +
                (orders.length ? " ORDER BY " + orders.join(",") : "") +
                " LIMIT " +
                limit;
            }
            const result = await db.query(sql, params);
            if (single && result.rows.length > 1)
              throw Error("unexpected_multiple_rows");
            return resolve({
              data: single ? (result.rows[0] ?? null) : result.rows,
              error: null,
            });
          } catch (error) {
            return Promise.resolve({ data: null, error }).then(resolve, reject);
          }
        },
      };
      return chain;
    },
    async rpc(
      name: string,
      p: {
        p_organization_id: string;
        p_id: string;
        p_expected_version: number;
        p_patch: unknown;
      },
    ) {
      if (
        ![
          "update_course",
          "update_enrollment",
          "update_material",
          "update_announcement",
        ].includes(name)
      )
        throw Error("unsupported_test_rpc");
      try {
        const result = await db.query(
          "SELECT public." +
            ident(name) +
            "($1::uuid,$2::uuid,$3::bigint,$4::jsonb) AS result",
          [
            p.p_organization_id,
            p.p_id,
            p.p_expected_version,
            JSON.stringify(p.p_patch),
          ],
        );
        return { data: result.rows[0], error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
  } as unknown as AcademicClient;
}

it("formularios → adaptador de aplicación → SQL real: taller, matrícula, enlace, aviso y RLS", async () => {
  const db = new PGlite({ extensions: { btree_gist } });
  const org = "00000000-0000-4000-8000-000000000001";
  const other = "00000000-0000-4000-8000-000000000002";
  const student = "00000000-0000-4000-8000-000000000203";
  const client = sqlClient(db);
  const actor = async (number: string, aal = "aal1") => {
    await db.exec("RESET ROLE");
    await db.query("SELECT set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({
        sub: "00000000-0000-4000-8000-0000000000" + number,
        aal,
        role: "authenticated",
        is_anonymous: false,
      }),
    ]);
    await db.exec("SET ROLE authenticated");
  };
  const submit = (fields: Record<string, string>, target = org) =>
    mutateAcademic(
      client,
      target,
      parseAcademicForm(new URLSearchParams(fields)),
    );
  try {
    await db.exec(
      await readFile(
        new URL("./database/support/embedded-bootstrap.sql", import.meta.url),
        "utf8",
      ),
    );
    const migrations = new URL("../supabase/migrations/", import.meta.url);
    for (const name of (await readdir(migrations))
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      await db.exec(await readFile(new URL(name, migrations), "utf8"));
    }
    // Fixtures solo en memoria. No se lee configuración privada ni se conecta a Cloud.
    await db.exec(
      await readFile(new URL("../supabase/seed.sql", import.meta.url), "utf8"),
    );
    await actor("11", "aal2");
    await submit({
      action: "course",
      slug: "recorrido-navegador",
      title: "Taller de integración",
      status: "published",
    });
    let data = await loadAcademic(client, org);
    const course = data.courses.find((c) => c.slug === "recorrido-navegador")!;
    expect(course).toBeDefined();
    await submit({
      action: "enrollment",
      course_id: course.id,
      membership_id: student,
    });
    await expect(
      submit({
        action: "enrollment",
        course_id: course.id,
        membership_id: student,
      }),
    ).rejects.toMatchObject({ code: "23505" });
    await submit({
      action: "material",
      course_id: course.id,
      title: "Guía del taller",
      status: "published",
      source: "link",
      external_url: "https://docs.google.com/document/d/qa-sintetico",
    });
    await submit({
      action: "announcement",
      course_id: course.id,
      title: "Bienvenida QA",
      body: "Primer aviso del taller.",
      status: "published",
    });
    await submit({
      action: "course",
      id: course.id,
      version: String(course.row_version),
      title: course.title,
      description: "Descripción actualizada por RPC",
      status: "published",
    });
    await expect(
      submit({
        action: "course",
        id: course.id,
        version: String(course.row_version),
        title: "Versión obsoleta",
        status: "published",
      }),
    ).rejects.toMatchObject({ code: "40001" });
    for (const [number, aal] of [
      ["11", "aal1"],
      ["13", "aal2"],
      ["15", "aal2"],
    ]) {
      await actor(number!, aal);
      await expect(
        submit({
          action: "course",
          slug: "no-autorizado",
          title: "No autorizado",
          status: "published",
        }),
      ).rejects.toMatchObject({ code: "42501" });
    }
    await actor("13");
    data = await loadAcademic(client, org);
    expect(data.courses.some((c) => c.id === course.id)).toBe(true);
    expect(data.materials.some((m) => m.title === "Guía del taller")).toBe(
      true,
    );
    expect(data.announcements.some((a) => a.title === "Bienvenida QA")).toBe(
      true,
    );
    const html = renderToStaticMarkup(
      createElement(AcademicView, {
        slug: "qa",
        section: "dashboard/cursos",
        courseId: course.id,
        profileId: "00000000-0000-4000-8000-000000000103",
        data,
      }),
    );
    expect(html).toContain("Guía del taller");
    expect(html).toContain("Bienvenida QA");
    expect(html).not.toContain('action="/o/qa/acciones"');
    expect((await loadAcademic(client, other)).materials).toEqual([]);
    await actor("14");
    expect(
      (await loadAcademic(client, org)).courses.some((c) => c.id === course.id),
    ).toBe(false);
    expect(
      (await loadAcademic(client, org)).materials.some(
        (m) => m.course_id === course.id,
      ),
    ).toBe(false);
    await actor("11", "aal2");
    data = await loadAcademic(client, org);
    const enrollment = data.enrollments.find((e) => e.course_id === course.id)!;
    await submit({
      action: "enrollment",
      id: enrollment.id,
      version: String(enrollment.row_version),
      status: "paused",
      progress_percent: "25",
    });
    await actor("13");
    expect(
      (await loadAcademic(client, org)).materials.some(
        (m) => m.course_id === course.id,
      ),
    ).toBe(false);
  } finally {
    await db.close();
  }
}, 60000);
