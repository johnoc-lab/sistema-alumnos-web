import assert from "node:assert/strict";
import { createEmbedded, migrateAndSeed } from "./engine.mjs";
import { ids } from "./fixture-ids.mjs";

const db = await createEmbedded();
const {
  orgA,
  orgB,
  courseA,
  courseDraft,
  courseB,
  authAdminA,
  authStudentA,
  authStudentB,
  memberStudentA,
} = ids;
const details = {
  title: "Horario sintético",
  description: "Prueba local",
  modality: "hybrid",
  location: "Aula 1",
};
const date = "2090-11-06";
const otherDate = "2090-11-08";
let passed = 0;

function asActor(actor, aal, operation) {
  return db.transaction(async (tx) => {
    await tx.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: actor, aal, role: "authenticated" }),
    ]);
    await tx.exec("SET LOCAL ROLE authenticated");
    return operation(tx);
  });
}
const admin = (operation) => asActor(authAdminA, "aal2", operation);
const student = (operation) => asActor(authStudentA, "aal1", operation);
const create = (
  tx,
  {
    org = orgA,
    course = courseA,
    dates = [date],
    start = "09:00",
    end = "10:00",
    draft = false,
  } = {},
) =>
  tx
    .query(
      "SELECT public.create_schedule_sessions($1,$2,$3::date[],$4::time,$5::time,$6,$7::jsonb) AS ids",
      [org, course, dates, start, end, draft, JSON.stringify(details)],
    )
    .then(({ rows }) => rows[0].ids);
const edit = (tx, id, version, patch) =>
  tx
    .query(
      "SELECT public.update_schedule_session($1,$2,$3,$4::jsonb) AS version",
      [orgA, id, version, JSON.stringify(patch)],
    )
    .then(({ rows }) => Number(rows[0].version));
const list = (
  tx,
  adminView = false,
  course = "",
  org = orgA,
  from = "2090-11-01",
  to = "2090-12-01",
) =>
  tx
    .query("SELECT public.list_schedule($1,$2,$3,$4,$5) AS schedule", [
      org,
      from,
      to,
      adminView,
      course,
    ])
    .then(({ rows }) => rows[0].schedule);

async function check(name, run) {
  await run();
  console.log("PASS " + name);
  passed++;
}

