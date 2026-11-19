import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createEmbedded, migrateAndSeed } from "./engine.mjs";
import { ids } from "./fixture-ids.mjs";

const db = await createEmbedded();
const a = randomUUID();
const email = "u-alumnoqa@cuentas.sistema-alumnos.invalid";
const authId = randomUUID();
const code = "1".repeat(64);
const proof = "2".repeat(64);
const one = async (conn, query, args) =>
  (await conn.query(query, args)).rows[0]?.result;
const as = (role, sub, aal, action) =>
  db.transaction(async (tx) => {
    await tx.query("SELECT set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub, role, aal }),
    ]);
    await tx.exec("SET LOCAL ROLE " + role);
    return action(tx);
  });
const actor = (id, aal, action) => as("authenticated", id, aal, action);
const service = (action) => as("service_role", null, null, action);
const issue = (
  tx,
  org,
  id = a,
  purpose = "enroll",
  recipient = "padron-qa-1",
) =>
  one(
    tx,
    "SELECT public.issue_student_access($1,$2,$3,$4,'evidence-qa-1',$5,$6) AS result",
    [org, id, purpose, recipient, code, proof],
  );
const claim = (
  tx,
  slug,
  id = a,
  purpose = "enroll",
  suppliedProof = proof,
  identifier = email,
  suppliedCode = code,
) =>
  one(
    tx,
    "SELECT public.claim_student_access($1,$2,$3,$4,$5,$6,'') AS result",
    [id, slug, purpose, suppliedCode, suppliedProof, identifier],
  );
const finalize = (tx, id, attempt) =>
  one(
    tx,
    "SELECT public.finalize_student_access($1,$2,$3,'María','Flores') AS result",
    [id, attempt, authId],
  );
const progress = (tx, id, attempt, stage, auth = authId) =>
  one(
    tx,
    "SELECT public.record_student_access_progress($1,$2,$3,$4) AS result",
    [id, attempt, auth, stage],
  );
const markChanged = (attempt) =>
  db.query(
    "UPDATE auth.users SET raw_app_meta_data=raw_app_meta_data||$2::jsonb WHERE id=$1",
    [authId, JSON.stringify({ student_access_password_attempt: attempt })],
  );
const reissue = (tx, org, id, evidence, nextCode, nextProof) =>
  one(tx, "SELECT public.reissue_student_access($1,$2,$3,$4,$5) AS result", [
    org,
    id,
    evidence,
    nextCode,
    nextProof,
  ]);

