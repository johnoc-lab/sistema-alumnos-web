// Solo generación local; sin CLI, .env o conexión remota.
(async function prepareV2() {
  const { readFile, writeFile, mkdir } = await import("node:fs/promises");
  const { createHash, randomUUID } = await import("node:crypto");
  const root = new URL("../../", import.meta.url),
    dir = new URL("supabase/qa/v2/", root);
  if (process.argv.length !== 2) throw Error("No acepta destinos");
  let sql = await readFile(
    new URL("supabase/qa/cloud/provision-qa-cloud.sql", root),
    "utf8",
  );
  if (
    createHash("sha256").update(sql).digest("hex") !==
    "6b39aee4311c01c6a92d85317c96ed58d89c4ac0030fc746815c3937a9249faf"
  )
    throw Error("Cambió v1");
  function once(a, b) {
    if (sql.split(a).length !== 2) throw Error("Transformación ambigua: " + a);
    sql = sql.replace(a, () => b);
  }
  once(
    "current_setting('qa.cloud_manifest',true)",
    "current_setting('qa.institutional_manifest',true)",
  );
  once(
    "p->'version' IS DISTINCT FROM '1'::jsonb",
    "p->'version' IS DISTINCT FROM '2'::jsonb",
  );
  once(
    "p->>'scope' IS DISTINCT FROM 'cloud_qa'",
    "p->>'scope' IS DISTINCT FROM 'cloud_qa_institutional'",
  );
  once(
    "9eeeb988-f329-439d-b4b4-0f54cc1318d7",
    "6cabd8d2-55d0-401c-b4f6-a20040215134",
  );
  once(
    "db59e5dd-1810-4627-bb45-4c7efc242a8c",
    "55d355b9-21d7-46af-8d6d-650a528743eb",
  );
  once(
    "'verified_contact','verified_at'",
    "'login_identifier','assignment_verified_at','assignment_by_ref','assignment_evidence_ref','mailbox_status'",
  );
  for (const [a, b] of [
    ["verified_contact", "login_identifier"],
    ["verified_at", "assignment_verified_at"],
  ]) {
    sql = sql
      .replaceAll("person->'" + a + "'", "person->'" + b + "'")
      .replaceAll("person->>'" + a + "'", "person->>'" + b + "'");
  }
  const excluded =
    "'db59e5dd-1810-4627-bb45-4c7efc242a8c'::uuid,'9eeeb988-f329-439d-b4b4-0f54cc1318d7'::uuid,'6d8c8f78-1d3b-43b5-8eb0-638e9d0cd8fa'::uuid";
  once(
    " o:=p->'organization';",
    `
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='private.identity_activation_requests'::regclass AND tgname='institutional_activation_guard' AND tgenabled IN ('O','A'))
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='private.identity_activation_requests'::regclass AND conname='activation_institutional_contract' AND convalidated) THEN
 RAISE EXCEPTION 'Contrato institucional pendiente' USING ERRCODE='42501'; END IF;
 IF p#>>'{people,0,login_identifier}' IS DISTINCT FROM 'u-000002@cuentas.sistema-alumnos.invalid'
 OR p#>>'{people,1,login_identifier}' IS DISTINCT FROM 'u-000001@cuentas.sistema-alumnos.invalid' THEN
 RAISE EXCEPTION 'Identificadores contradictorios' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE auth_user_id IN (${excluded}))
 OR EXISTS(SELECT 1 FROM private.identity_activation_requests WHERE auth_user_id IN (${excluded})) THEN
 RAISE EXCEPTION 'Identidad anterior vinculada' USING ERRCODE='23505'; END IF;
 o:=p->'organization';`,
  );
  once(
    "  IF (person->>'assignment_verified_at')::timestamptz",
    `
  IF person->>'mailbox_status' IS DISTINCT FROM 'not_applicable'
  OR jsonb_typeof(person->'assignment_by_ref') IS DISTINCT FROM 'string'
  OR length(btrim(person->>'assignment_by_ref')) NOT BETWEEN 1 AND 100
  OR jsonb_typeof(person->'assignment_evidence_ref') IS DISTINCT FROM 'string'
  OR length(btrim(person->>'assignment_evidence_ref')) NOT BETWEEN 1 AND 200 THEN
  RAISE EXCEPTION 'Evidencia institucional pendiente' USING ERRCODE='22023'; END IF;
  IF (person->>'assignment_verified_at')::timestamptz`,
  );
  once(
    "proposed_verified_contact,status,auth_user_id,idempotency_key,verified_at)",
    "proposed_verified_contact,status,auth_user_id,idempotency_key,verified_at,verification_kind,login_identifier,verified_by_ref,verification_evidence_ref)",
  );
  once(
    "(person->>'membership_id')::uuid,person->>'login_identifier','verified'",
    "(person->>'membership_id')::uuid,NULL,'verified'",
  );
  once(
    "(person->>'idempotency_key')::uuid,(person->>'assignment_verified_at')::timestamptz);",
    "(person->>'idempotency_key')::uuid,(person->>'assignment_verified_at')::timestamptz,'institutional_assignment',person->>'login_identifier',person->>'assignment_by_ref',person->>'assignment_evidence_ref');",
  );
  let post = (
    await readFile(
      new URL("supabase/qa/cloud/postcheck-qa-cloud.sql", root),
      "utf8",
    )
  ).replaceAll("qa.cloud_manifest", "qa.institutional_manifest");
  post = post.replace(
    "'is_authentication_test',false",
    `
 'institutional_evidence',(SELECT count(*)=2 FROM private.identity_activation_requests a JOIN people q ON a.id=(q.person->>'activation_request_id')::uuid
 WHERE a.verification_kind='institutional_assignment' AND a.proposed_verified_contact IS NULL
 AND a.login_identifier=q.person->>'login_identifier' AND a.verified_by_ref=q.person->>'assignment_by_ref'
 AND a.verification_evidence_ref=q.person->>'assignment_evidence_ref'
 AND a.verified_at=(q.person->>'assignment_verified_at')::timestamptz),
 'old_identities_unlinked',NOT EXISTS(SELECT 1 FROM public.profiles WHERE auth_user_id IN (${excluded}))
 AND NOT EXISTS(SELECT 1 FROM private.identity_activation_requests WHERE auth_user_id IN (${excluded})),
 'is_authentication_test',false`,
  );
  post = post.replace(
    "'institutional_evidence'",
    "'manifest_v2',coalesce((SELECT p->'version'='2'::jsonb AND p->>'scope'='cloud_qa_institutional' AND p->>'approval_state'='approved' FROM expected),false), 'institutional_guard_enabled',EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='private.identity_activation_requests'::regclass AND tgname='institutional_activation_guard' AND tgenabled IN ('O','A')), 'institutional_evidence'",
  );
  await mkdir(dir, { recursive: true });
  let manifest;
  const mp = new URL("approval.pending.json", dir);
  try {
    manifest = JSON.parse(await readFile(mp, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (manifest) {
    const p = manifest.envelope?.payload;
    if (
      p?.version !== 2 ||
      p.scope !== "cloud_qa_institutional" ||
      p.approval_state !== "pending" ||
      p.people?.[0]?.auth_user_id !== "6cabd8d2-55d0-401c-b4f6-a20040215134" ||
      p.people?.[1]?.auth_user_id !== "55d355b9-21d7-46af-8d6d-650a528743eb"
    )
      throw Error("Manifiesto incompatible");
  } else {
    const person = (id, role, n) => ({
      auth_user_id: id,
      profile_id: randomUUID(),
      membership_id: randomUUID(),
      activation_request_id: randomUUID(),
      idempotency_key: randomUUID(),
      role,
      display_name: "QA " + role,
      first_name: "QA",
      last_name: role,
      login_identifier: "u-00000" + n + "@cuentas.sistema-alumnos.invalid",
      assignment_verified_at: null,
      assignment_by_ref: null,
      assignment_evidence_ref: null,
      mailbox_status: "not_applicable",
    });
    manifest = {
      envelope: {
        payload: {
          version: 2,
          scope: "cloud_qa_institutional",
          approval_state: "pending",
          project_ref: "rnxgrunnrdlgjsbsrjev",
          approval_ref: null,
          operator_ref: null,
          operation_id: randomUUID(),
          organization: {
            id: randomUUID(),
            slug: "qa-sistema-alumnos-01",
            name: "QA Sistema Alumnos",
            timezone: "America/Lima",
          },
          people: [
            person("6cabd8d2-55d0-401c-b4f6-a20040215134", "admin", 2),
            person("55d355b9-21d7-46af-8d6d-650a528743eb", "student", 1),
          ],
        },
        payload_sha256: null,
      },
      evidence: {
        manual_logins: "reported_by_user",
        independently_verified: false,
        auth_confirmation_method: "requires_operator_record",
        assignment: "pending",
        mailbox: "not_applicable",
      },
    };
  }
  const p = manifest.envelope.payload;
  if (
    p.project_ref !== "rnxgrunnrdlgjsbsrjev" ||
    p.approval_ref !== null ||
    p.operator_ref !== null ||
    manifest.envelope.payload_sha256 !== null ||
    p.people.length !== 2
  )
    throw Error("Preparación no pendiente");
  const ids = [p.operation_id, p.organization.id];
  for (let i = 0; i < 2; i++) {
    const x = p.people[i];
    if (
      x.role !== ["admin", "student"][i] ||
      x.login_identifier !==
        [
          "u-000002@cuentas.sistema-alumnos.invalid",
          "u-000001@cuentas.sistema-alumnos.invalid",
        ][i] ||
      x.mailbox_status !== "not_applicable" ||
      x.assignment_verified_at !== null ||
      x.assignment_by_ref !== null ||
      x.assignment_evidence_ref !== null
    )
      throw Error("Adjudicación pendiente contradictoria");
    ids.push(
      x.auth_user_id,
      x.profile_id,
      x.membership_id,
      x.activation_request_id,
      x.idempotency_key,
    );
  }
  if (
    new Set(ids).size !== 12 ||
    ids.some(
      (x) =>
        typeof x !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
          x,
        ) ||
        x === "00000000-0000-0000-0000-000000000000",
    )
  )
    throw Error("UUID inválidos");
  await writeFile(
    new URL("provision.sql", dir),
    "-- V2 institucional; no aprobado ni ejecutado en Cloud.\n" + sql,
  );
  await writeFile(new URL("postcheck.sql", dir), post);
  try {
    await writeFile(mp, JSON.stringify(manifest, null, 2) + "\n", {
      flag: "wx",
    });
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  }
  console.log(
    "Preparación v2 local. UUID del manifiesto existente conservados.",
  );
})();
