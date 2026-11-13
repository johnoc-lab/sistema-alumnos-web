import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createEmbedded, migrateAndSeed } from "./engine.mjs";
import { ids } from "./fixture-ids.mjs";

const db = await createEmbedded();
const {
  orgA,
  orgB,
  authAdminA,
  authAdminB,
  authStudentA,
  profileAdminA,
  profileAdminB,
  profileStudentA,
} = ids;
const identifier = "u-nuevo@cuentas.sistema-alumnos.invalid";
const identity = randomUUID();
const first = "a".repeat(64);
const second = "b".repeat(64);
const networkA = "1".repeat(64);
const networkB = "2".repeat(64);
const networkC = "3".repeat(64);
const denied = { code: "42501" };
const one = async (tx, sql, args) =>
  (await tx.query(sql, args)).rows[0]?.result;
const as = (sub, action, aal = "aal2", role = "authenticated") =>
  db.transaction(async (tx) => {
    await tx.query("SELECT set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub, aal, role }),
    ]);
    await tx.exec("SET LOCAL ROLE " + role);
    return action(tx);
  });
const service = (action) => as(null, action, null, "service_role");
const reserve = (
  tx,
  org,
  rank = "teacher",
  modules = ["attendance", "schedule"],
  actor = profileAdminA,
  aal = "aal2",
  login = identifier,
) =>
  one(
    tx,
    "SELECT public.reserve_staff_registration($1,$2,$3,$4,'Nombre','Apellidos',$5,$6::text[]) AS result",
    [org, actor, aal, login, rank, modules],
  );
const list = (tx, org) =>
  one(tx, "SELECT public.list_staff($1) AS result", [org]);
const delivery = (tx, org, registration) =>
  one(tx, "SELECT public.staff_registration_delivery($1,$2) AS result", [
    org,
    registration,
  ]);
const issue = (tx, registration, actor, digest, org = orgA) =>
  one(tx, "SELECT public.issue_staff_activation($1,$2,$3,$4) AS result", [
    org,
    registration,
    actor,
    digest,
  ]);
const claim = (
  tx,
  digest,
  operation = randomUUID(),
  network = "",
  login = identifier,
) =>
  one(tx, "SELECT public.claim_staff_activation($1,$2,$3,$4) AS result", [
    login,
    digest,
    operation,
    network,
  ]);
const finish = (tx, registration, operation, rejected = false) =>
  one(tx, "SELECT public.finish_staff_activation($1,$2,$3) AS result", [
    registration,
    operation,
    rejected,
  ]);
const access = (tx, org, module) =>
  one(tx, "SELECT private.can_use_module($1,$2) AS result", [org, module]);

