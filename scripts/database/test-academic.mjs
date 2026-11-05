import assert from "node:assert/strict";
import {
  createEmbedded,
  migrateAndSeed,
} from "../../tests/database/engine.mjs";
import { ids } from "../../tests/database/fixture-ids.mjs";
const db = await createEmbedded();
let passed = 0,
  failed = 0;
const q = (sql, params = []) => db.query(sql, params),
  scalar = async (sql, params = []) =>
    Object.values((await q(sql, params)).rows[0])[0];
const course = "10000000-0000-4000-8000-000000000001",
  material = "10000000-0000-4000-8000-000000000002",
  enrollment = "10000000-0000-4000-8000-000000000003";
let event;
async function actor(auth, aal = "aal1") {
  await db.exec("RESET ROLE");
  await q("SELECT set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({
      sub: auth,
      aal,
      role: "authenticated",
      is_anonymous: false,
    }),
  ]);
  await db.exec("SET LOCAL ROLE authenticated");
}
async function denied(operation, code) {
  await db.exec("SAVEPOINT expected_failure");
  let got;
  try {
    await operation();
  } catch (e) {
    got = e.code;
  }
  await db.exec(
    "ROLLBACK TO SAVEPOINT expected_failure;RELEASE SAVEPOINT expected_failure",
  );
  assert.equal(got, code);
}
async function test(name, fn) {
  await db.exec("SAVEPOINT academic_case");
  try {
    await fn();
    passed++;
    console.log("PASS " + name);
    await db.exec("RELEASE SAVEPOINT academic_case");
  } catch (e) {
    failed++;
    await db.exec(
      "ROLLBACK TO SAVEPOINT academic_case;RELEASE SAVEPOINT academic_case",
    );
    console.error("FAIL " + name + " [" + (e.code ?? e.message) + "]");
  }
}
try {
  const migrations = await migrateAndSeed(db);
  await db.exec("BEGIN");
  await test("admin aal2 crea taller, lo publica por CAS y matricula alumno", async () => {
    await actor(ids.authAdminA, "aal2");
    await q(
      "INSERT INTO public.courses(id,organization_id,slug,title) VALUES($1,$2,'qa-funcional','Taller sintético QA')",
      [course, ids.orgA],
    );
    assert.equal(
      Number(
        await scalar("SELECT public.update_course($1,$2,1,$3::jsonb)", [
          ids.orgA,
          course,
          JSON.stringify({
            status: "published",
            description: "Contenido sintético",
          }),
        ]),
      ),
      2,
    );
    await q(
      "INSERT INTO public.enrollments(id,organization_id,course_id,membership_id,enrolled_at) VALUES($1,$2,$3,$4,now())",
      [enrollment, ids.orgA, course, ids.memberStudentA],
    );
  });
  await test("matrícula duplicada se rechaza sin alterar la existente", async () => {
    await actor(ids.authAdminA, "aal2");
    await denied(
      () =>
        q(
          "INSERT INTO public.enrollments(organization_id,course_id,membership_id,enrolled_at) VALUES($1,$2,$3,now())",
          [ids.orgA, course, ids.memberStudentA],
        ),
      "23505",
    );
    assert.equal(
      Number(
        await scalar("SELECT count(*) FROM public.enrollments WHERE id=$1", [
          enrollment,
        ]),
      ),
      1,
    );
  });
  await test("publicación de enlace y aviso, y evento con asistentes, usa esquema existente", async () => {
    await actor(ids.authAdminA, "aal2");
    await q(
      "INSERT INTO public.materials(id,organization_id,course_id,title,external_url,status) VALUES($1,$2,$3,'Recurso sintético','https://youtu.be/qa','published')",
      [material, ids.orgA, course],
    );
    await q(
      "INSERT INTO public.announcements(organization_id,course_id,title,body,status,published_at) VALUES($1,$2,'Aviso QA','Texto sintético','published',now())",
      [ids.orgA, course],
    );
    event = await scalar(
      "SELECT public.create_scheduled_event($1,$2::jsonb,$3::uuid[])",
      [
        ids.orgA,
        JSON.stringify({
          course_id: course,
          title: "Actividad QA",
          starts_at: "2026-12-01T14:00:00Z",
          ends_at: "2026-12-01T15:00:00Z",
          timezone: "America/Lima",
        }),
        [ids.memberStudentA],
      ],
    );
    assert.ok(event);
  });
  await test("alumno matriculado lee su taller, material, aviso y evento", async () => {
    await actor(ids.authStudentA);
    for (const table of [
      "courses",
      "materials",
      "announcements",
      "calendar_events",
    ]) {
      const key = table === "courses" ? "id" : "course_id";
      assert.equal(
        Number(
          await scalar(
            "SELECT count(*) FROM public." + table + " WHERE " + key + "=$1",
            [course],
          ),
        ),
        1,
      );
    }
  });
  await test("alumno no matriculado de la misma organización no lee contenido", async () => {
    await actor(ids.authStudentA2);
    for (const table of [
      "courses",
      "materials",
      "announcements",
      "calendar_events",
    ]) {
      const key = table === "courses" ? "id" : "course_id";
      assert.equal(
        Number(
          await scalar(
            "SELECT count(*) FROM public." + table + " WHERE " + key + "=$1",
            [course],
          ),
        ),
        0,
      );
    }
  });
  await test("otra organización no lee ni modifica el taller", async () => {
    await actor(ids.authAdminB, "aal2");
    assert.equal(
      Number(
        await scalar("SELECT count(*) FROM public.courses WHERE id=$1", [
          course,
        ]),
      ),
      0,
    );
    await denied(
      () =>
        q("SELECT public.update_course($1,$2,2,$3::jsonb)", [
          ids.orgA,
          course,
          JSON.stringify({ title: "No permitido" }),
        ]),
      "42501",
    );
  });
  await test("admin aal1 y alumno aal2 no realizan operaciones administrativas", async () => {
    for (const [auth, aal] of [
      [ids.authAdminA, "aal1"],
      [ids.authStudentA, "aal2"],
    ]) {
      await actor(auth, aal);
      await denied(
        () =>
          q("SELECT public.update_course($1,$2,2,$3::jsonb)", [
            ids.orgA,
            course,
            JSON.stringify({ title: "No permitido" }),
          ]),
        "42501",
      );
      await denied(
        () =>
          q(
            "INSERT INTO public.courses(organization_id,slug,title) VALUES($1,'no-autorizado','No')",
            [ids.orgA],
          ),
        "42501",
      );
    }
  });
  await test("edición de alumno y conflicto de versión mediante RPC existentes", async () => {
    await actor(ids.authAdminA, "aal2");
    const v = await scalar(
      "SELECT row_version FROM public.organization_memberships WHERE id=$1",
      [ids.memberStudentA],
    );
    await q("SELECT public.update_student_contact($1,$2,$3,$4::jsonb)", [
      ids.orgA,
      ids.memberStudentA,
      Number(v),
      JSON.stringify({
        first_name: "Alumno QA",
        last_name: "Sintético",
        contact_email: null,
      }),
    ]);
    await denied(
      () =>
        q("SELECT public.update_student_contact($1,$2,$3,$4::jsonb)", [
          ids.orgA,
          ids.memberStudentA,
          Number(v),
          JSON.stringify({ first_name: "Viejo" }),
        ]),
      "40001",
    );
  });
  await test("archivo de otro taller y evento sin asistentes son rechazados", async () => {
    await actor(ids.authAdminA, "aal2");
    await denied(
      () =>
        q(
          "INSERT INTO public.materials(organization_id,course_id,title,file_asset_id) VALUES($1,$2,'PDF ajeno',$3)",
          [ids.orgA, course, ids.assetA],
        ),
      "23503",
    );
    await denied(
      () =>
        q("SELECT public.create_scheduled_event($1,$2::jsonb,$3::uuid[])", [
          ids.orgA,
          JSON.stringify({
            course_id: course,
            title: "Sin asistentes",
            starts_at: "2026-12-01T14:00:00Z",
            ends_at: "2026-12-01T15:00:00Z",
          }),
          [],
        ]),
      "22023",
    );
  });
  await test("pausar conserva matrícula y retira acceso académico del alumno", async () => {
    await actor(ids.authAdminA, "aal2");
    await q("SELECT public.update_enrollment($1,$2,1,$3::jsonb)", [
      ids.orgA,
      enrollment,
      JSON.stringify({ status: "paused" }),
    ]);
    assert.equal(
      Number(
        await scalar("SELECT count(*) FROM public.enrollments WHERE id=$1", [
          enrollment,
        ]),
      ),
      1,
    );
    await actor(ids.authStudentA);
    assert.equal(
      Number(
        await scalar("SELECT count(*) FROM public.courses WHERE id=$1", [
          course,
        ]),
      ),
      0,
    );
    assert.equal(
      Number(
        await scalar("SELECT count(*) FROM public.materials WHERE id=$1", [
          material,
        ]),
      ),
      0,
    );
  });
  await db.exec("ROLLBACK");
  console.log(
    `PostgreSQL embebido: ${passed}/${passed + failed} recorridos académicos; ${migrations.length} migraciones. Solo datos sintéticos en memoria. No prueba Auth HTTP ni Storage real.`,
  );
  if (failed) process.exitCode = 1;
} finally {
  await db.close();
}
