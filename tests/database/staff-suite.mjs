import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createEmbedded, migrate, migrateAndSeed } from "./engine.mjs";
import { ids } from "./fixture-ids.mjs";

const migrationName = "20261111120000_staff_permissions.sql";
const staffAuth = "00000000-0000-4000-8000-000000000031";
const teacherAuth = "00000000-0000-4000-8000-000000000032";
const foreignAuth = "00000000-0000-4000-8000-000000000033";
const pendingAuth = "00000000-0000-4000-8000-000000000034";
const operationId = (n) => "00000000-0000-4000-8000-0000000001" + n;
const { orgA, orgB, authAdminA, authAdminB, authStudentA, courseA, courseA2 } =
  ids;
let passed = 0;
async function check(name, test) {
  await test();
  console.log("PASS " + name);
  passed++;
}
const first = async (db, sql, args = []) => (await db.query(sql, args)).rows[0];
function as(db, sub, operation, aal = "aal2") {
  return db.transaction(async (tx) => {
    await tx.query("SELECT set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub, aal, role: "authenticated" }),
    ]);
    await tx.exec("SET LOCAL ROLE authenticated");
    return operation(tx);
  });
}
const prepare = (db, org, auth, key) =>
  first(
    db,
    "SELECT private.prepare_staff_assignment($1,$2,'Nombre de prueba','Personal','operador-qa','referencia-qa',$3) AS id",
    [org, auth, key],
  ).then((row) => row.id);
const list = (db, org) =>
  first(db, "SELECT public.list_staff($1) AS data", [org]).then(
    (row) => row.data,
  );
const link = (db, org, id, rank, modules, status = "active") =>
  first(db, "SELECT public.link_staff($1,$2,$3,$4::text[],$5) AS id", [
    org,
    id,
    rank,
    modules,
    status,
  ]).then((row) => row.id);
const edit = (db, org, id, version, rank, modules, status = "active") =>
  first(
    db,
    "SELECT public.update_staff($1,$2,$3,$4,$5::text[],$6) AS version",
    [org, id, version, rank, modules, status],
  ).then((row) => Number(row.version));
const context = (db, org, module, course = "") =>
  first(db, "SELECT public.staff_academic_context($1,$2,$3) AS data", [
    org,
    module,
    course,
  ]).then((row) => row.data);
const courseUpdate = (db, org, id) =>
  db.query(
    'SELECT public.update_course($1,$2,1,\'{"title":"Sin autorización"}\')',
    [org, id],
  );
const listSchedule = (db, org, admin) =>
  db.query(
    "SELECT public.list_schedule($1,current_date,current_date+1,$2,'')",
    [org, admin],
  );
const readCount = (db, table, org) =>
  first(
    db,
    "SELECT count(*) AS n FROM public." + table + " WHERE organization_id=$1",
    [org],
  ).then((row) => Number(row.n));
const todayEvent = (db, title = "Sesión de roles") =>
  first(
    db,
    "SELECT public.create_schedule_sessions($1,$2,ARRAY[(now() AT TIME ZONE 'America/Lima')::date],'07:00','07:20',false,$3::jsonb) AS ids",
    [orgA, courseA, JSON.stringify({ title })],
  ).then((row) => row.ids[0]);