try {
  await migrateAndSeed(db);
  let session;
  let draft;
  await check(
    "Serie con identificadores distintos, zona de Lima y registros de asistencia",
    async () => {
      const created = await admin((tx) =>
        create(tx, { dates: [date, otherDate] }),
      );
      assert.equal(new Set(created).size, 2);
      [session] = created;
      const { rows } = await db.query(
        "SELECT series_id, timezone, starts_at AT TIME ZONE 'UTC' AS utc FROM public.calendar_events WHERE id=ANY($1::uuid[]) ORDER BY starts_at",
        [created],
      );
      assert.ok(rows[0].series_id);
      assert.equal(rows[0].series_id, rows[1].series_id);
      assert.equal(rows[0].timezone, "America/Lima");
      assert.match(String(rows[0].utc), /14:00:00/);
      const attendance = await db.query(
        "SELECT event_id FROM public.attendance_records WHERE event_id=ANY($1::uuid[])",
        [created],
      );
      assert.equal(new Set(attendance.rows.map((row) => row.event_id)).size, 2);
    },
  );
  await check(
    "Las sesiones consecutivas son válidas y los cruces del mismo taller se rechazan",
    async () => {
      await admin((tx) => create(tx, { start: "10:00", end: "11:00" }));
      await assert.rejects(
        admin((tx) => create(tx, { start: "09:30", end: "10:30" })),
        { code: "23P01" },
      );
    },
  );
  await check(
    "Un conflicto posterior revierte toda la serie, incluidas sus filas de asistencia",
    async () => {
      const count = async (table) =>
        Number(
          (await db.query("SELECT count(*) AS n FROM " + table)).rows[0].n,
        );
      const before = [
        await count("public.calendar_events"),
        await count("public.attendance_records"),
      ];
      await assert.rejects(
        admin((tx) => create(tx, { dates: ["2090-11-05", date] })),
        { code: "23P01" },
      );
      assert.deepEqual(
        [
          await count("public.calendar_events"),
          await count("public.attendance_records"),
        ],
        before,
      );
    },
  );
  await check(
    "Máximo de 60 sesiones, fechas únicas y orden válido de horas",
    async () => {
      const dates = Array.from({ length: 61 }, (_, index) =>
        new Date(Date.UTC(2091, 0, 1 + index)).toISOString().slice(0, 10),
      );
      await assert.rejects(
        admin((tx) => create(tx, { dates, draft: true })),
        { code: "22023" },
      );
      assert.equal(
        (
          await admin((tx) =>
            create(tx, { dates: dates.slice(0, 60), draft: true }),
          )
        ).length,
        60,
      );
      await assert.rejects(
        admin((tx) => create(tx, { dates: [date, date] })),
        { code: "22023" },
      );
      await assert.rejects(
        admin((tx) => create(tx, { start: "10:00", end: "10:00" })),
        { code: "22023" },
      );
    },
  );
  await check(
    "Borrador sin participantes y rechazo al programar un taller no publicado",
    async () => {
      [draft] = await admin((tx) =>
        create(tx, { course: courseDraft, draft: true }),
      );
      assert.equal(
        (
          await db.query(
            "SELECT 1 FROM public.calendar_event_attendees WHERE event_id=$1",
            [draft],
          )
        ).rows.length,
        0,
      );
      await assert.rejects(
        admin((tx) => edit(tx, draft, 1, { status: "scheduled" })),
        { code: "22023" },
      );
      assert.equal(
        await admin((tx) => edit(tx, draft, 1, { status: "cancelled" })),
        2,
      );
    },
  );
  await check(
    "Publicar un borrador elegible crea participantes y mantiene el UUID",
    async () => {
      const [id] = await admin((tx) =>
        create(tx, { draft: true, dates: ["2090-11-12"] }),
      );
      assert.equal(
        await admin((tx) => edit(tx, id, 1, { status: "scheduled" })),
        2,
      );
      assert.ok(
        (await student((tx) => list(tx))).sessions.some(
          (item) => item.id === id,
        ),
      );
    },
  );
  await check(
    "Edición optimista y bloqueo de fechas con asistencia pendiente en ambos RPC",
    async () => {
      assert.equal(
        await admin((tx) => edit(tx, session, 1, { title: "Título editado" })),
        2,
      );
      await assert.rejects(
        admin((tx) => edit(tx, session, 1, { title: "Versión obsoleta" })),
        { code: "40001" },
      );
      const patch = {
        starts_at: date + "T11:00:00-05:00",
        ends_at: date + "T12:00:00-05:00",
      };
      await assert.rejects(
        admin((tx) => edit(tx, session, 2, patch)),
        { message: "schedule_attendance_locked" },
      );
      await assert.rejects(
        admin((tx) =>
          tx.query("SELECT public.update_calendar_event($1,$2,2,$3::jsonb)", [
            orgA,
            session,
            JSON.stringify(patch),
          ]),
        ),
        { message: "schedule_attendance_locked" },
      );
    },
  );
  await check(
    "Asistencia puede marcar la sesión y conserva la marca al cancelarla",
    async () => {
      const {
        rows: [{ today }],
      } = await db.query(
        "SELECT (now() AT TIME ZONE 'America/Lima')::date::text AS today",
      );
      const [id] = await admin((tx) =>
        create(tx, { dates: [today], start: "03:00", end: "04:00" }),
      );
      await admin((tx) =>
        tx.query("SELECT public.set_attendance_batch($1,$2,$3::jsonb)", [
          orgA,
          id,
          JSON.stringify([
            { membership_id: memberStudentA, status: "present" },
          ]),
        ]),
      );
      await admin((tx) => edit(tx, id, 1, { status: "cancelled" }));
      const { rows } = await db.query(
        "SELECT status FROM public.attendance_records WHERE event_id=$1 AND membership_id=$2",
        [id, memberStudentA],
      );
      assert.equal(rows[0].status, "present");
    },
  );
  await check(
    "Alumno matriculado ve cancelación publicada y la lectura no expone versiones de escritura",
    async () => {
      await admin((tx) => edit(tx, session, 2, { status: "cancelled" }));
      const schedule = await student((tx) => list(tx, false, courseA));
      const cancelled = schedule.sessions.find((item) => item.id === session);
      assert.equal(cancelled.status, "cancelled");
      assert.equal(cancelled.row_version, null);
      assert.equal(cancelled.attendance_locked, false);
      assert.ok(schedule.sessions.every((item) => item.course_id === courseA));
      assert.ok(!schedule.sessions.some((item) => item.id === draft));
      assert.equal(
        (await student((tx) => list(tx, false, courseB))).sessions.length,
        0,
      );
    },
  );
  await check(
    "Cancelar un borrador de un taller publicado no publica la sesión",
    async () => {
      const [id] = await admin((tx) =>
        create(tx, { dates: ["2090-11-14"], draft: true }),
      );
      await admin((tx) => edit(tx, id, 1, { status: "cancelled" }));
      assert.ok(
        !(await student((tx) => list(tx))).sessions.some(
          (item) => item.id === id,
        ),
      );
    },
  );
  await check(
    "Rango acotado, aislamiento entre organizaciones y acceso administrativo con aal2",
    async () => {
      await assert.rejects(
        student((tx) => list(tx, true)),
        { code: "42501" },
      );
      await assert.rejects(
        student((tx) => create(tx)),
        { code: "42501" },
      );
      await assert.rejects(
        asActor(authAdminA, "aal1", (tx) => create(tx)),
        { code: "42501" },
      );
      await assert.rejects(
        asActor(authStudentB, "aal1", (tx) => list(tx)),
        { code: "42501" },
      );
      await assert.rejects(
        admin((tx) => create(tx, { org: orgB, course: courseB })),
        { code: "42501" },
      );
      await assert.rejects(
        student((tx) => list(tx, false, "", orgA, "2090-11-01", "2091-01-01")),
        { code: "22023" },
      );
      const narrowed = await student((tx) =>
        list(tx, false, courseA, orgA, date, "2090-11-07"),
      );
      assert.ok(narrowed.sessions.some((item) => item.id === session));
      assert.ok(
        narrowed.sessions.every(
          (item) => !item.starts_at.startsWith(otherDate),
        ),
      );
    },
  );
  await check(
    "El alumno deja de ver el taller cuando su matrícula pasa a completada",
    async () => {
      await db.query(
        "UPDATE public.enrollments SET status='completed' WHERE id=$1",
        [ids.enrollmentA],
      );
      const schedule = await student((tx) => list(tx, false, courseA));
      assert.ok(!schedule.courses.some((course) => course.id === courseA));
      assert.equal(schedule.sessions.length, 0);
    },
  );
  console.log(passed + " comprobaciones de Horario en PostgreSQL embebido.");
} finally {
  await db.close();
}
