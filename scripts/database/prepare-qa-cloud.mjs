// Solo prepara archivos locales. No cliente PostgreSQL remoto, CLI, .env ni credenciales.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../../", import.meta.url));
const target = "rnxgrunnrdlgjsbsrjev";
const admin = "9eeeb988-f329-439d-b4b4-0f54cc1318d7",
  student = "db59e5dd-1810-4627-bb45-4c7efc242a8c";
const expectedSourceHash =
  "61aa41d059f6f1ef798ea322c654cea6cf15b0d883e57968a4a85fa2faa04ad1";
const sha = (s) => createHash("sha256").update(s).digest("hex");

const fail = (message) => {
  throw Error(message);
};
const record = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const sameKeys = (x, keys) =>
  record(x) && Object.keys(x).sort().join("|") === [...keys].sort().join("|");
const dateValue = (x) =>
  typeof x === "string" && Number.isFinite(Date.parse(x));
const uuid = (x) =>
  typeof x === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x) &&
  x !== "00000000-0000-0000-0000-000000000000";
const email = (x) =>
  typeof x === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
const roles = [
  [admin, "admin"],
  [student, "student"],
];
const requiredTriggers = [
  ...["organizations", "profiles", "organization_memberships"].flatMap(
    (table) =>
      ["stamp_row", "validate_relations", "audit_row"].map((name) => [
        "public",
        table,
        name,
        false,
      ]),
  ),
  ["public", "organizations", "organization_admin_required", true],
  ["public", "profiles", "profiles_lock_org", false],
  ["public", "profiles", "profile_admin_required", true],
  ["public", "organization_memberships", "memberships_lock_org", false],
  ["public", "organization_memberships", "membership_admin_required", true],
  ["public", "audit_events", "audit_immutable", false],
  [
    "private",
    "identity_activation_requests",
    "activation_profile_match",
    false,
  ],
  ["private", "identity_activation_requests", "audit_row", false],
];
function validateSnapshot(state, selection) {
  if (
    !record(selection) ||
    selection.project_ref !== target ||
    !Array.isArray(selection.people) ||
    selection.people.length !== 2
  )
    fail("Adjudicación privada incompleta o contradictoria.");
  for (const [index, [id, role]] of roles.entries()) {
    const p = selection.people[index];
    if (
      !record(p) ||
      p.auth_user_id !== id ||
      p.role !== role ||
      !email(p.account_email)
    )
      fail("Adjudicación privada incompleta o contradictoria.");
  }
  if (
    !record(state) ||
    !dateValue(state.observed_at) ||
    !Array.isArray(state.auth) ||
    state.auth.length !== 2
  )
    fail("Snapshot de solo lectura incompleto o inválido.");
  const users = new Map(state.auth.map((u) => [u?.auth_uuid, u]));
  if (users.size !== 2) fail("Snapshot Auth duplicado o inválido.");
  for (const [index, [id, role]] of roles.entries()) {
    const u = users.get(id);
    if (
      !record(u) ||
      u.qa_role_proposed !== role ||
      u.exists !== true ||
      u.enabled_now !== true ||
      u.is_anonymous !== false ||
      u.deleted_at !== null ||
      !(
        u.banned_until === null ||
        (dateValue(u.banned_until) &&
          Date.parse(u.banned_until) <= Date.parse(state.observed_at))
      ) ||
      !dateValue(u.email_confirmed_at) ||
      Date.parse(u.email_confirmed_at) > Date.parse(state.observed_at) ||
      u.email !== selection.people[index].account_email
    )
      fail("La evidencia Auth no coincide con el lote esperado.");
  }
  for (const key of [
    "profiles",
    "memberships",
    "slug_collisions",
    "activation_collisions",
  ]) {
    if (!Array.isArray(state[key]))
      fail("Snapshot de colisiones incompleto o inválido.");
    if (state[key].length)
      fail("Existe una colisión; no se prepara el manifiesto.");
  }
  for (const key of [
    "organizations",
    "profiles",
    "memberships",
    "activations",
    "audit_events",
  ]) {
    if (
      !record(state.table_counts) ||
      !Number.isSafeInteger(state.table_counts[key]) ||
      state.table_counts[key] !== 0
    )
      fail("Snapshot de recuentos incompleto o inválido.");
  }
  if (
    !Array.isArray(state.relevant_triggers) ||
    state.relevant_triggers.length !== requiredTriggers.length
  )
    fail("Snapshot de triggers incompleto o contradictorio.");
  const triggers = new Map(
    state.relevant_triggers.map((t) => [
      record(t) ? [t.schema, t.table, t.name].join(".") : "",
      t,
    ]),
  );
  if (triggers.size !== requiredTriggers.length)
    fail("Snapshot de triggers duplicado.");
  for (const [schema, table, name, deferred] of requiredTriggers) {
    const t = triggers.get([schema, table, name].join("."));
    if (
      !t ||
      t.enabled !== "O" ||
      t.deferrable !== deferred ||
      t.initially_deferred !== deferred
    )
      fail("No se acreditan los triggers de integridad esperados.");
  }
  // Evidencia guardada, sin exigir una consulta remota reciente al repetir localmente.
  return users;
}
function validatePending(manifest, state, users) {
  if (
    !sameKeys(manifest, ["envelope", "evidence"]) ||
    !sameKeys(manifest.envelope, ["payload", "payload_sha256"])
  )
    fail("Estructura del manifiesto pendiente inválida.");
  const { payload, payload_sha256: hash } = manifest.envelope;
  if (
    !sameKeys(payload, [
      "version",
      "scope",
      "approval_state",
      "project_ref",
      "approval_ref",
      "operator_ref",
      "operation_id",
      "organization",
      "people",
    ]) ||
    payload.version !== 1 ||
    payload.scope !== "cloud_qa" ||
    payload.project_ref !== target ||
    payload.approval_state !== "pending" ||
    payload.approval_ref !== null ||
    payload.operator_ref !== null ||
    hash !== null
  )
    fail(
      "El manifiesto ya no está pendiente o pertenece a otro lote; no se sustituye.",
    );
  const o = payload.organization;
  if (
    !sameKeys(o, ["id", "slug", "name", "timezone"]) ||
    o.slug !== "qa-sistema-alumnos-01" ||
    o.name !== "QA Sistema Alumnos" ||
    o.timezone !== "America/Lima" ||
    !Array.isArray(payload.people) ||
    payload.people.length !== 2
  )
    fail("Organización o perfiles propuestos contradictorios.");
  const ids = [payload.operation_id, o.id];
  for (const [index, [id, role]] of roles.entries()) {
    const p = payload.people[index];
    if (
      !sameKeys(p, [
        "auth_user_id",
        "profile_id",
        "membership_id",
        "activation_request_id",
        "idempotency_key",
        "role",
        "display_name",
        "first_name",
        "last_name",
        "verified_contact",
        "verified_at",
      ]) ||
      p.auth_user_id !== id ||
      p.role !== role ||
      p.verified_contact !== null ||
      p.verified_at !== null ||
      p.display_name !==
        (role === "admin" ? "QA Administrador" : "QA Alumno") ||
      p.first_name !== p.display_name ||
      p.last_name !== ""
    )
      fail(
        "Roles, identidades o verificación del manifiesto pendiente contradictorios.",
      );
    ids.push(
      p.auth_user_id,
      p.profile_id,
      p.membership_id,
      p.activation_request_id,
      p.idempotency_key,
    );
  }
  if (!ids.every(uuid) || new Set(ids).size !== ids.length)
    fail("UUID inválidos o duplicados en el manifiesto.");
  const e = manifest.evidence;
  if (
    !sameKeys(e, [
      "prepared_on",
      "assignment_source",
      "assignment_confirmed",
      "final_write_authorization",
      "remote_observed_at",
      "uuid_stability",
      "identities",
      "pending",
    ]) ||
    !dateValue(e.prepared_on) ||
    !dateValue(e.remote_observed_at) ||
    Date.parse(e.remote_observed_at) > Date.parse(state.observed_at) ||
    e.assignment_source !== "Elección explícita del usuario en Paso 5" ||
    e.assignment_confirmed !== true ||
    e.final_write_authorization !== "pending" ||
    e.uuid_stability !== "Conservar este archivo; no regenerar al repetir." ||
    !Array.isArray(e.identities) ||
    e.identities.length !== 2 ||
    !Array.isArray(e.pending) ||
    e.pending.length !== 5 ||
    !e.pending.every((x) => typeof x === "string" && x.length > 0)
  )
    fail(
      "La evidencia del manifiesto pendiente es incompleta o cambió su aprobación.",
    );
  for (const [index, [id]] of roles.entries()) {
    const i = e.identities[index],
      u = users.get(id);
    if (
      !sameKeys(i, [
        "auth_user_id",
        "account_email_observed",
        "email_confirmed_at",
        "account_enabled_observed",
        "manual_login",
        "mailbox_ownership",
      ]) ||
      i.auth_user_id !== id ||
      i.account_email_observed !== u.email ||
      !dateValue(i.email_confirmed_at) ||
      Date.parse(i.email_confirmed_at) !== Date.parse(u.email_confirmed_at) ||
      i.account_enabled_observed !== true ||
      !sameKeys(i.manual_login, ["status", "independently_observed"]) ||
      i.manual_login.status !== "reported_success_by_user" ||
      i.manual_login.independently_observed !== false ||
      !sameKeys(i.mailbox_ownership, [
        "status",
        "method",
        "evidence_ref",
        "verified_at",
      ]) ||
      i.mailbox_ownership.status !== "pending" ||
      i.mailbox_ownership.method !== null ||
      i.mailbox_ownership.evidence_ref !== null ||
      i.mailbox_ownership.verified_at !== null
    )
      fail(
        "La evidencia por identidad cambió o ya no corresponde a la preparación pendiente.",
      );
  }
}
async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    fail(
      "No se pudo leer un documento JSON local requerido; no se modifica la preparación.",
    );
  }
}