const db = await createEmbedded();
try {
  await migrateAndSeed(db);
  await db.query(
    "INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,'u-rbac01@cuentas.sistema-alumnos.invalid',now()),($2,'u-rbac02@cuentas.sistema-alumnos.invalid',now()),($3,'u-rbac03@cuentas.sistema-alumnos.invalid',now()),($4,'u-rbac04@cuentas.sistema-alumnos.invalid',NULL)",
    [staffAuth, teacherAuth, foreignAuth, pendingAuth],
  );
  await db.exec(
    "INSERT INTO storage.objects(bucket_id,name) SELECT bucket_name,object_path FROM public.file_assets",
  );
  const key = operationId(11);
  let assignment;
  let teacherAssignment;
  let foreignAssignment;
  let staff;
  let teacher;
  let version;
  let event;
  await check(
    "Preparación privada verifica cuenta, organización y evidencia con una clave idempotente",
    async () => {
      await assert.rejects(
        as(db, authAdminA, (tx) => prepare(tx, orgA, staffAuth, key)),
        { code: "42501" },
      );
      await assert.rejects(prepare(db, orgA, pendingAuth, key), {
        code: "22023",
      });
      await assert.rejects(prepare(db, orgA, ids.authStudentA, key), {
        code: "22023",
      });
      assignment = await prepare(db, orgA, staffAuth, key);
      assert.equal(await prepare(db, orgA, staffAuth, key), assignment);
      await assert.rejects(prepare(db, orgB, staffAuth, key), {
        code: "23505",
      });
      await assert.rejects(prepare(db, orgA, staffAuth, operationId(12)), {
        code: "23505",
      });
      teacherAssignment = await prepare(db, orgA, teacherAuth, operationId(13));
      foreignAssignment = await prepare(db, orgB, foreignAuth, operationId(14));
    },
  );
  await check(
    "Un principal aal2 solo ve y consume asignaciones verificadas de su organización",
    async () => {
      const current = await as(db, authAdminA, (tx) => list(tx, orgA));
      assert.deepEqual(
        new Set(current.pending.map(({ id }) => id)),
        new Set([assignment, teacherAssignment]),
      );
      assert.equal(
        current.staff.filter(({ rank }) => rank === "principal").length,
        2,
      );
      assert(!JSON.stringify(current).includes("referencia-qa"));
      await assert.rejects(
        as(db, authAdminA, (tx) => list(tx, orgA), "aal1"),
        { code: "42501" },
      );
      await assert.rejects(
        as(db, authStudentA, (tx) => list(tx, orgA)),
        { code: "42501" },
      );
      await assert.rejects(
        as(db, authAdminA, (tx) => list(tx, orgB)),
        { code: "42501" },
      );
      await assert.rejects(
        as(db, authAdminA, (tx) =>
          link(tx, orgA, foreignAssignment, "administrator", ["enrollments"]),
        ),
        { code: "42501" },
      );
      await assert.rejects(
        as(db, authAdminA, (tx) =>
          link(tx, orgA, assignment, "principal", ["courses"]),
        ),
        { code: "22023" },
      );
      await assert.rejects(
        as(db, authAdminA, (tx) =>
          link(tx, orgA, assignment, "administrator", [
            "enrollments",
            "unknown",
          ]),
        ),
        { code: "22023" },
      );
      staff = await as(db, authAdminA, (tx) =>
        link(tx, orgA, assignment, "administrator", ["enrollments"]),
      );
      teacher = await as(db, authAdminA, (tx) =>
        link(tx, orgA, teacherAssignment, "teacher", [
          "attendance",
          "certificates",
          "certificates.recommend",
        ]),
      );
      await assert.rejects(
        as(db, authAdminA, (tx) =>
          link(tx, orgA, assignment, "administrator", []),
        ),
        { code: "42501" },
      );
      const state = await first(
        db,
        `SELECT m.status,p.status AS profile_status,a.status AS assignment_status
      FROM public.organization_memberships m JOIN public.profiles p ON p.id=m.profile_id
      JOIN private.identity_activation_requests a ON a.membership_id=m.id WHERE m.id=$1`,
        [staff],
      );
      assert.deepEqual(state, {
        status: "active",
        profile_status: "active",
        assignment_status: "linked",
      });
    },
  );
  await check(
    "Matrículas funciona con sus propios permisos y selectores sin contactos",
    async () => {
      const selectors = await as(db, staffAuth, (tx) =>
        context(tx, orgA, "enrollments"),
      );
      assert(selectors.courses.some(({ id }) => id === courseA2));
      assert(
        selectors.memberships.some(({ id }) => id === ids.memberStudentA2),
      );
      assert(!JSON.stringify(selectors).includes("contact_email"));
      assert(!JSON.stringify(selectors).includes("profile_id"));
      assert(!JSON.stringify(selectors).includes("description"));
      assert(
        (await as(db, staffAuth, (tx) => readCount(tx, "enrollments", orgA))) >
          0,
      );
      assert.equal(
        await as(db, staffAuth, (tx) => readCount(tx, "courses", orgA)),
        0,
      );
      assert.equal(
        await as(db, staffAuth, (tx) =>
          readCount(tx, "organization_memberships", orgA),
        ),
        1,
      );
      assert.equal(
        await as(db, staffAuth, (tx) =>
          readCount(tx, "attendance_records", orgA),
        ),
        0,
      );
      await assert.rejects(
        as(db, staffAuth, (tx) => context(tx, orgA, "students")),
        { code: "42501" },
      );
      const statement =
        "INSERT INTO public.enrollments(organization_id,course_id,membership_id,status,enrolled_at,progress_percent) VALUES($1,$2,$3,'active',now(),0) RETURNING id,row_version";
      const added = await as(db, staffAuth, (tx) =>
        first(tx, statement, [orgA, courseA2, ids.memberStudentA]),
      );
      assert(added.id);
      const progress = await as(db, staffAuth, (tx) =>
        first(
          tx,
          "SELECT public.update_enrollment($1,$2,$3,'{\"progress_percent\":25}') AS version",
          [orgA, added.id, added.row_version],
        ),
      );
      assert.equal(Number(progress.version), Number(added.row_version) + 1);
      await assert.rejects(
        as(db, staffAuth, (tx) =>
          first(tx, statement, [orgA, courseA2, staff]),
        ),
        { code: "42501" },
      );
      await assert.rejects(
        as(db, staffAuth, (tx) =>
          first(tx, statement, [orgA, courseA2, ids.memberStudentB]),
        ),
        { code: "42501" },
      );
    },
  );
  await check(
    "Rol limitado, aal1 y acceso directo quedan cerrados en SQL",
    async () => {
      await assert.rejects(
        as(db, staffAuth, (tx) => list(tx, orgA)),
        { code: "42501" },
      );
      await assert.rejects(
        as(db, staffAuth, (tx) =>
          edit(tx, orgA, staff, 1, "administrator", ["courses"]),
        ),
        { code: "42501" },
      );
      await assert.rejects(
        as(db, staffAuth, (tx) => courseUpdate(tx, orgA, courseA)),
        { code: "42501" },
      );
      await assert.rejects(
        as(db, staffAuth, (tx) => listSchedule(tx, orgA, true)),
        { code: "42501" },
      );
      await assert.rejects(
        as(db, staffAuth, (tx) => listSchedule(tx, orgA, false)),
        { code: "42501" },
      );
      await assert.rejects(
        as(db, staffAuth, (tx) => context(tx, orgB, "enrollments")),
        { code: "42501" },
      );
      await assert.rejects(
        as(db, staffAuth, (tx) => context(tx, orgA, "enrollments"), "aal1"),
        { code: "42501" },
      );
      assert.equal(
        await as(
          db,
          staffAuth,
          (tx) => readCount(tx, "enrollments", orgA),
          "aal1",
        ),
        0,
      );
      await assert.rejects(
        as(db, authAdminA, (tx) =>
          edit(tx, orgA, ids.memberAdminA, 1, "principal", [], "suspended"),
        ),
        { code: "42501" },
      );
    },
  );
  await check(
    "Profesor con Asistencia puede registrar presencia sin administrar Horario",
    async () => {
      event = await as(db, authAdminA, (tx) => todayEvent(tx));
      const selectors = await as(db, teacherAuth, (tx) =>
        context(tx, orgA, "attendance", courseA),
      );
      assert(selectors.events.some(({ id }) => id === event));
      assert(selectors.memberships.some(({ id }) => id === ids.memberStudentA));
      assert(!JSON.stringify(selectors).includes("contact_email"));
      assert.equal(
        await as(db, teacherAuth, (tx) =>
          readCount(tx, "calendar_events", orgA),
        ),
        0,
      );
      await assert.rejects(
        as(db, teacherAuth, (tx) => todayEvent(tx)),
        { code: "42501" },
      );
      await as(db, teacherAuth, (tx) =>
        tx.query("SELECT public.set_attendance($1,$2,$3,'present')", [
          orgA,
          event,
          ids.memberStudentA,
        ]),
      );
      const record = await as(db, teacherAuth, (tx) =>
        first(
          tx,
          "SELECT status FROM public.attendance_records WHERE organization_id=$1 AND event_id=$2 AND membership_id=$3",
          [orgA, event, ids.memberStudentA],
        ),
      );
      assert.equal(record.status, "present");
      const studentRecord = await as(
        db,
        authStudentA,
        (tx) =>
          first(
            tx,
            "SELECT status FROM public.attendance_records WHERE event_id=$1",
            [event],
          ),
        "aal1",
      );
      assert.equal(studentRecord.status, "present");
      await assert.rejects(
        as(db, teacherAuth, (tx) =>
          tx.query("SELECT public.set_attendance($1,$2,$3,'late')", [
            orgB,
            event,
            ids.memberStudentA,
          ]),
        ),
        { code: "42501" },
      );
    },
  );
  await check(
    "Rango y permisos cambian con versión y revocación inmediata",
    async () => {
      version = Number(
        (
          await first(
            db,
            "SELECT row_version FROM public.organization_memberships WHERE id=$1",
            [staff],
          )
        ).row_version,
      );
      await assert.rejects(
        as(db, authAdminB, (tx) =>
          edit(tx, orgB, staff, version, "secretary", ["materials"]),
        ),
        { code: "42501" },
      );
      const before = version;
      version = await as(db, authAdminA, (tx) =>
        edit(tx, orgA, staff, version, "secretary", ["materials"]),
      );
      assert.equal(version, before + 1);
      await assert.rejects(
        as(db, authAdminA, (tx) =>
          edit(tx, orgA, staff, before, "teacher", ["attendance"]),
        ),
        { code: "40001" },
      );
      assert.equal(
        await as(db, staffAuth, (tx) => readCount(tx, "enrollments", orgA)),
        0,
      );
      assert(
        (await as(db, staffAuth, (tx) => readCount(tx, "materials", orgA))) > 0,
      );
      assert.equal(
        await as(db, staffAuth, (tx) => readCount(tx, "materials", orgB)),
        0,
      );
    },
  );
  await check(
    "Archivos PDF y RPC de metadatos respetan módulo, tipo, organización y MFA",
    async () => {
      const assets = await as(db, staffAuth, (tx) =>
        tx.query("SELECT id FROM public.file_assets WHERE id=ANY($1::uuid[])", [
          [ids.assetA, ids.assetB, ids.assetCertificate, ids.assetVideo],
        ]),
      );
      assert.deepEqual(
        assets.rows.map(({ id }) => id),
        [ids.assetA],
      );
      const storage = await as(db, staffAuth, (tx) =>
        tx.query("SELECT bucket_id,name FROM storage.objects"),
      );
      assert(storage.rows.some(({ name }) => name.includes(ids.assetA)));
      assert(
        !storage.rows.some(
          ({ name }) =>
            name.includes(ids.assetCertificate) ||
            name.includes(ids.assetB) ||
            name.includes(ids.assetVideo),
        ),
      );
      await assert.rejects(
        as(db, staffAuth, (tx) =>
          tx.query(
            'SELECT public.update_file_asset($1,$2,1,\'{"status":"archived"}\')',
            [orgA, ids.assetCertificate],
          ),
        ),
        { code: "42501" },
      );
      const lower = await as(
        db,
        staffAuth,
        (tx) =>
          tx.query("SELECT id FROM public.file_assets WHERE id=$1", [
            ids.assetA,
          ]),
        "aal1",
      );
      assert.equal(lower.rows.length, 0);
    },
  );
  await check(
    "Horario delegado conserva el bloqueo por asistencia y carece de escritura en Asistencia",
    async () => {
      version = await as(db, authAdminA, (tx) =>
        edit(tx, orgA, staff, version, "administrator", ["schedule"]),
      );
      const schedule = await as(db, staffAuth, (tx) =>
        first(
          tx,
          "SELECT public.list_schedule($1,current_date-1,current_date+2,true,'') AS data",
          [orgA],
        ),
      );
      const entry = schedule.data.sessions.find(({ id }) => id === event);
      assert(entry?.attendance_locked);
      await assert.rejects(
        as(db, staffAuth, (tx) =>
          tx.query(
            "SELECT public.update_schedule_session($1,$2,$3,jsonb_build_object('starts_at',$4::timestamptz+interval '5 minutes'))",
            [orgA, event, entry.row_version, entry.starts_at],
          ),
        ),
        { code: "23514" },
      );
      await assert.rejects(
        as(db, staffAuth, (tx) =>
          tx.query("SELECT public.set_attendance($1,$2,$3,'late')", [
            orgA,
            event,
            ids.memberStudentA,
          ]),
        ),
        { code: "42501" },
      );
    },
  );
  await check(
    "Permisos de certificados se asignan por separado y no habilitan emisión",
    async () => {
      const teacherRights = await as(db, teacherAuth, (tx) =>
        first(
          tx,
          "SELECT private.can_use_module($1,'certificates.recommend') AS recommend,private.can_use_module($1,'certificates.approve') AS approve",
          [orgA],
        ),
      );
      assert.deepEqual(teacherRights, { recommend: true, approve: false });
      const teacherVersion = Number(
        (
          await first(
            db,
            "SELECT row_version FROM public.organization_memberships WHERE id=$1",
            [teacher],
          )
        ).row_version,
      );
      await assert.rejects(
        as(db, authAdminA, (tx) =>
          edit(tx, orgA, teacher, teacherVersion, "teacher", [
            "certificates",
            "certificates.approve",
          ]),
        ),
        { code: "22023" },
      );
      version = await as(db, authAdminA, (tx) =>
        edit(tx, orgA, staff, version, "administrator", [
          "certificates",
          "certificates.approve",
        ]),
      );
      assert.deepEqual(
        await as(db, staffAuth, (tx) =>
          first(
            tx,
            "SELECT private.can_use_module($1,'certificates.recommend') AS recommend,private.can_use_module($1,'certificates.approve') AS approve",
            [orgA],
          ),
        ),
        { recommend: false, approve: true },
      );
      await assert.rejects(
        as(db, staffAuth, (tx) =>
          tx.query(
            'SELECT public.update_certificate_issue($1,$2,1,\'{"status":"issued"}\')',
            [orgA, ids.issueA],
          ),
        ),
        { code: "42501" },
      );
    },
  );
  await check(
    "Suspensión retira acceso y activación conserva la identidad y su organización",
    async () => {
      version = await as(db, authAdminA, (tx) =>
        edit(
          tx,
          orgA,
          staff,
          version,
          "administrator",
          ["enrollments"],
          "suspended",
        ),
      );
      await assert.rejects(
        as(db, staffAuth, (tx) => context(tx, orgA, "enrollments")),
        { code: "42501" },
      );
      version = await as(db, authAdminA, (tx) =>
        edit(tx, orgA, staff, version, "administrator", ["enrollments"]),
      );
      assert(
        (await as(db, staffAuth, (tx) => readCount(tx, "enrollments", orgA))) >
          0,
      );
    },
  );
  await check(
    "Otro principal puede promover y degradar personal autorizado",
    async () => {
      version = await as(db, authAdminA, (tx) =>
        edit(tx, orgA, staff, version, "principal", []),
      );
      assert.equal(
        (await as(db, staffAuth, (tx) => list(tx, orgA))).staff.find(
          ({ id }) => id === staff,
        ).rank,
        "principal",
      );
      await assert.rejects(
        as(db, staffAuth, (tx) =>
          edit(tx, orgA, staff, version, "administrator", ["enrollments"]),
        ),
        { code: "42501" },
      );
      version = await as(db, authAdminA, (tx) =>
        edit(tx, orgA, staff, version, "administrator", ["enrollments"]),
      );
      await assert.rejects(
        as(db, staffAuth, (tx) => list(tx, orgA)),
        { code: "42501" },
      );
    },
  );
  await check(
    "La base impide suspender, degradar o desvincular al último principal",
    async () => {
      for (const [sql, id] of [
        [
          "UPDATE public.organization_memberships SET status='suspended' WHERE id=$1",
          ids.memberAdminB,
        ],
        [
          "UPDATE public.organization_memberships SET staff_rank='teacher' WHERE id=$1",
          ids.memberAdminB,
        ],
        [
          "DELETE FROM public.organization_memberships WHERE id=$1",
          ids.memberAdminB,
        ],
        [
          "UPDATE public.profiles SET status='blocked' WHERE id=$1",
          ids.profileAdminB,
        ],
        [
          "UPDATE public.profiles SET auth_user_id=NULL WHERE id=$1",
          ids.profileAdminB,
        ],
      ]) {
        await assert.rejects(
          db.transaction(async (tx) => {
            await tx.query(sql, [id]);
            await tx.exec("SET CONSTRAINTS ALL IMMEDIATE");
          }),
          { code: "23514" },
        );
      }
    },
  );
} finally {
  await db.close();
}