try {
  await migrateAndSeed(db);
  // Ni el principal aal2 puede saltar la aplicación con un JWT de usuario.
  await assert.rejects(
    as(authAdminA, (tx) => reserve(tx, orgA)),
    denied,
  );
  await assert.rejects(
    as(authStudentA, (tx) => reserve(tx, orgA)),
    denied,
  );
  await assert.rejects(
    as(null, (tx) => reserve(tx, orgA), null, "anon"),
    denied,
  );
  await assert.rejects(
    service((tx) => reserve(tx, orgB)),
    denied,
  );
  await assert.rejects(
    service((tx) => reserve(tx, orgA, "teacher", [], profileStudentA)),
    denied,
  );
  await assert.rejects(
    service((tx) => reserve(tx, orgA, "teacher", [], profileAdminA, "aal1")),
    denied,
  );
  await assert.rejects(
    service((tx) => reserve(tx, orgA, "principal")),
    { code: "22023" },
  );
  await assert.rejects(
    service((tx) => reserve(tx, orgA, "teacher", ["attendance", "attendance"])),
    { code: "22023" },
  );
  await assert.rejects(
    service((tx) => reserve(tx, orgA, "teacher", ["certificates"])),
    { code: "22023" },
  );

  const registration = await service((tx) => reserve(tx, orgA));
  const context = await as(authAdminA, (tx) =>
    delivery(tx, orgA, registration),
  );
  assert.equal(context.authReady, false);
  assert.equal(
    await one(
      db,
      "SELECT auth_user_id AS result FROM private.identity_activation_requests WHERE id=$1",
      [registration],
    ),
    null,
  );
  assert.equal(
    await one(
      db,
      "SELECT verified_by_ref AS result FROM private.identity_activation_requests WHERE id=$1",
      [registration],
    ),
    profileAdminA,
  );
  await assert.rejects(
    service((tx) => reserve(tx, orgA)),
    { code: "23505" },
  );
  await assert.rejects(
    service((tx) => reserve(tx, orgB, "teacher", [], profileAdminB)),
    { code: "23505" },
  );
  await assert.rejects(
    service((tx) => tx.query("SELECT * FROM private.staff_activation_limits")),
    denied,
  );
  await assert.rejects(
    as(authAdminB, (tx) => delivery(tx, orgB, registration)),
    denied,
  );
  await assert.rejects(
    as(authAdminA, (tx) => claim(tx, first)),
    denied,
  );
  await assert.rejects(
    as(null, (tx) => claim(tx, first), null, "anon"),
    denied,
  );
  await assert.rejects(
    as(authAdminA, (tx) => issue(tx, registration, context.actor, first)),
    denied,
  );
  await assert.rejects(
    as(authAdminA, (tx) => finish(tx, registration, randomUUID())),
    denied,
  );
  const pending = await as(authAdminA, (tx) => list(tx, orgA));
  const member = pending.staff.find(
    (item) => item.registration === registration,
  );
  assert.equal(member?.status, "invited");
  assert.equal(member?.rank, "teacher");
  assert.deepEqual(member?.modules, ["attendance", "schedule"]);
  assert.equal(
    pending.pending.some((item) => item.id === registration),
    false,
  );
  await assert.rejects(
    as(authAdminA, (tx) =>
      tx.query(
        "SELECT public.link_staff($1,$2,'principal',ARRAY[]::text[],'active')",
        [orgA, registration],
      ),
    ),
    denied,
  );
  await assert.rejects(
    as(authAdminA, (tx) =>
      tx.query(
        "SELECT public.update_staff($1,$2,1,'principal',ARRAY[]::text[],'active')",
        [orgA, member.id],
      ),
    ),
    denied,
  );
  console.log(
    "PASS Alta, duplicados, aislamiento, módulos y separación de la vinculación anterior",
  );

  await db.query(
    "INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES($1,$2,now(),jsonb_build_object('staff_registration_id',$3::text))",
    [identity, identifier, registration],
  );
  assert.equal(
    await service((tx) => issue(tx, registration, context.actor, first)),
    false,
  );
  await db.query(
    "UPDATE auth.users SET raw_app_meta_data=raw_user_meta_data WHERE id=$1",
    [identity],
  );
  assert.equal(
    await service((tx) => issue(tx, registration, context.actor, first, orgB)),
    false,
  );
  assert.equal(
    await service((tx) => issue(tx, registration, context.actor, first)),
    true,
  );
  assert.equal(
    await as(identity, (tx) => access(tx, orgA, "attendance")),
    false,
  );
  const wrong = "c".repeat(64);
  for (let i = 0; i < 12; i++)
    assert.equal(await service((tx) => claim(tx, wrong)), null);
  assert.equal(
    await one(
      db,
      "SELECT count(*)::int AS result FROM private.staff_activation_limits",
    ),
    0,
  );

  for (let i = 0; i < 6; i++)
    assert.equal(
      await service((tx) => claim(tx, wrong, randomUUID(), networkA)),
      null,
    );
  const pairWindow = await one(
    db,
    "SELECT expires_at::text AS result FROM private.staff_activation_limits WHERE bucket LIKE 'target:%'",
  );
  assert.equal(
    await service((tx) => claim(tx, first, randomUUID(), networkA)),
    null,
  );
  assert.equal(
    await one(
      db,
      "SELECT expires_at::text AS result FROM private.staff_activation_limits WHERE bucket LIKE 'target:%'",
    ),
    pairWindow,
  );
  await db.query(
    "UPDATE private.staff_activation_limits SET expires_at=now()-interval '1 second' WHERE bucket LIKE 'target:%'",
  );
  assert.equal(
    await service((tx) => claim(tx, wrong, randomUUID(), networkA)),
    null,
  );
  assert.equal(
    await one(
      db,
      "SELECT attempts AS result FROM private.staff_activation_limits WHERE bucket LIKE 'target:%'",
    ),
    1,
  );
  for (let i = 0; i < 30; i++)
    assert.equal(
      await service((tx) =>
        claim(
          tx,
          wrong,
          randomUUID(),
          networkC,
          "u-ajeno" + i + "@cuentas.sistema-alumnos.invalid",
        ),
      ),
      null,
    );
  assert.equal(
    await service((tx) => claim(tx, first, randomUUID(), networkC)),
    null,
  );
  assert.equal(
    await one(
      db,
      "SELECT attempts AS result FROM private.staff_activation_limits WHERE bucket=$1",
      ["network:" + networkC],
    ),
    30,
  );
  assert.equal(
    await one(
      db,
      "SELECT activation_digest AS result FROM private.identity_activation_requests WHERE id=$1",
      [registration],
    ),
    first,
  );
  // La misma activación se puede canjear desde otra red pese a las ráfagas anteriores.
  const allowed = randomUUID();
  assert.ok(await service((tx) => claim(tx, first, allowed, networkB)));
  assert.equal(
    await service((tx) => finish(tx, registration, allowed, true)),
    false,
  );
  console.log(
    "PASS Límite por red y por identificador, ventana fija y aislamiento entre redes",
  );
  assert.equal(
    await service((tx) => issue(tx, registration, context.actor, second)),
    true,
  );
  assert.equal(await service((tx) => claim(tx, first)), null);
  await db.query(
    "UPDATE private.identity_activation_requests SET activation_expires_at=now()-interval '1 second' WHERE id=$1",
    [registration],
  );
  assert.equal(await service((tx) => claim(tx, second)), null);
  assert.equal(
    await service((tx) => issue(tx, registration, context.actor, second)),
    true,
  );
  const rejected = randomUUID();
  assert.ok(await service((tx) => claim(tx, second, rejected)));
  assert.equal(
    await service((tx) => finish(tx, registration, rejected, true)),
    false,
  );
  assert.equal(await service((tx) => claim(tx, second)), null);
  assert.equal(
    await service((tx) => issue(tx, registration, context.actor, first)),
    true,
  );
  console.log(
    "PASS Identidad Auth exacta, expiración, límite de intentos y reemisión tras rechazo definitivo",
  );

  const operations = [randomUUID(), randomUUID()];
  const claims = await Promise.all(
    operations.map((operation) => service((tx) => claim(tx, first, operation))),
  );
  assert.equal(claims.filter(Boolean).length, 1);
  const winner = operations[claims[0] ? 0 : 1];
  assert.deepEqual(claims.find(Boolean), { registration, authUser: identity });
  assert.equal(
    await service((tx) => issue(tx, registration, context.actor, second)),
    false,
  );
  assert.equal(await service((tx) => finish(tx, registration, winner)), false);
  assert.equal(
    await as(identity, (tx) => access(tx, orgA, "attendance")),
    false,
  );
  await db.query(
    "UPDATE auth.users SET raw_app_meta_data=raw_app_meta_data || jsonb_build_object('staff_activation_claim',$2::text) WHERE id=$1",
    [identity, winner],
  );
  assert.equal(
    await service((tx) => finish(tx, registration, randomUUID())),
    false,
  );
  assert.equal(await service((tx) => finish(tx, registration, winner)), true);
  assert.equal(await service((tx) => claim(tx, first)), null);
  assert.equal(await service((tx) => finish(tx, registration, winner)), false);
  const active = await as(authAdminA, (tx) => list(tx, orgA));
  assert.equal(
    active.staff.find((item) => item.id === member.id)?.status,
    "active",
  );
  for (const permission of ["attendance", "schedule"]) {
    assert.equal(
      await as(identity, (tx) => access(tx, orgA, permission), "aal1"),
      false,
    );
    assert.equal(
      await as(identity, (tx) => access(tx, orgA, permission)),
      true,
    );
    assert.equal(
      await as(identity, (tx) => access(tx, orgB, permission)),
      false,
    );
  }
  assert.equal(
    await as(identity, (tx) => access(tx, orgA, "materials")),
    false,
  );
  await assert.rejects(
    as(identity, (tx) => reserve(tx, orgA)),
    denied,
  );
  const audit = await one(
    db,
    "SELECT jsonb_agg(changes) AS result FROM public.audit_events WHERE entity_id=$1",
    [registration],
  );
  assert.ok(audit.length > 0);
  assert.equal(JSON.stringify(audit).includes(first), false);
  console.log(
    "PASS Consumo único, conciliación, auditoría y accesos por módulos tras MFA",
  );
  const cancelledLogin = "u-cancelar@cuentas.sistema-alumnos.invalid";
  const abandoned = await service((tx) =>
    reserve(
      tx,
      orgA,
      "secretary",
      ["students"],
      profileAdminA,
      "aal2",
      cancelledLogin,
    ),
  );
  const cancel = (tx, org, id) =>
    one(tx, "SELECT public.cancel_staff_registration($1,$2) AS result", [
      org,
      id,
    ]);
  await assert.rejects(
    as(authAdminB, (tx) => cancel(tx, orgB, abandoned)),
    denied,
  );
  await assert.rejects(
    as(authAdminA, (tx) => cancel(tx, orgA, abandoned), "aal1"),
    denied,
  );
  await assert.rejects(
    as(authAdminA, (tx) => cancel(tx, orgA, registration)),
    denied,
  );
  const archived = await as(authAdminA, (tx) => cancel(tx, orgA, abandoned));
  const finalList = await as(authAdminA, (tx) => list(tx, orgA));
  assert.equal(
    finalList.staff.find((item) => item.id === archived)?.status,
    "archived",
  );
  assert.equal(
    finalList.staff.find((item) => item.id === archived)?.identifier,
    cancelledLogin,
  );
  assert.equal(
    await service((tx) => issue(tx, abandoned, context.actor, first)),
    false,
  );
  console.log(
    "PASS Cancelación exclusiva del principal y sin reemisión para una cuenta archivada",
  );
  for (let i = 0; i < 7; i++)
    await service((tx) =>
      reserve(
        tx,
        orgA,
        "teacher",
        [],
        profileAdminA,
        "aal2",
        "u-limite" + i + "@cuentas.sistema-alumnos.invalid",
      ),
    );
  const reserveMore = (index) =>
    service((tx) =>
      reserve(
        tx,
        orgA,
        "teacher",
        [],
        profileAdminA,
        "aal2",
        "u-extra" + index + "@cuentas.sistema-alumnos.invalid",
      ),
    );
  const competing = await Promise.allSettled([reserveMore(1), reserveMore(2)]);
  assert.equal(
    competing.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    competing.find((result) => result.status === "rejected").reason.code,
    "54000",
  );
  await db.query(
    "UPDATE private.identity_activation_requests SET created_at=now()-interval '6 minutes' WHERE organization_id=$1 AND staff_registration",
    [orgA],
  );
  assert.ok(await reserveMore(3));
  console.log(
    "PASS Ráfagas de reservas limitadas por organización y recuperación al vencer la ventana",
  );
} finally {
  await db.close();
}