export function buildQaCloudArtifacts(source, localPost) {
  let sql = source;
  if (sha(sql) !== expectedSourceHash)
    throw Error("Cambió el guion local validado. Revisar antes de generar.");
  const localStart = sql.indexOf(
    " IF to_regclass('pg_temp.qa_local_validation_scope')",
  );
  const localEnd = sql.indexOf(
    " IF (SELECT count(*) FROM pg_class",
    localStart,
  );
  if (localStart < 0 || localEnd < 0)
    throw Error("Guardas locales inesperadas.");
  const guard =
    " IF current_setting('server_version_num')::integer <> 170011 OR current_user <> 'postgres' THEN\n  RAISE EXCEPTION 'Se requiere PostgreSQL Cloud 17.11 y operador postgres revisados' USING ERRCODE='42501';\n END IF;\n";
  sql = sql.slice(0, localStart) + guard + sql.slice(localEnd);
  sql = sql.slice(sql.indexOf("DO $qa$"));
  sql =
    "-- PROPUESTA CLOUD: NO AUTORIZADA NI EJECUTADA. No es una migración.\n" +
    "-- Requiere transacción dedicada SERIALIZABLE, manifiesto completo y atestación externa de destino/aprobación.\n" +
    "-- La referencia de un GUC es una comprobación de coherencia, no una prueba criptográfica de la conexión.\n" +
    sql;
  sql = sql.replace(
    "current_setting('qa.manifest',true)",
    "current_setting('qa.cloud_manifest',true)",
  );
  sql = sql.replace(
    "p->>'scope' IS DISTINCT FROM 'local_validation'",
    "p->>'scope' IS DISTINCT FROM 'cloud_qa'",
  );
  sql = sql.replace(
    "p->>'approval_state' IS DISTINCT FROM 'local_validation'",
    "p->>'approval_state' IS DISTINCT FROM 'approved'",
  );
  sql = sql.replace(
    "Aprobación local incompleta o no permitida",
    "Aprobación Cloud incompleta o no permitida",
  );
  sql = sql.replace(
    "Contexto de operador local inválido",
    "Contexto de operador Cloud inválido",
  );
  const boundary = " o:=p->'organization';";
  const approval =
    " IF current_setting('qa.cloud_verified_project_ref',true) IS DISTINCT FROM 'rnxgrunnrdlgjsbsrjev'\n OR current_setting('qa.cloud_authorized_operation',true) IS DISTINCT FROM p->>'operation_id'\n OR current_setting('qa.cloud_authorized_sha256',true) IS DISTINCT FROM actual_hash THEN\n  RAISE EXCEPTION 'Falta atestación externa de destino y autorización exacta' USING ERRCODE='42501';\n END IF;\n IF p#>>'{people,0,auth_user_id}' IS DISTINCT FROM '9eeeb988-f329-439d-b4b4-0f54cc1318d7'\n OR p#>>'{people,1,auth_user_id}' IS DISTINCT FROM 'db59e5dd-1810-4627-bb45-4c7efc242a8c' THEN\n  RAISE EXCEPTION 'UUID y roles no corresponden al lote elegido' USING ERRCODE='22023';\n END IF;\n";
  if (!sql.includes(boundary)) throw Error("Punto de autorización ausente.");
  sql = sql.replace(boundary, () => approval + boundary);
  const authBoundary =
    " SELECT * INTO marker FROM public.audit_events WHERE id=op FOR UPDATE;";
  const authGuard =
    " -- Lecturas mínimas de Auth; no contraseñas, tokens o metadata completa.\n FOR person IN SELECT value FROM jsonb_array_elements(p->'people') LOOP\n  IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=(person->>'auth_user_id')::uuid\n   AND lower(btrim(u.email))=lower(btrim(person->>'verified_contact'))\n   AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous,true)\n   AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=current_timestamp)) THEN\n   RAISE EXCEPTION 'Estado o contacto de cuenta Auth no coincide con lo verificado' USING ERRCODE='42501';\n  END IF;\n END LOOP;\n";
  if (!sql.includes(authBoundary)) throw Error("Punto Auth ausente.");
  sql = sql.replace(authBoundary, () => authGuard + authBoundary);
  const post = localPost
    .replace(
      "current_setting('qa.manifest',true)",
      "current_setting('qa.cloud_manifest',true)",
    )
    .replace(
      "-- qa.manifest debe contener",
      "-- qa.cloud_manifest debe contener",
    );
  return { sql, post };
}

