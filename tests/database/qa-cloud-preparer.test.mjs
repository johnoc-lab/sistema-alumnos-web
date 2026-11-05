// Pruebas del preparador exclusivamente con archivos temporales sintéticos; sin red.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareQaCloud } from "../../scripts/database/prepare-qa-cloud.mjs";
const repo = fileURLToPath(new URL("../../", import.meta.url));
const target = "rnxgrunnrdlgjsbsrjev";
// Metadatos de selección: nunca usuarios Auth ni anclas PostgreSQL.
const ids = [
  "9eeeb988-f329-439d-b4b4-0f54cc1318d7",
  "db59e5dd-1810-4627-bb45-4c7efc242a8c",
];
const roles = ["admin", "student"];
const source = await readFile(
  path.join(repo, "supabase/qa/provision-qa.sql"),
  "utf8",
);
const localPost = await readFile(
  path.join(repo, "supabase/qa/postcheck-qa.sql"),
  "utf8",
);
const expectedSql = await readFile(
  path.join(repo, "supabase/qa/cloud/provision-qa-cloud.sql"),
  "utf8",
);
const expectedPost = localPost
  .replace(
    "current_setting('qa.manifest',true)",
    "current_setting('qa.cloud_manifest',true)",
  )
  .replace(
    "-- qa.manifest debe contener",
    "-- qa.cloud_manifest debe contener",
  );
const triggerRows = [
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
function inputs() {
  const selection = {
    project_ref: target,
    people: ids.map((auth_user_id, i) => ({
      auth_user_id,
      role: roles[i],
      account_email: roles[i] + "@example.test",
    })),
  };
  const state = {
    observed_at: "2026-11-04T12:00:00Z",
    auth: ids.map((auth_uuid, i) => ({
      auth_uuid,
      qa_role_proposed: roles[i],
      exists: true,
      email: selection.people[i].account_email,
      email_confirmed_at: "2026-11-03T12:00:00Z",
      is_anonymous: false,
      banned_until: null,
      deleted_at: null,
      enabled_now: true,
    })),
    profiles: [],
    memberships: [],
    slug_collisions: [],
    activation_collisions: [],
    table_counts: {
      organizations: 0,
      profiles: 0,
      memberships: 0,
      activations: 0,
      audit_events: 0,
    },
    relevant_triggers: triggerRows.map(([schema, table, name, deferred]) => ({
      schema,
      table,
      name,
      enabled: "O",
      deferrable: deferred,
      initially_deferred: deferred,
    })),
  };
  return { state, selection };
}
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "qa-cloud-preparer-"));
  t.after(async () => {
    const absolute = path.resolve(root),
      parent = path.resolve(tmpdir());
    assert.equal(path.dirname(absolute), parent);
    assert.ok(path.basename(absolute).startsWith("qa-cloud-preparer-"));
    await rm(absolute, { recursive: true, force: true });
  });
  const base = path.join(root, "supabase/qa"),
    dir = path.join(root, "exports/qa-cloud");
  await mkdir(base, { recursive: true });
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(base, "provision-qa.sql"), source);
  await writeFile(path.join(base, "postcheck-qa.sql"), localPost);
  const data = inputs();
  const save = async () => {
    await writeFile(
      path.join(dir, "read-only-state.json"),
      JSON.stringify(data.state),
    );
    await writeFile(
      path.join(dir, "account-selection.json"),
      JSON.stringify(data.selection),
    );
  };
  await save();
  const manifestFile = path.join(dir, "approval.pending.json");
  return { root, base, dir, data, save, manifestFile };
}
async function noOutputs(f) {
  for (const name of [
    "cloud/provision-qa-cloud.sql",
    "cloud/postcheck-qa-cloud.sql",
  ])
    await assert.rejects(access(path.join(f.base, name)));
  await assert.rejects(access(f.manifestFile));
}
async function outputBytes(f) {
  return Promise.all(
    [
      f.manifestFile,
      path.join(f.base, "cloud/provision-qa-cloud.sql"),
      path.join(f.base, "cloud/postcheck-qa-cloud.sql"),
    ].map((name) => readFile(name, "utf8")),
  );
}
test("alta pendiente: SQL idéntico y postcheck solo adapta GUC y comentario", async (t) => {
  const f = await fixture(t);
  const result = await prepareQaCloud(f.root);
  assert.equal(result.existing, false);
  const [bytes, sql, post] = await outputBytes(f);
  assert.equal(sql, expectedSql);
  assert.equal(post, expectedPost);
  const m = JSON.parse(bytes);
  assert.equal(m.envelope.payload.approval_state, "pending");
  assert.equal(m.envelope.payload_sha256, null);
  assert.equal(m.envelope.payload.operator_ref, null);
  for (const p of m.envelope.payload.people) {
    assert.equal(p.verified_contact, null);
    assert.equal(p.verified_at, null);
  }
  assert.equal(
    await readFile(path.join(f.base, "provision-qa.sql"), "utf8"),
    source,
  );
});
test("repetición conserva bytes UUID evidencia y salidas sin regenerar", async (t) => {
  const f = await fixture(t);
  await prepareQaCloud(f.root);
  const before = await outputBytes(f);
  assert.equal((await prepareQaCloud(f.root)).existing, true);
  assert.deepEqual(await outputBytes(f), before);
});
test("snapshot guardado antiguo admitido sin atribuir nueva consulta", async (t) => {
  const f = await fixture(t);
  f.data.state.observed_at = "2020-01-02T12:00:00Z";
  for (const u of f.data.state.auth)
    u.email_confirmed_at = "2020-01-01T12:00:00Z";
  await f.save();
  assert.equal(
    (await prepareQaCloud(f.root)).observedAt,
    f.data.state.observed_at,
  );
});
const invalidSnapshots = [
  [
    "adjudicación contradictoria",
    (d) => (d.selection.people[0].role = "student"),
  ],
  ["UUID Auth duplicado", (d) => (d.state.auth[1].auth_uuid = ids[0])],
  ["buzón distinto", (d) => (d.state.auth[0].email = "different@example.test")],
  ["cuenta anónima", (d) => (d.state.auth[0].is_anonymous = true)],
  [
    "cuenta suspendida",
    (d) => (d.state.auth[0].banned_until = "2027-01-01T00:00:00Z"),
  ],
  ["confirmación ausente", (d) => (d.state.auth[0].email_confirmed_at = null)],
  ["colisión de perfil", (d) => d.state.profiles.push({ id: "synthetic" })],
  ["colisiones incompletas", (d) => delete d.state.slug_collisions],
  ["recuentos malformados", (d) => (d.state.table_counts.audit_events = -1)],
  [
    "recuentos con filas existentes",
    (d) => (d.state.table_counts.profiles = 1),
  ],
  [
    "trigger deshabilitado",
    (d) => (d.state.relevant_triggers[0].enabled = "D"),
  ],
  ["snapshot malformado", (d) => (d.state.observed_at = null)],
];
for (const [name, mutate] of invalidSnapshots)
  for (const existing of [false, true])
    test(
      "rechaza " +
        name +
        (existing ? " al repetir" : " inicialmente") +
        " antes de escribir",
      async (t) => {
        const f = await fixture(t);
        if (existing) await prepareQaCloud(f.root);
        const before = existing ? await outputBytes(f) : null;
        mutate(f.data);
        await f.save();
        await assert.rejects(prepareQaCloud(f.root));
        if (existing) assert.deepEqual(await outputBytes(f), before);
        else await noOutputs(f);
      },
    );