const migrations = new URL("../../supabase/migrations/", import.meta.url);
const sql = await readFile(new URL(migrationName, migrations), "utf8");
const prior = await createEmbedded();
try {
  await migrate(prior, migrationName);
  const qaOrg = "211f6de1-5f3f-45ac-bbb1-d8363d715d01";
  const qaMember = "6e4260d4-b596-4158-8663-91b73a382f7a";
  const qaProfile = "5c68dac3-31fe-4a70-a823-45fa69f3c058";
  const qaAuth = "6cabd8d2-55d0-401c-b4f6-a20040215134";
  await prior.transaction(async (tx) => {
    await tx.query(
      "INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,'u-000002@cuentas.sistema-alumnos.invalid',now())",
      [qaAuth],
    );
    await tx.query(
      "INSERT INTO public.organizations(id,slug,name,status) VALUES($1,'qa-sistema-alumnos-01','QA local','active')",
      [qaOrg],
    );
    await tx.query(
      "INSERT INTO public.profiles(id,auth_user_id,status) VALUES($1,$2,'active')",
      [qaProfile, qaAuth],
    );
    await tx.query(
      "INSERT INTO public.organization_memberships(id,organization_id,profile_id,role,status,first_name) VALUES($1,$2,$3,'admin','active','QA')",
      [qaMember, qaOrg, qaProfile],
    );
  });
  await check(
    "La migración se detiene si aparece otra organización activa sin asignación aprobada",
    async () => {
      await prior.transaction(async (tx) => {
        await tx.query(
          "INSERT INTO public.organizations(id,slug,name,status) VALUES($1,'otra-local','Otra','active')",
          [orgB],
        );
        await tx.query(
          "INSERT INTO public.organization_memberships(organization_id,profile_id,role,status,first_name) VALUES($1,$2,'admin','active','Otro')",
          [orgB, qaProfile],
        );
      });
      await assert.rejects(prior.exec(sql), { code: "23514" });
      await prior.exec("ROLLBACK");
      assert.equal(
        (
          await first(
            prior,
            "SELECT count(*) AS n FROM information_schema.columns WHERE table_name='organization_memberships' AND column_name='staff_rank'",
          )
        ).n,
        0,
      );
      await prior.query(
        "UPDATE public.organizations SET status='suspended' WHERE id=$1",
        [orgB],
      );
    },
  );
  await check(
    "La promoción inicial valida la identidad QA y conserva la membresía original",
    async () => {
      await prior.query(
        "UPDATE auth.users SET email='u-no-verificado@cuentas.sistema-alumnos.invalid' WHERE id=$1",
        [qaAuth],
      );
      await assert.rejects(prior.exec(sql), { code: "23514" });
      await prior.exec("ROLLBACK");
      await prior.query(
        "UPDATE auth.users SET email='u-000002@cuentas.sistema-alumnos.invalid' WHERE id=$1",
        [qaAuth],
      );
      await prior.exec(sql);
      const role = await first(
        prior,
        "SELECT staff_rank,allowed_modules,profile_id FROM public.organization_memberships WHERE id=$1",
        [qaMember],
      );
      assert.deepEqual(role, {
        staff_rank: "principal",
        allowed_modules: [],
        profile_id: qaProfile,
      });
      const staff = await as(prior, qaAuth, (tx) => list(tx, qaOrg));
      assert.equal(staff.staff.length, 1);
      assert.equal(staff.staff[0].id, qaMember);
    },
  );
} finally {
  await prior.close();
}
console.log(
  passed + " comprobaciones de Roles y Permisos en PostgreSQL embebido.",
);
