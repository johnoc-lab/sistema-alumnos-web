import assert from "node:assert/strict";
import { createEmbedded, migrateAndSeed } from "./engine.mjs";
import { ids } from "./fixture-ids.mjs";

const db = await createEmbedded();
const {
  orgA,
  orgB,
  courseA,
  authAdminA,
  authAdminA2,
  authStudentA,
  authStudentA2,
  authAdminB,
  profileAdminB,
  memberAdminA2,
  memberStudentA,
  enrollmentA,
  enrollmentB,
} = ids;
const otherEnrollment = "00000000-0000-4000-8000-000000000599";
const denied = { code: "42501" };
const as = (sub, query, args = [], aal = "aal2", role = "authenticated") =>
  db.transaction(async (tx) => {
    await tx.query("SELECT set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub, aal, role }),
    ]);
    await tx.exec("SET LOCAL ROLE " + role);
    return (await tx.query(query, args)).rows;
  });
const recommend = (actor, org, enrollment, aal) =>
  as(
    actor,
    "SELECT public.recommend_certificate($1,$2) AS id",
    [org, enrollment],
    aal,
  ).then(([row]) => row.id);
const decide = (actor, org, recommendation, approve, aal) =>
  as(
    actor,
    "SELECT public.decide_certificate($1,$2,$3)",
    [org, recommendation, approve],
    aal,
  );
const read = (actor, aal = "aal1") =>
  as(
    actor,
    "SELECT enrollment_id,status,snapshot FROM public.certificate_issues ORDER BY id",
    [],
    aal,
  );

try {
  await migrateAndSeed(db);
  // Esta prueba parte sin el certificado ya emitido del seed compartido.
  await db.query(
    "DELETE FROM public.certificate_issues WHERE organization_id=$1 AND serial='DEMO-0001'",
    [orgA],
  );
  await db.query(
    "INSERT INTO public.organization_memberships(organization_id,profile_id,role,status,staff_rank,allowed_modules,first_name) VALUES($1,$2,'admin','active','administrator',ARRAY['certificates','certificates.approve'],'Admin')",
    [orgA, profileAdminB],
  );
  await db.query(
    "UPDATE public.organization_memberships SET staff_rank='teacher', allowed_modules=ARRAY['certificates','certificates.recommend'] WHERE id=$1",
    [memberAdminA2],
  );
  await db.query(
    "UPDATE public.organization_memberships SET first_name='María',last_name='Muñoz' WHERE id=$1",
    [memberStudentA],
  );
  await db.query(
    "INSERT INTO public.enrollments(id,organization_id,course_id,membership_id,enrolled_at) VALUES($1,$2,$3,$4,now())",
    [otherEnrollment, orgA, courseA, ids.memberStudentA2],
  );

  await assert.rejects(
    recommend(authAdminA2, orgA, enrollmentA, "aal1"),
    denied,
  );
  await assert.rejects(recommend(authAdminA2, orgA, enrollmentB), denied);
  await assert.rejects(recommend(authAdminA2, orgB, enrollmentB), denied);
  await assert.rejects(recommend(authStudentA, orgA, enrollmentA), denied);
  await assert.rejects(recommend(authAdminA, orgA, enrollmentA), denied);
  await assert.rejects(
    as(
      null,
      "SELECT public.certificate_staff_context($1,$2)",
      [orgA, courseA],
      "aal1",
      "anon",
    ),
    denied,
  );
  await assert.rejects(
    as(authAdminA2, "SELECT * FROM private.certificate_recommendations"),
    denied,
  );

  const [{ data: teacher }] = await as(
    authAdminA2,
    "SELECT public.certificate_staff_context($1,$2) AS data",
    [orgA, courseA],
  );
  assert.ok(teacher.students.some((row) => row.name === "María Muñoz"));
  assert.deepEqual(teacher.pending, []);
  const approved = await recommend(authAdminA2, orgA, enrollmentA);
  const rejected = await recommend(authAdminA2, orgA, otherEnrollment);
  await assert.rejects(recommend(authAdminA2, orgA, enrollmentA), {
    code: "23505",
  });
  const [{ data: reviewer }] = await as(
    authAdminA,
    "SELECT public.certificate_staff_context($1,$2) AS data",
    [orgA, ""],
  );
  assert.equal(reviewer.pending.length, 2);
  assert.deepEqual(await read(authStudentA), []);

  await assert.rejects(decide(authAdminA2, orgA, approved, true), denied);
  await assert.rejects(
    decide(authAdminA, orgA, approved, true, "aal1"),
    denied,
  );
  await assert.rejects(decide(authAdminA, orgB, approved, true), denied);

  // La guarda histórica sigue bloqueando una emisión directa sin decisión.
  const insert =
    'INSERT INTO public.certificate_issues(organization_id,enrollment_id,course_id,membership_id,serial,issued_at,status,snapshot) VALUES($1,$2,$3,$4,\'directo\',now(),\'issued\',\'{"template_version":"demo-1","participant":"Prueba","course":"Taller"}\')';
  await assert.rejects(
    as(authAdminA, insert, [orgA, enrollmentA, courseA, memberStudentA]),
    denied,
  );
  await db.query("UPDATE public.enrollments SET status='paused' WHERE id=$1", [
    enrollmentA,
  ]);
  await assert.rejects(decide(authAdminA, orgA, approved, true), {
    code: "22023",
  });
  assert.deepEqual(await read(authStudentA), []);
  await db.query("UPDATE public.enrollments SET status='active' WHERE id=$1", [
    enrollmentA,
  ]);
  // Fuerza un error en la emisión después de registrar la decisión.
  await db.exec(
    "ALTER TABLE public.certificate_issues ADD CONSTRAINT test_issue_failure CHECK (status<>'issued')",
  );
  await assert.rejects(decide(authAdminB, orgA, approved, true), {
    code: "23514",
  });
  const afterFailure = await db.query(
    "SELECT status,certificate_id FROM private.certificate_recommendations WHERE id=$1",
    [approved],
  );
  assert.deepEqual(afterFailure.rows, [
    { status: "pending", certificate_id: null },
  ]);
  await db.exec(
    "ALTER TABLE public.certificate_issues DROP CONSTRAINT test_issue_failure",
  );
  await decide(authAdminB, orgA, approved, true);
  await decide(authAdminA, orgA, rejected, false);
  await assert.rejects(decide(authAdminA, orgA, rejected, true), {
    code: "22023",
  });
  await assert.rejects(decide(authAdminA, orgA, approved, true), {
    code: "22023",
  });
  const [issued] = await read(authStudentA);
  assert.equal(issued.status, "issued");
  assert.equal(issued.snapshot.participant, "María Muñoz");
  assert.deepEqual(await read(authStudentA2), []);
  assert.deepEqual(await read(ids.authStudentB), []);
  const { rows } = await db.query(
    "SELECT status,certificate_id FROM private.certificate_recommendations ORDER BY status",
  );
  assert.equal(rows[0].status, "approved");
  assert.ok(rows[0].certificate_id);
  assert.deepEqual(rows[1], { status: "rejected", certificate_id: null });
  console.log(
    "PASS Recomendación sin duplicados, aprobación atómica, rechazo, MFA y lectura propia",
  );
} finally {
  await db.close();
}