const changedManifests = [
  [
    "approval_state aprobado",
    (m) => (m.envelope.payload.approval_state = "approved"),
  ],
  [
    "operador completado",
    (m) => (m.envelope.payload.operator_ref = "OPERATOR"),
  ],
  ["hash completado", (m) => (m.envelope.payload_sha256 = "a".repeat(64))],
  [
    "contacto completado",
    (m) =>
      (m.envelope.payload.people[0].verified_contact = "admin@example.test"),
  ],
  [
    "fecha de contacto completada",
    (m) => (m.envelope.payload.people[1].verified_at = "2026-11-04T12:00:00Z"),
  ],
  [
    "UUID de perfil repetido",
    (m) =>
      (m.envelope.payload.people[1].profile_id =
        m.envelope.payload.people[0].profile_id),
  ],
  ["estructura extra", (m) => (m.envelope.payload.extra = true)],
  [
    "evidencia de aprobación alterada",
    (m) => (m.evidence.final_write_authorization = "approved"),
  ],
  [
    "titularidad alterada",
    (m) => (m.evidence.identities[0].mailbox_ownership.status = "verified"),
  ],
];
for (const [name, mutate] of changedManifests)
  test("rechaza " + name + " y conserva estado existente", async (t) => {
    const f = await fixture(t);
    await prepareQaCloud(f.root);
    const m = JSON.parse(await readFile(f.manifestFile, "utf8"));
    mutate(m);
    await writeFile(f.manifestFile, JSON.stringify(m));
    const before = await outputBytes(f);
    await assert.rejects(prepareQaCloud(f.root));
    assert.deepEqual(await outputBytes(f), before);
  });
test("JSON existente corrupto no se sustituye ni altera SQL", async (t) => {
  const f = await fixture(t);
  await prepareQaCloud(f.root);
  await writeFile(f.manifestFile, "not JSON");
  const before = await outputBytes(f);
  await assert.rejects(prepareQaCloud(f.root));
  assert.deepEqual(await outputBytes(f), before);
});
test("fuente local alterada bloquea todos los outputs", async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.base, "provision-qa.sql"), source + "\n");
  await assert.rejects(prepareQaCloud(f.root));
  await noOutputs(f);
});

test("snapshot opcional válido no cambia el manifiesto existente", async (t) => {
  const f = await fixture(t);
  await prepareQaCloud(f.root);
  const before = await outputBytes(f);
  await writeFile(
    path.join(f.dir, "reserved-collisions-result.json"),
    JSON.stringify({
      observed_at: "2026-11-04T12:00:01Z",
      reserved_uuid_count: 12,
      organizations: 0,
      profiles: 0,
      memberships: 0,
      activations: 0,
      audit_markers: 0,
    }),
  );
  await prepareQaCloud(f.root);
  assert.deepEqual(await outputBytes(f), before);
});
for (const existing of [false, true])
  test(
    "snapshot opcional con colisiones bloquea " +
      (existing ? "repetición" : "alta"),
    async (t) => {
      const f = await fixture(t);
      if (existing) await prepareQaCloud(f.root);
      const before = existing ? await outputBytes(f) : null;
      await writeFile(
        path.join(f.dir, "reserved-collisions-result.json"),
        JSON.stringify({
          observed_at: "2026-11-04T12:00:01Z",
          reserved_uuid_count: 12,
          organizations: 0,
          profiles: 0,
          memberships: 0,
          activations: 1,
          audit_markers: 0,
        }),
      );
      await assert.rejects(prepareQaCloud(f.root));
      if (existing) assert.deepEqual(await outputBytes(f), before);
      else await noOutputs(f);
    },
  );