try {
  await migrateAndSeed(db);
  // Use the same organization fixtures, with the deployed registration slugs.
  await db.query(
    "UPDATE public.organizations SET slug='impulso-cero' WHERE id=$1",
    [ids.orgA],
  );
  await db.query(
    "UPDATE public.organizations SET slug='incubadora' WHERE id=$1",
    [ids.orgB],
  );
  await assert.rejects(
    actor(ids.authAdminA, "aal1", (tx) => issue(tx, ids.orgA)),
    { code: "42501" },
  );
  await assert.rejects(
    actor(ids.authAdminB, "aal2", (tx) => issue(tx, ids.orgA)),
    { code: "42501" },
  );
  await assert.rejects(
    actor(ids.authStudentA, "aal2", (tx) => issue(tx, ids.orgA)),
    { code: "42501" },
  );
  assert.equal(
    await actor(ids.authAdminA, "aal2", (tx) => issue(tx, ids.orgA)),
    true,
  );
  assert.equal(
    await actor(ids.authAdminA, "aal2", (tx) =>
      issue(tx, ids.orgA, randomUUID()),
    ),
    false,
  );
  await assert.rejects(
    actor(ids.authAdminA, "aal2", (tx) => claim(tx, "impulso-cero")),
    { code: "42501" },
  );
  assert.equal(await service((tx) => claim(tx, "incubadora")), null);
  assert.equal(
    await service((tx) =>
      claim(tx, "impulso-cero", a, "enroll", "3".repeat(64)),
    ),
    null,
  );
  const initial = await service((tx) => claim(tx, "impulso-cero"));
  assert.equal(initial.phase, "create_account");
  assert.equal(initial.identifier, email);
  assert.equal(await service((tx) => claim(tx, "impulso-cero")), null);
  assert.equal(
    await service((tx) => finalize(tx, a, initial.attemptId)),
    false,
  );
  await db.query(
    "INSERT INTO auth.users(id,email,email_confirmed_at,raw_app_meta_data) VALUES($1,$2,now(),$3)",
    [authId, email, JSON.stringify({ student_access_authorization: a })],
  );
  // Provisioning rolled back or never completed after creation in Auth.
  assert.equal(await service((tx) => claim(tx, "impulso-cero")), null);
  const newCode = "5".repeat(64),
    newProof = "6".repeat(64);
  await db.query(
    "UPDATE private.student_access_authorizations SET claimed_at=now()-interval '6 minutes' WHERE id=$1",
    [a],
  );
  await assert.rejects(
    actor(ids.authAdminB, "aal2", (tx) =>
      reissue(tx, ids.orgA, a, "revision-b", newCode, newProof),
    ),
    { code: "42501" },
  );
  assert.equal(
    await actor(ids.authAdminA, "aal2", (tx) =>
      reissue(tx, ids.orgA, a, "evidence-qa-1", newCode, newProof),
    ),
    false,
  );
  assert.equal(
    await actor(ids.authAdminA, "aal2", (tx) =>
      reissue(tx, ids.orgA, a, "nueva-revision", newCode, proof),
    ),
    false,
  );
  assert.equal(
    await actor(ids.authAdminA, "aal2", (tx) =>
      reissue(tx, ids.orgA, a, "nueva-revision", newCode, newProof),
    ),
    true,
  );
  assert.equal(await service((tx) => claim(tx, "impulso-cero")), null);
  assert.equal(
    await service((tx) =>
      claim(tx, "incubadora", a, "enroll", newProof, email, newCode),
    ),
    null,
  );

  const resume = () =>
    service((tx) =>
      claim(tx, "impulso-cero", a, "enroll", newProof, email, newCode),
    );
  const resumed = await Promise.all([resume(), resume()]);
  assert.deepEqual(resumed.map((x) => x.phase).sort(), [
    "password_pending",
    "update_password",
  ]);
  const reconciliation = resumed.find((x) => x.phase === "update_password");
  assert.equal(reconciliation.authUserId, authId);
  assert.notEqual(reconciliation.attemptId, initial.attemptId);
  assert.equal(
    await service((tx) => finalize(tx, a, initial.attemptId)),
    false,
  );
  await markChanged(reconciliation.attemptId);
  assert.equal((await resume()).phase, "revoke_sessions");
  assert.equal(
    await service((tx) => finalize(tx, a, reconciliation.attemptId)),
    false,
  );
  assert.equal(
    await service((tx) =>
      progress(tx, a, reconciliation.attemptId, "sessions_revoked"),
    ),
    true,
  );
  assert.equal(
    await service((tx) => finalize(tx, a, reconciliation.attemptId)),
    true,
  );
  assert.equal(
    await service((tx) => finalize(tx, a, reconciliation.attemptId)),
    true,
  );
  assert.equal(await resume(), null);
  const m = (
    await db.query(
      "SELECT m.role,m.organization_id,m.contact_email FROM public.organization_memberships m JOIN public.profiles p ON p.id=m.profile_id WHERE p.auth_user_id=$1",
      [authId],
    )
  ).rows;
  assert.deepEqual(m, [
    { role: "student", organization_id: ids.orgA, contact_email: null },
  ]);
  const reset = randomUUID();
  assert.equal(
    await actor(ids.authAdminB, "aal2", (tx) =>
      issue(tx, ids.orgB, reset, "recover"),
    ),
    false,
  );
  assert.equal(
    await actor(ids.authAdminA, "aal2", (tx) =>
      issue(tx, ids.orgA, reset, "recover"),
    ),
    true,
  );
  const recover = () =>
    service((tx) => claim(tx, "impulso-cero", reset, "recover"));
  const recovery = await recover();
  assert.equal(recovery.phase, "update_password");
  assert.equal(recovery.authUserId, authId);
  assert.deepEqual(await recover(), { ...recovery, phase: "password_pending" });
  assert.equal(
    await service((tx) =>
      progress(tx, reset, recovery.attemptId, "sessions_revoked"),
    ),
    false,
  );
  await markChanged(recovery.attemptId);
  assert.deepEqual(await recover(), { ...recovery, phase: "revoke_sessions" });
  await db.query(
    "UPDATE private.student_access_authorizations SET claimed_at=now()-interval '6 minutes' WHERE id=$1",
    [reset],
  );
  const resetCode = "a".repeat(64);
  const resetProof = "b".repeat(64);
  assert.equal(
    await actor(ids.authAdminA, "aal2", (tx) =>
      reissue(
        tx,
        ids.orgA,
        reset,
        "verificacion-revocacion",
        resetCode,
        resetProof,
      ),
    ),
    true,
  );
  assert.equal(await recover(), null);
  const resumeRecovery = () =>
    service((tx) =>
      claim(tx, "impulso-cero", reset, "recover", resetProof, "", resetCode),
    );
  assert.deepEqual(await resumeRecovery(), {
    ...recovery,
    phase: "revoke_sessions",
  });
  assert.equal(
    await service((tx) => finalize(tx, reset, recovery.attemptId)),
    false,
  );
  assert.equal(
    await service((tx) =>
      progress(tx, reset, recovery.attemptId, "sessions_revoked", randomUUID()),
    ),
    false,
  );
  assert.equal(
    await service((tx) =>
      progress(tx, reset, recovery.attemptId, "sessions_revoked"),
    ),
    true,
  );
  assert.equal(
    await service((tx) =>
      progress(tx, reset, recovery.attemptId, "sessions_revoked"),
    ),
    true,
  );
  assert.deepEqual(await resumeRecovery(), { ...recovery, phase: "finalize" });
  assert.equal(
    await service((tx) => finalize(tx, reset, recovery.attemptId)),
    true,
  );
  assert.equal(await resumeRecovery(), null);
  const events = await db.query(
    "SELECT changes->>'status' AS stage FROM public.audit_events WHERE entity_id=$1 AND request_id=$2 ORDER BY occurred_at",
    [reset, recovery.attemptId],
  );
  assert.deepEqual(
    events.rows.map((row) => row.stage),
    ["password_changed", "sessions_revoked"],
  );
  const expired = randomUUID();
  assert.equal(
    await actor(ids.authAdminA, "aal2", (tx) =>
      issue(tx, ids.orgA, expired, "enroll", "padron-qa-2"),
    ),
    true,
  );
  await db.query(
    "UPDATE private.student_access_authorizations SET created_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE id=$1",
    [expired],
  );
  assert.equal(await service((tx) => claim(tx, "impulso-cero", expired)), null);
  assert.equal(
    await actor(ids.authAdminA, "aal2", (tx) =>
      one(
        tx,
        "SELECT public.reissue_student_access($1,$2,'new-proof',$3,$4) AS result",
        [ids.orgA, expired, "4".repeat(64), "7".repeat(64)],
      ),
    ),
    true,
  );
  assert.equal(await service((tx) => claim(tx, "impulso-cero", expired)), null);
  const secretary = randomUUID();
  const secretaryProfile = randomUUID();
  await db.query(
    "INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,'secretary-fixture@example.test',now())",
    [secretary],
  );
  await db.query(
    "INSERT INTO public.profiles(id,auth_user_id,status) VALUES($1,$2,'active')",
    [secretaryProfile, secretary],
  );
  await db.query(
    "INSERT INTO public.organization_memberships(organization_id,profile_id,role,status,staff_rank,first_name) VALUES($1,$2,'admin','active','secretary','QA')",
    [ids.orgA, secretaryProfile],
  );
  await assert.rejects(
    actor(secretary, "aal2", (tx) =>
      issue(tx, ids.orgA, randomUUID(), "enroll", "padron-qa-3"),
    ),
    { code: "42501" },
  );
  await db.query(
    "UPDATE public.organization_memberships SET allowed_modules=ARRAY['student_access'] WHERE profile_id=$1",
    [secretaryProfile],
  );

  const limited = randomUUID();
  assert.equal(
    await actor(secretary, "aal2", (tx) =>
      issue(tx, ids.orgA, limited, "enroll", "padron-qa-3"),
    ),
    true,
  );
  for (let i = 0; i < 8; i++) {
    assert.equal(
      await service((tx) =>
        claim(
          tx,
          "impulso-cero",
          limited,
          "enroll",
          "9".repeat(64),
          "u-localtest@cuentas.sistema-alumnos.invalid",
        ),
      ),
      null,
    );
  }
  assert.equal(
    await service((tx) =>
      claim(
        tx,
        "impulso-cero",
        limited,
        "enroll",
        proof,
        "u-localtest@cuentas.sistema-alumnos.invalid",
      ),
    ),
    null,
  );
  await db.query(
    "UPDATE private.staff_activation_limits SET expires_at=now()-interval '1 second'",
  );
  const passes = await Promise.all(
    [0, 1].map(() =>
      service((tx) =>
        claim(
          tx,
          "impulso-cero",
          limited,
          "enroll",
          proof,
          "u-localtest@cuentas.sistema-alumnos.invalid",
        ),
      ),
    ),
  );
  assert.equal(passes.filter(Boolean).length, 1);

  await assert.rejects(
    actor(ids.authAdminA, "aal2", (tx) =>
      one(tx, "SELECT public.list_student_access($1) AS result", [ids.orgB]),
    ),
    { code: "42501" },
  );
  const listed = await actor(secretary, "aal2", (tx) =>
    one(tx, "SELECT public.list_student_access($1) AS result", [ids.orgA]),
  );
  assert.ok(listed.some((row) => row.id === limited));
  assert.ok(
    listed.every(
      (row) =>
        !("code_digest" in row) &&
        !("proof_digest" in row) &&
        !("evidence_ref" in row),
    ),
  );
  console.log(
    "PASS emisión autorizada con aal2, doble prueba, caducidad, reapertura, duplicados, aislamiento y recuperación por UUID.",
  );
} finally {
  await db.close();
}
