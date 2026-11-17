import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createEmbedded, migrateAndSeed } from "./engine.mjs";
import { ids } from "./fixture-ids.mjs";

const student = "1a141111-1111-4111-8111-111111111111";
const email = "student-demo@example.test";
let db;
before(async () => {
  db = await createEmbedded();
  await migrateAndSeed(db);
  await db.query(
    `insert into auth.users (id,email,email_confirmed_at,raw_app_meta_data)
     values ($1,$2,now(),'{"student_registration_organization":"incubadora"}')`,
    [student, email],
  );
});
after(async () => db?.close());

async function withRole(role, check, id = student, aal = "aal1") {
  await db.exec("BEGIN");
  try {
    await db.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: id, role, aal }),
    ]);
    await db.exec("SET LOCAL ROLE " + role);
    await check();
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

const provision = (
  id = student,
  target = "incubadora",
  address = email,
  first = "Ana",
) =>
  db.query(
    "select public.provision_registered_student($1,$2,$3,$4,'Muñoz') as ok",
    [id, target, address, first],
  );
const count = async (relation) =>
  Number((await db.query("select count(*) from " + relation)).rows[0].count);

test("service_role puede consultar el estado de una institución con solo tres columnas", async () => {
  const { rows } = await db.query(`
    select attname
    from pg_attribute
    where attrelid = 'public.organizations'::regclass and attnum > 0
      and not attisdropped and has_column_privilege('service_role', attrelid, attnum, 'SELECT')
    order by attname
  `);
  assert.deepEqual(
    rows.map((row) => row.attname),
    ["id", "slug", "status"],
  );
  await withRole("service_role", async () => {
    const lookup = await db.query(
      "select id from public.organizations where slug=$1 and status='active'",
      ["incubadora"],
    );
    assert.deepEqual(lookup.rows, [{ id: ids.orgB }]);
  });
  await assert.rejects(
    withRole("service_role", () =>
      db.query("select name from public.organizations"),
    ),
    { code: "42501" },
  );
});

test("solo service_role ejecuta la operación y un Auth sin marca no obtiene perfil ni membresía nueva", async () => {
  for (const role of ["anon", "authenticated"])
    await assert.rejects(
      withRole(role, () => provision()),
      { code: "42501" },
    );
  await withRole("service_role", async () => {
    assert.equal(
      (await provision(ids.authAdminA, "incubadora", "admina@example.test"))
        .rows[0].ok,
      false,
    );
    assert.equal((await provision(student, "impulso-cero")).rows[0].ok, false);
    assert.equal(
      (await provision(student, "incubadora", "another@example.test")).rows[0]
        .ok,
      false,
    );
  });
  assert.equal(
    (
      await db.query("select id from public.profiles where auth_user_id=$1", [
        student,
      ])
    ).rows.length,
    0,
  );
});

test("una nueva membresía student activa y los reintentos conservan el perfil sin matrículas", async () => {
  await withRole("service_role", async () => {
    assert.equal((await provision()).rows[0].ok, true);
    assert.equal(
      (await provision(student, "incubadora", email, "Otro nombre")).rows[0].ok,
      true,
    );
  });
  await withRole("authenticated", async () => {
    assert.equal(await count("public.profiles"), 1);
    assert.deepEqual(
      (await db.query("select slug from public.organizations")).rows,
      [{ slug: "incubadora" }],
    );
    const { rows } = await db.query(
      "select role, status, staff_rank, first_name from public.organization_memberships",
    );
    assert.deepEqual(rows, [
      {
        role: "student",
        status: "active",
        staff_rank: null,
        first_name: "Ana",
      },
    ]);
    for (const table of [
      "courses",
      "enrollments",
      "materials",
      "attendance_records",
      "calendar_events",
      "file_assets",
    ])
      assert.equal(await count("public." + table), 0, table);
    assert.equal(await count("storage.objects"), 0);
  });
  await withRole(
    "authenticated",
    async () => {
      assert.equal(
        (
          await db.query(
            "select count(*)::int as total from public.organization_memberships where contact_email=$1",
            [email],
          )
        ).rows[0].total,
        1,
      );
    },
    ids.authAdminB,
    "aal2",
  );
});
