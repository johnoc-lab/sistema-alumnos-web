import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createEmbedded, migrateAndSeed } from "./engine.mjs";
import { ids } from "./fixture-ids.mjs";

let db;
before(async () => {
  db = await createEmbedded();
  await migrateAndSeed(db);
  await db.query(
    "insert into storage.objects(bucket_id,name) select bucket_name,object_path from public.file_assets where id=$1",
    [ids.assetA],
  );
});
after(async () => db?.close());

async function asUser(user, aal, verify) {
  await db.exec("BEGIN");
  try {
    await db.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: user, role: "authenticated", aal }),
    ]);
    await db.exec("SET LOCAL ROLE authenticated");
    await verify();
  } finally {
    await db.exec("ROLLBACK");
  }
}

const count = async (relation) =>
  Number(
    (await db.query("select count(*) as total from " + relation)).rows[0].total,
  );
const schedule = (admin = false) =>
  db.query(
    "select public.list_schedule($1,'2026-11-10','2026-11-12',$2,null) as result",
    [ids.orgA, admin],
  );

test("el alumno sin factor o con factor pendiente conserva su acceso", async () => {
  await asUser(ids.authStudentA, "aal1", async () => {
    assert.equal(await count("public.enrollments"), 1);
    assert.equal(await count("storage.objects"), 1);
    assert.equal((await schedule()).rows[0].result.sessions.length, 1);
  });
  await db.query(
    "insert into auth.mfa_factors(user_id,factor_type,status) values ($1,'totp','unverified')",
    [ids.authStudentA],
  );
  await asUser(ids.authStudentA, "aal1", async () => {
    assert.equal(await count("public.enrollments"), 1);
  });
});

test("TOTP confirmado impide tablas, Storage y RPC desde una sesión aal1", async () => {
  await db.query(
    "insert into auth.mfa_factors(user_id,factor_type,status) values ($1,'totp','verified')",
    [ids.authStudentA],
  );
  await asUser(ids.authStudentA, "aal1", async () => {
    const orgs = await db.query("select id from public.organizations");
    assert.deepEqual(orgs.rows, [{ id: ids.orgA }]);
    assert.equal(await count("public.organization_memberships"), 1);
    assert.deepEqual((await db.query("select id from public.profiles")).rows, [
      { id: ids.profileStudentA },
    ]);
    for (const relation of [
      "public.courses",
      "public.enrollments",
      "public.materials",
      "public.certificate_issues",
      "public.calendar_events",
      "public.file_assets",
      "storage.objects",
    ])
      assert.equal(await count(relation), 0, relation);
    await assert.rejects(schedule(), { code: "42501" });
  });

  await asUser(ids.authStudentA, "aal2", async () => {
    assert.equal(await count("public.enrollments"), 1);
    assert.equal(await count("public.certificate_issues"), 1);
    assert.equal(await count("storage.objects"), 1);
    assert.equal((await schedule()).rows[0].result.sessions.length, 1);
    await assert.rejects(schedule(true), { code: "42501" });
  });
});

test("el MFA de otro alumno no cambia el acceso propio", async () => {
  await asUser(ids.authStudentA2, "aal1", async () => {
    assert.equal(await count("public.enrollments"), 1);
  });
});

test("el personal sin TOTP conserva el requisito de aal2", async () => {
  await asUser(ids.authAdminA, "aal1", async () => {
    assert.equal(await count("public.organizations"), 1);
    assert.equal(await count("public.courses"), 0);
    await assert.rejects(schedule(true), { code: "42501" });
  });
  await asUser(ids.authAdminA, "aal2", async () => {
    assert.ok((await count("public.courses")) > 0);
    assert.equal((await schedule(true)).rows[0].result.sessions.length, 1);
  });
});
