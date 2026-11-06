import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createEmbedded, migrate } from "./engine.mjs";

const productionPins = {
  admin: "9eeeb988-f329-439d-b4b4-0f54cc1318d7",
  student: "db59e5dd-1810-4627-bb45-4c7efc242a8c",
};
const ref = "rnxgrunnrdlgjsbsrjev";
const snapshotTables = [
  "public.organizations",
  "public.profiles",
  "public.organization_memberships",
  "private.identity_activation_requests",
  "public.audit_events",
  "auth.users",
  "public.courses",
  "public.course_modules",
  "public.lessons",
  "public.enrollments",
  "public.announcements",
  "public.materials",
  "public.calendar_events",
  "public.calendar_event_attendees",
  "public.file_assets",
  "public.certificate_issues",
];
const clone = (value) => JSON.parse(JSON.stringify(value));

// Nunca abre sockets, URL de DB, SDK Auth o CLI. Toda SQL opera en PGlite en memoria.
export async function qaCloudAdapterSuite() {
  const db = await createEmbedded();
  const results = [];
  const query = (sql, params = []) => db.query(sql, params);
  const scalar = async (sql, params = []) =>
    Object.values((await query(sql, params)).rows[0])[0];
  let engineVersion, versionNum;
  try {
    // Extiende únicamente el sustituto Auth local; no crea identidades de Supabase.
    await db.exec(
      "ALTER TABLE auth.users ADD COLUMN is_anonymous boolean NOT NULL DEFAULT false; ALTER TABLE auth.users ADD COLUMN banned_until timestamptz; ALTER TABLE auth.users ADD COLUMN deleted_at timestamptz",
    );
    const versions = await migrate(db);
    assert.equal(versions.length, 5);
    engineVersion = await scalar("SELECT current_setting('server_version')");
    versionNum = Number(
      await scalar("SELECT current_setting('server_version_num')"),
    );
    assert.notEqual(
      versionNum,
      170011,
      "Esta instrumentación espera motor embebido distinto de 17.11",
    );
    const sqlPath = new URL(
      "../../supabase/qa/cloud/provision-qa-cloud.sql",
      import.meta.url,
    );
    const productionSql = await readFile(sqlPath, "utf8");
    const postcheckSql = await readFile(
      new URL(
        "../../supabase/qa/cloud/postcheck-qa-cloud.sql",
        import.meta.url,
      ),
      "utf8",
    );

    function replaceOnce(text, before, after) {
      assert.equal(
        text.split(before).length - 1,
        1,
        "La instrumentación debe sustituir exactamente una aparición",
      );
      return text.replace(before, () => after);
    }
    function instrument(payload) {
      let sql = replaceOnce(
        productionSql,
        "current_setting('server_version_num')::integer <> 170011",
        "current_setting('server_version_num')::integer <> " + versionNum,
      );
      sql = replaceOnce(
        sql,
        productionPins.admin,
        payload.people[0].auth_user_id,
      );
      sql = replaceOnce(
        sql,
        productionPins.student,
        payload.people[1].auth_user_id,
      );
      assert.equal(sql.includes(productionPins.admin), false);
      assert.equal(sql.includes(productionPins.student), false);
      return sql;
    }
    async function fixture() {
      const person = (role) => ({
        auth_user_id: randomUUID(),
        profile_id: randomUUID(),
        membership_id: randomUUID(),
        activation_request_id: randomUUID(),
        idempotency_key: randomUUID(),
        role,
        display_name: "QA Local " + role,
        first_name: "QA",
        last_name: role,
        verified_contact: role + "@example.test",
        verified_at: new Date(Date.now() - 60000).toISOString(),
      });
      const p = {
        version: 1,
        scope: "cloud_qa",
        approval_state: "approved",
        project_ref: ref,
        approval_ref: "LOCAL_SYNTHETIC_APPROVAL",
        operator_ref: "LOCAL_OPERATOR",
        operation_id: randomUUID(),
        organization: {
          id: randomUUID(),
          slug: "qa-local-" + randomUUID().slice(0, 8),
          name: "QA Local adapter",
          timezone: "America/Lima",
        },
        people: [person("admin"), person("student")],
      };
      for (const person of p.people) {
        assert.ok(!Object.values(productionPins).includes(person.auth_user_id));
        await query(
          "INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,$2,$3::timestamptz)",
          [person.auth_user_id, person.verified_contact, person.verified_at],
        );
      }
      return p;
    }
    async function digest(payload) {
      return scalar(
        "SELECT encode(sha256(convert_to($1::jsonb::text,'UTF8')),'hex')",
        [JSON.stringify(payload)],
      );
    }
    async function snapshot() {
      await db.exec("SET TimeZone='UTC'; SET DateStyle='ISO,YMD'");
      const output = {};
      for (const table of snapshotTables)
        output[table] = await scalar(
          "SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb)::text,'UTF8')),'hex') FROM " +
            table +
            " t",
        );
      return JSON.stringify(output);
    }
    async function execute(payload, options = {}) {
      const computed = await digest(payload);
      const hash = options.hash ?? computed;
      const sql = options.original
        ? productionSql
        : instrument(options.pinnedPayload ?? payload);
      await db.exec("BEGIN ISOLATION LEVEL SERIALIZABLE");
      try {
        await db.exec("SET LOCAL search_path=pg_catalog");
        for (const [name, value] of [
          [
            "qa.cloud_manifest",
            JSON.stringify({ payload, payload_sha256: hash }),
          ],
          ["qa.cloud_verified_project_ref", options.project ?? ref],
          [
            "qa.cloud_authorized_operation",
            options.operation ?? payload.operation_id,
          ],
          ["qa.cloud_authorized_sha256", options.authorizedHash ?? computed],
        ])
          await query("SELECT set_config($1,$2,true)", [name, value]);
        await db.exec(sql);
        const result = await scalar(
          "SELECT current_setting('qa.outcome',true)",
        );
        await db.exec("COMMIT");
        return result;
      } catch (error) {
        await db.exec("ROLLBACK");
        throw error;
      }
    }
    async function rejectWithoutChanges(payload, codes, options = {}) {
      const before = await snapshot();
      let error;
      try {
        await execute(payload, options);
      } catch (caught) {
        error = caught;
      }
      assert.ok(error, "Se esperaba rechazo");
      assert.ok(codes.includes(error.code), "SQLSTATE inesperado");
      assert.equal(await snapshot(), before);
    }
    async function provisioned() {
      const payload = await fixture();
      assert.equal(await execute(payload), "created");
      return payload;
    }
    async function postcheck(payload) {
      const before = await snapshot();
      await db.exec(
        "BEGIN READ ONLY; SET LOCAL TimeZone='UTC'; SET LOCAL DateStyle='ISO,YMD'",
      );
      try {
        await query("SELECT set_config('qa.cloud_manifest',$1,true)", [
          JSON.stringify({ payload, payload_sha256: await digest(payload) }),
        ]);
        return (await query(postcheckSql)).rows[0].qa_postcheck;
      } finally {
        await db.exec("ROLLBACK");
        assert.equal(await snapshot(), before);
      }
    }
    async function test(name, fn) {
      try {
        await fn();
        results.push({ name, passed: true });
      } catch (error) {
        try {
          await db.exec("ROLLBACK");
        } catch {
          /* Sin contexto sensible. */
        }
        results.push({
          name,
          passed: false,
          code:
            typeof error.code === "string" ? error.code : "ASSERTION_OR_SETUP",
        });
      }
    }

    await test("base desechable vacía y cinco migraciones sin seed", async () => {
      assert.equal(
        await scalar("SELECT count(*)::int FROM public.organizations"),
        0,
      );
      assert.equal(await scalar("SELECT count(*)::int FROM auth.users"), 0);
    });
    await test("JSON canónico y SHA coinciden con constante observada en PostgreSQL 17", async () => {
      const payload = { z: 2, a: [1, { role: "admin" }] };
      assert.equal(
        await scalar("SELECT $1::jsonb::text", [JSON.stringify(payload)]),
        '{"a": [1, {"role": "admin"}], "z": 2}',
      );
      assert.equal(
        await digest(payload),
        "f00fa086ab2ec8554cec660f5f596d98de17f3d142e7ce07c5b6e776e43930a8",
      );
    });
    await test("guion Cloud original rechaza PostgreSQL 18 antes de DML", async () => {
      await rejectWithoutChanges(await fixture(), ["42501"], {
        original: true,
      });
    });
    await test("copia instrumentada crea lote completo y marcador sin datos de contacto", async () => {
      const p = await provisioned();
      assert.equal(
        await scalar("SELECT status FROM public.organizations WHERE id=$1", [
          p.organization.id,
        ]),
        "active",
      );
      assert.equal(
        await scalar(
          "SELECT count(*)::int FROM public.profiles WHERE id=ANY($1::uuid[]) AND status='active'",
          [p.people.map((x) => x.profile_id)],
        ),
        2,
      );
      assert.equal(
        await scalar(
          "SELECT count(*)::int FROM public.organization_memberships WHERE organization_id=$1 AND status='active'",
          [p.organization.id],
        ),
        2,
      );
      assert.equal(
        await scalar(
          "SELECT count(*)::int FROM private.identity_activation_requests WHERE organization_id=$1 AND status='linked'",
          [p.organization.id],
        ),
        2,
      );
      const marker = (
        await query(
          "SELECT request_id,changes FROM public.audit_events WHERE id=$1",
          [p.operation_id],
        )
      ).rows[0];
      assert.equal(marker.request_id, p.operation_id);
      assert.ok(marker.changes.contract);
      assert.equal(
        JSON.stringify(marker.changes).includes("@example.test"),
        false,
      );
      assert.equal(await scalar("SELECT count(*)::int FROM public.courses"), 0);
    });
    await test("repetición instrumentada exacta conserva filas, fechas, versiones y auditoría", async () => {
      const p = await provisioned(),
        before = await snapshot();
      assert.equal(await execute(p), "already_applied");
      assert.equal(await snapshot(), before);
    });
    await test("aprobación pendiente se rechaza sin escribir", async () => {
      const p = await fixture();
      p.approval_state = "pending";
      await rejectWithoutChanges(p, ["22023", "42501"]);
    });
    await test("contacto o fecha de verificación pendientes no se adoptan", async () => {
      const p = await fixture();
      for (const field of ["verified_contact", "verified_at"]) {
        const candidate = clone(p);
        candidate.people[0][field] = null;
        await rejectWithoutChanges(candidate, ["22023", "42501"], {
          pinnedPayload: p,
        });
      }
    });
    await test("referencia de destino runtime contradictoria se rechaza", async () => {
      await rejectWithoutChanges(await fixture(), ["42501"], {
        project: "aaaaaaaaaaaaaaaaaaaa",
      });
    });
    await test("operación runtime distinta se rechaza", async () => {
      await rejectWithoutChanges(await fixture(), ["42501"], {
        operation: randomUUID(),
      });
    });
    await test("huella runtime no autorizada se rechaza", async () => {
      await rejectWithoutChanges(await fixture(), ["42501"], {
        authorizedHash: "0".repeat(64),
      });
    });
    await test("UUID de Admin contradictorio con la adjudicación fijada se rechaza", async () => {
      const p = await fixture(),
        changed = clone(p);
      changed.people[0].auth_user_id = randomUUID();
      await rejectWithoutChanges(changed, ["22023", "42501"], {
        pinnedPayload: p,
      });
    });
    await test("UUID duplicados entre categorías se rechazan", async () => {
      const p = await fixture();
      p.operation_id = p.people[1].profile_id;
      await rejectWithoutChanges(p, ["22023"]);
    });
    await test("huella del envelope incorrecta se rechaza", async () => {
      await rejectWithoutChanges(await fixture(), ["22023", "42501"], {
        hash: "0".repeat(64),
      });
    });
    await test("roles invertidos o ausentes no usan defaults", async () => {
      const p = await fixture(),
        inverted = clone(p),
        absent = clone(p);
      inverted.people.reverse();
      delete absent.people[1].role;
      await rejectWithoutChanges(inverted, ["22023", "42501"], {
        pinnedPayload: p,
      });
      await rejectWithoutChanges(absent, ["22023", "42501"], {
        pinnedPayload: p,
      });
    });
    await test("perfil parcial sin marcador impide el lote", async () => {
      const p = await fixture();
      await query("INSERT INTO public.profiles(id) VALUES($1)", [
        p.people[1].profile_id,
      ]);
      await rejectWithoutChanges(p, ["23505"]);
    });
    await test("slug existente no se adopta", async () => {
      const p = await fixture();
      await query(
        "INSERT INTO public.organizations(id,slug,name) VALUES($1,$2,'Existing QA')",
        [randomUUID(), p.organization.slug],
      );
      await rejectWithoutChanges(p, ["23505"]);
    });
    await test("identidad ya vinculada no se reasigna", async () => {
      const p = await fixture();
      await query(
        "INSERT INTO public.profiles(id,auth_user_id) VALUES($1,$2)",
        [randomUUID(), p.people[0].auth_user_id],
      );
      await rejectWithoutChanges(p, ["23505"]);
    });
    await test("fallo tardío revierte el lote y su auditoría", async () => {
      const p = await fixture();
      await db.exec(
        "CREATE FUNCTION pg_temp.qa_cloud_fail_marker() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='qa.provisioning' THEN RAISE EXCEPTION 'Local failure' USING ERRCODE='P0001'; END IF; RETURN NEW; END $$; CREATE TRIGGER qa_cloud_fail_marker BEFORE INSERT ON public.audit_events FOR EACH ROW EXECUTE FUNCTION pg_temp.qa_cloud_fail_marker()",
      );
      try {
        await rejectWithoutChanges(p, ["P0001"]);
      } finally {
        await db.exec(
          "DROP TRIGGER qa_cloud_fail_marker ON public.audit_events; DROP FUNCTION pg_temp.qa_cloud_fail_marker()",
        );
      }
    });
    await test("datos suspendidos después del alta se conservan ante reintento", async () => {
      const p = await provisioned();
      await query(
        "UPDATE public.organization_memberships SET status='suspended' WHERE id=$1",
        [p.people[1].membership_id],
      );
      await rejectWithoutChanges(p, ["55000"]);
    });
    await test("postcheck Cloud de solo lectura confirma la copia instrumentada", async () => {
      const result = await postcheck(await provisioned());
      assert.equal(result.is_authentication_test, false);
      for (const [key, value] of Object.entries(result))
        if (key !== "is_authentication_test")
          assert.equal(value, true, "Comprobación pendiente: " + key);
    });
    await test("estados Auth sustitutos no válidos bloquean la adjudicación", async () => {
      for (const patch of [
        "email_confirmed_at=NULL",
        "is_anonymous=true",
        "banned_until=now()+interval '1 hour'",
        "deleted_at=now()",
        "email='other@example.test'",
      ]) {
        const p = await fixture();
        await query("UPDATE auth.users SET " + patch + " WHERE id=$1", [
          p.people[0].auth_user_id,
        ]);
        await rejectWithoutChanges(p, ["42501"]);
      }
    });
    await test("instrumentación no cambia el archivo Cloud ni inserta los UUID reales", async () => {
      assert.equal(await readFile(sqlPath, "utf8"), productionSql);
      assert.equal(
        await scalar(
          "SELECT count(*)::int FROM auth.users WHERE id=ANY($1::uuid[])",
          [Object.values(productionPins)],
        ),
        0,
      );
    });
    return {
      results,
      engineVersion,
      originalTargetVersion: "17.11",
      instrumentationReplacements: 3,
    };
  } finally {
    await db.close();
  }
}