async function validateReservedSnapshot(file) {
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return;
    fail("No se pudo leer la comprobación opcional de UUID reservados.");
  }
  let snapshot;
  try {
    snapshot = JSON.parse(text);
  } catch {
    fail("Comprobación opcional de UUID reservados inválida.");
  }
  if (
    !sameKeys(snapshot, [
      "observed_at",
      "reserved_uuid_count",
      "organizations",
      "profiles",
      "memberships",
      "activations",
      "audit_markers",
    ]) ||
    !dateValue(snapshot.observed_at) ||
    snapshot.reserved_uuid_count !== 12 ||
    ![
      "organizations",
      "profiles",
      "memberships",
      "activations",
      "audit_markers",
    ].every((k) => snapshot[k] === 0)
  )
    fail(
      "Comprobación opcional de UUID reservados incompleta o con colisiones.",
    );
  // La foto carece de IDs/huella: no acredita correspondencia con un manifiesto alterado.
}

export async function prepareQaCloud(workspaceRoot = root) {
  const base = path.join(workspaceRoot, "supabase/qa");
  const privateDir = path.join(workspaceRoot, "exports/qa-cloud");
  const manifestFile = path.join(privateDir, "approval.pending.json");
  const [source, localPost, state, selection] = await Promise.all([
    readFile(path.join(base, "provision-qa.sql"), "utf8"),
    readFile(path.join(base, "postcheck-qa.sql"), "utf8"),
    readJson(path.join(privateDir, "read-only-state.json")),
    readJson(path.join(privateDir, "account-selection.json")),
    validateReservedSnapshot(
      path.join(privateDir, "reserved-collisions-result.json"),
    ),
  ]);
  const { sql, post } = buildQaCloudArtifacts(source, localPost);
  const users = validateSnapshot(state, selection);
  let manifest;
  let existing = false;
  try {
    const text = await readFile(manifestFile, "utf8");
    existing = true;
    try {
      manifest = JSON.parse(text);
    } catch {
      fail("El manifiesto existente no es JSON válido; no se sustituye.");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (!existing) {
    const person = (id, role) => ({
      auth_user_id: id,
      profile_id: randomUUID(),
      membership_id: randomUUID(),
      activation_request_id: randomUUID(),
      idempotency_key: randomUUID(),
      role,
      display_name: role === "admin" ? "QA Administrador" : "QA Alumno",
      first_name: role === "admin" ? "QA Administrador" : "QA Alumno",
      last_name: "",
      verified_contact: null,
      verified_at: null,
    });
    const payload = {
      version: 1,
      scope: "cloud_qa",
      approval_state: "pending",
      project_ref: target,
      approval_ref: null,
      operator_ref: null,
      operation_id: randomUUID(),
      organization: {
        id: randomUUID(),
        slug: "qa-sistema-alumnos-01",
        name: "QA Sistema Alumnos",
        timezone: "America/Lima",
      },
      people: [person(admin, "admin"), person(student, "student")],
    };
    const evidence = {
      prepared_on: "2026-11-04",
      assignment_source: "Elección explícita del usuario en Paso 5",
      assignment_confirmed: true,
      final_write_authorization: "pending",
      remote_observed_at: state.observed_at,
      uuid_stability: "Conservar este archivo; no regenerar al repetir.",
      identities: [admin, student].map((id) => ({
        auth_user_id: id,
        account_email_observed: users.get(id).email,
        email_confirmed_at: users.get(id).email_confirmed_at,
        account_enabled_observed: true,
        manual_login: {
          status: "reported_success_by_user",
          independently_observed: false,
        },
        mailbox_ownership: {
          status: "pending",
          method: null,
          evidence_ref: null,
          verified_at: null,
        },
      })),
      pending: [
        "Titularidad/control del buzón y evidencia adjudicada por UUID",
        "verified_contact y verified_at respaldados",
        "Operador y referencia de autorización final",
        "Huella canónica final tras completar aprobación",
        "Validación nativa PG17 y canal de ejecución revisado",
      ],
    };

    manifest = { envelope: { payload, payload_sha256: null }, evidence };
  }
  validatePending(manifest, state, users);
  // Todas las comprobaciones preceden cualquier escritura.
  // El manifiesto existente conserva exactamente sus bytes, UUID, fechas y evidencia.
  await mkdir(path.join(base, "cloud"), { recursive: true });
  await writeFile(path.join(base, "cloud/provision-qa-cloud.sql"), sql);
  await writeFile(path.join(base, "cloud/postcheck-qa-cloud.sql"), post);
  if (!existing)
    await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + "\n", {
      flag: "wx",
    });
  return { existing, observedAt: state.observed_at };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (process.argv.length !== 2)
      fail("El preparador no acepta conexiones, destinos o argumentos.");
    const { existing, observedAt } = await prepareQaCloud();
    console.log(
      existing
        ? "Manifiesto pendiente conservado: no se regeneran UUID ni evidencia."
        : "Manifiesto pendiente creado con UUID estables; no aprueba escrituras.",
    );
    console.log(
      "Snapshot guardado validado (" +
        observedAt +
        "); no se realizó una nueva consulta remota.",
    );
    console.log(
      "Adaptador y postcheck Cloud preparados localmente. No se ejecutó SQL remoto.",
    );
  } catch (error) {
    console.error(
      error.code
        ? "No se pudieron preparar los archivos locales; revisar permisos y documentos requeridos."
        : error.message,
    );
    process.exitCode = 1;
  }
}
