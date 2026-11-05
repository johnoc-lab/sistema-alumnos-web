import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createEmbedded, migrate } from "./engine.mjs";

const tables = [
  "public.organizations",
  "public.profiles",
  "public.organization_memberships",
  "private.identity_activation_requests",
  "public.audit_events",
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
  "auth.users",
];

// Solo PostgreSQL embebido en memoria: sin URL, CLI, secretos, seed o cliente Auth.
export async function qaProvisionSuite() {
  const db = await createEmbedded();
  const results = [];
  const q = (sql, params = []) => db.query(sql, params);
  const scalar = async (sql, params = []) =>
    Object.values((await q(sql, params)).rows[0])[0];
  const clone = (value) => JSON.parse(JSON.stringify(value));
  let engineVersion;
  try {
    const versions = await migrate(db);
    assert.equal(versions.length, 5);
    engineVersion = await scalar("SELECT current_setting('server_version')");
    const sql = await readFile(
      new URL("../../supabase/qa/provision-qa.sql", import.meta.url),
      "utf8",
    );
    await db.exec(
      "CREATE TEMP TABLE qa_local_validation_scope(scope text NOT NULL); INSERT INTO qa_local_validation_scope VALUES ('local_validation')",
    );

    async function fixture() {
      const person = (role) => ({
        auth_user_id: randomUUID(),
        profile_id: randomUUID(),
        membership_id: randomUUID(),
        activation_request_id: randomUUID(),
        idempotency_key: randomUUID(),
        role,
        display_name: role === "admin" ? "QA Admin" : "QA Student",
        first_name: "QA",
        last_name: role,
        verified_contact: role + "@example.test",
        verified_at: new Date(Date.now() - 60000).toISOString(),
      });
      const payload = {
        version: 1,
        scope: "local_validation",
        approval_state: "local_validation",
        project_ref: "rnxgrunnrdlgjsbsrjev",
        approval_ref: "LOCAL_TEST",
        operator_ref: "LOCAL_OPERATOR",
        operation_id: randomUUID(),
        organization: {
          id: randomUUID(),
          slug: "qa-local-" + randomUUID().slice(0, 8),
          name: "QA Local",
          timezone: "America/Lima",
        },
        people: [person("admin"), person("student")],
      };
      // Anclas UUID de la tabla sustituta de pruebas: no cuentas Supabase Auth.
      for (const p of payload.people)
        await q("INSERT INTO auth.users(id) VALUES($1)", [p.auth_user_id]);
      return payload;
    }
    async function signature() {
      await db.exec("SET TIME ZONE 'UTC'; SET DateStyle='ISO,YMD'");
      const output = {};
      for (const table of tables) {
        output[table] = await scalar(
          "SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb)::text,'UTF8')),'hex') FROM " +
            table +
            " t",
        );
      }
      return JSON.stringify(output);
    }
    async function execute(
      payload,
      {
        hash,
        isolation = "SERIALIZABLE",
        claims,
        envelope,
        timezone,
        dateStyle,
      } = {},
    ) {
      const digest =
        hash ??
        (await scalar(
          "SELECT encode(sha256(convert_to($1::jsonb::text,'UTF8')),'hex')",
          [JSON.stringify(payload)],
        ));
      await db.exec("BEGIN ISOLATION LEVEL " + isolation);
      try {
        await db.exec("SET LOCAL search_path=pg_catalog");
        if (timezone)
          await q("SELECT pg_catalog.set_config('TimeZone',$1,true)", [
            timezone,
          ]);
        if (dateStyle)
          await q("SELECT pg_catalog.set_config('DateStyle',$1,true)", [
            dateStyle,
          ]);
        if (claims)
          await q(
            "SELECT pg_catalog.set_config('request.jwt.claims',$1,true)",
            [JSON.stringify(claims)],
          );
        await q("SELECT pg_catalog.set_config('qa.manifest',$1,true)", [
          JSON.stringify(envelope ?? { payload, payload_sha256: digest }),
        ]);
        await db.exec(sql);
        const outcome = await scalar(
          "SELECT current_setting('qa.outcome',true)",
        );
        await db.exec("COMMIT");
        return outcome;
      } catch (error) {
        await db.exec("ROLLBACK");
        throw error;
      }
    }
    async function rejects(fn, codes) {
      let caught;
      try {
        await fn();
      } catch (error) {
        caught = error;
      }
      assert.ok(caught, "Se esperaba un rechazo");
      assert.ok(
        Array.isArray(codes) && codes.length,
        "Falta SQLSTATE esperado",
      );
      assert.ok(codes.includes(caught.code), "SQLSTATE inesperado");
      return caught;
    }
    async function rejectWithoutChanges(payload, options, code = "22023") {
      const before = await signature();
      await rejects(() => execute(payload, options), [code]);
      assert.equal(await signature(), before);
    }
    async function transactionReject(fn, codes = ["23514"]) {
      const before = await signature();
      await db.exec("BEGIN");
      try {
        await rejects(fn, codes);
      } finally {
        await db.exec("ROLLBACK");
      }
      assert.equal(await signature(), before);
    }
    async function asUser(id, aal, fn) {
      await db.exec("BEGIN READ ONLY");
      try {
        await q("SELECT set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({
            sub: id,
            role: "authenticated",
            aal,
            is_anonymous: false,
          }),
        ]);
        await db.exec("SET LOCAL ROLE authenticated");
        return await fn();
      } finally {
        await db.exec("ROLLBACK");
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
          /* Se conserva la causa mínima. */
        }
        try {
          await db.exec("RESET ROLE");
        } catch {
          /* No se imprime contexto sensible. */
        }
        results.push({
          name,
          passed: false,
          code:
            typeof error.code === "string" ? error.code : "ASSERTION_OR_SETUP",
        });
      }
    }
    async function provisioned() {
      const payload = await fixture();
      assert.equal(await execute(payload), "created");
      return payload;
    }

    async function postcheck(payload, suppliedHash) {
      const postcheckSql = await readFile(
        new URL("../../supabase/qa/postcheck-qa.sql", import.meta.url),
        "utf8",
      );
      const digest =
        suppliedHash ??
        (await scalar(
          "SELECT encode(sha256(convert_to($1::jsonb::text,'UTF8')),'hex')",
          [JSON.stringify(payload)],
        ));
      await db.exec(
        "BEGIN READ ONLY; SET LOCAL TimeZone='UTC'; SET LOCAL DateStyle='ISO,YMD'",
      );
      try {
        await q("SELECT set_config('qa.manifest',$1,true)", [
          JSON.stringify({ payload, payload_sha256: digest }),
        ]);
        return (await q(postcheckSql)).rows[0].qa_postcheck;
      } finally {
        await db.exec("ROLLBACK");
      }
    }

    await test("base vacía de negocio y anclas Auth; cinco migraciones sin seed", async () => {
      assert.equal(
        await scalar("SELECT count(*)::int FROM public.organizations"),
        0,
      );
      assert.equal(
        await scalar("SELECT count(*)::int FROM public.profiles"),
        0,
      );
      assert.equal(await scalar("SELECT count(*)::int FROM auth.users"), 0);
    });
    await test("alta inicial completa con siete filas, marcador y auditoría sin contactos", async () => {
      const p = await provisioned();
      const ids = p.people.map((person) => person.profile_id);
      assert.equal(
        await scalar("SELECT status FROM public.organizations WHERE id=$1", [
          p.organization.id,
        ]),
        "active",
      );
      assert.equal(
        await scalar(
          "SELECT count(*)::int FROM public.profiles WHERE id=ANY($1::uuid[]) AND status='active' AND auth_user_id IS NOT NULL",
          [ids],
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
          "SELECT count(*)::int FROM private.identity_activation_requests WHERE organization_id=$1 AND status='linked' AND verified_at IS NOT NULL AND linked_at IS NOT NULL",
          [p.organization.id],
        ),
        2,
      );
      const event = (
        await q(
          "SELECT id,request_id,entity_type,actor_kind,changes FROM public.audit_events WHERE id=$1",
          [p.operation_id],
        )
      ).rows[0];
      assert.equal(event.request_id, p.operation_id);
      assert.equal(event.entity_type, "qa.provisioning");
      assert.equal(event.actor_kind, "operator");
      assert.ok(event.changes.contract);
      assert.equal(
        JSON.stringify(event.changes).includes("@example.test"),
        false,
      );
      assert.ok(
        (await scalar(
          "SELECT count(*)::int FROM public.audit_events WHERE entity_type IN ('public.profiles','public.organization_memberships','private.identity_activation_requests') AND entity_id=ANY($1::uuid[])",
          [
            [
              ...ids,
              ...p.people.map((x) => x.membership_id),
              ...p.people.map((x) => x.activation_request_id),
            ],
          ],
        )) >= 6,
      );
      assert.equal(await scalar("SELECT count(*)::int FROM public.courses"), 0);
    });
    await test("repetición exacta conserva todas las filas, versiones, fechas y eventos", async () => {
      const p = await provisioned();
      const before = await signature();
      assert.equal(await execute(p), "already_applied");
      assert.equal(await signature(), before);
    });
    await test("repetición desde TimeZone y DateStyle diferentes conserva el lote", async () => {
      const p = await provisioned();
      const before = await signature();
      assert.equal(
        await execute(p, { timezone: "Europe/Madrid", dateStyle: "SQL,DMY" }),
        "already_applied",
      );
      assert.equal(await signature(), before);
    });
    await test("reordenar claves JSON sin cambiar valores conserva el no-op", async () => {
      const p = await provisioned();
      const before = await signature();
      function reorder(value) {
        if (Array.isArray(value)) return value.map(reorder);
        if (value && typeof value === "object")
          return Object.fromEntries(
            Object.entries(value)
              .reverse()
              .map(([key, child]) => [key, reorder(child)]),
          );
        return value;
      }
      assert.equal(await execute(reorder(p)), "already_applied");
      assert.equal(await signature(), before);
    });
    await test("cambio devuelto a su valor original sigue detectándose por versión", async () => {
      const p = await provisioned();
      const person = p.people[1];
      const originalVersion = await scalar(
        "SELECT row_version::int FROM public.profiles WHERE id=$1",
        [person.profile_id],
      );
      await q(
        "UPDATE public.profiles SET display_name='Temporary edit' WHERE id=$1",
        [person.profile_id],
      );
      await q("UPDATE public.profiles SET display_name=$2 WHERE id=$1", [
        person.profile_id,
        person.display_name,
      ]);
      assert.equal(
        await scalar("SELECT display_name FROM public.profiles WHERE id=$1", [
          person.profile_id,
        ]),
        person.display_name,
      );
      assert.ok(
        (await scalar(
          "SELECT row_version::int FROM public.profiles WHERE id=$1",
          [person.profile_id],
        )) > originalVersion,
      );
      await rejectWithoutChanges(p, undefined, "55000");
    });
    await test("plantilla pendiente literal no autoriza ninguna escritura", async () => {
      const template = JSON.parse(
        await readFile(
          new URL("../../supabase/qa/approval.template.json", import.meta.url),
          "utf8",
        ),
      );
      await rejectWithoutChanges(
        template.payload,
        { envelope: template },
        "22023",
      );
    });
    await test("postcheck técnico de lectura confirma el lote sin acreditar Auth real", async () => {
      const p = await provisioned();
      const before = await signature();
      assert.deepEqual(await postcheck(p), {
        manifest_hash_valid: true,
        contract_unchanged: true,
        organization_active: true,
        profiles_active_linked: true,
        memberships_active: true,
        activations_linked: true,
        operation_marker: true,
        rls_tables: true,
        is_authentication_test: false,
      });
      assert.equal(await signature(), before);
    });
    await test("postcheck de lectura detecta huella de envelope incorrecta sin escribir", async () => {
      const p = await provisioned();
      const before = await signature();
      const result = await postcheck(p, "0".repeat(64));
      assert.equal(result.manifest_hash_valid, false);
      assert.equal(result.contract_unchanged, true);
      assert.equal(result.is_authentication_test, false);
      assert.equal(await signature(), before);
    });
    await test("postcheck de lectura detecta fila alterada sin repararla", async () => {
      const p = await provisioned();
      await q(
        "UPDATE public.profiles SET display_name='Postcheck edited' WHERE id=$1",
        [p.people[1].profile_id],
      );
      const before = await signature();
      const result = await postcheck(p);
      assert.equal(result.manifest_hash_valid, true);
      assert.equal(result.contract_unchanged, false);
      assert.equal(result.profiles_active_linked, true);
      assert.equal(result.is_authentication_test, false);
      assert.equal(await signature(), before);
      assert.equal(
        await scalar("SELECT display_name FROM public.profiles WHERE id=$1", [
          p.people[1].profile_id,
        ]),
        "Postcheck edited",
      );
    });
    await test("UUID Auth sin ancla FK se rechaza sin crear identidad", async () => {
      const p = await fixture();
      p.people[1].auth_user_id = randomUUID();
      await rejectWithoutChanges(p, undefined, "23503");
    });
    await test("hash del envelope incorrecto se rechaza sin cambios", async () => {
      await rejectWithoutChanges(await fixture(), { hash: "0".repeat(64) });
    });
    await test("diferencia de manifiesto con operation_id confirmado se rechaza", async () => {
      const p = await provisioned();
      p.people[0].display_name = "Different QA name";
      await rejectWithoutChanges(p, undefined, "55000");
    });
    await test("UUID Auth duplicado se rechaza sin cambios", async () => {
      const p = await fixture();
      p.people[1].auth_user_id = p.people[0].auth_user_id;
      await rejectWithoutChanges(p);
    });
    await test("UUID duplicado entre categorías y clave idempotente repetida se rechazan", async () => {
      const p = await fixture();
      const duplicate = clone(p);
      duplicate.operation_id = duplicate.people[0].profile_id;
      await rejectWithoutChanges(duplicate);
      p.people[1].idempotency_key = p.people[0].idempotency_key;
      await rejectWithoutChanges(p);
    });
    await test("rol ausente o roles invertidos no adoptan defaults", async () => {
      const p = await fixture();
      const missing = clone(p);
      delete missing.people[1].role;
      await rejectWithoutChanges(missing);
      p.people.reverse();
      await rejectWithoutChanges(p);
    });
    await test("scope ajeno, aprobación ajena y UUID nulo se rechazan", async () => {
      const p = await fixture();
      for (const change of [
        { scope: "cloud" },
        { approval_state: "approved" },
        { operation_id: "00000000-0000-0000-0000-000000000000" },
      ]) {
        await rejectWithoutChanges({ ...p, ...change });
      }
    });
    await test("colisión de slug con organización distinta no se adopta", async () => {
      const p = await fixture();
      await q(
        "INSERT INTO public.organizations(id,slug,name) VALUES($1,$2,'Existing QA')",
        [randomUUID(), p.organization.slug],
      );
      await rejectWithoutChanges(p, undefined, "23505");
    });
    await test("colisión de organización ID y perfil parcial no se reparan", async () => {
      const p = await fixture();
      await q(
        "INSERT INTO public.organizations(id,slug,name) VALUES($1,$2,'Existing QA')",
        [p.organization.id, "qa-other-" + randomUUID().slice(0, 8)],
      );
      await rejectWithoutChanges(p, undefined, "23505");
      const partial = await fixture();
      await q("INSERT INTO public.profiles(id) VALUES($1)", [
        partial.people[1].profile_id,
      ]);
      await rejectWithoutChanges(partial, undefined, "23505");
    });
    await test("Auth previamente vinculado a otro perfil se rechaza", async () => {
      const p = await fixture();
      await q("INSERT INTO public.profiles(id,auth_user_id) VALUES($1,$2)", [
        randomUUID(),
        p.people[0].auth_user_id,
      ]);
      await rejectWithoutChanges(p, undefined, "23505");
    });
    await test("clave de activación de otro lote se rechaza", async () => {
      const existing = await provisioned();
      const p = await fixture();
      p.people[1].idempotency_key = existing.people[1].idempotency_key;
      await rejectWithoutChanges(p, undefined, "23505");
    });
    await test("cambio posterior de nombre detectado por snapshot y versión", async () => {
      const p = await provisioned();
      await q(
        "UPDATE public.profiles SET display_name='Edited later' WHERE id=$1",
        [p.people[1].profile_id],
      );
      await rejectWithoutChanges(p, undefined, "55000");
    });
    await test("membresía suspendida no se reactiva mediante reintento", async () => {
      const p = await provisioned();
      await q(
        "UPDATE public.organization_memberships SET status='suspended' WHERE id=$1",
        [p.people[1].membership_id],
      );
      await rejectWithoutChanges(p, undefined, "55000");
    });
    await test("fallo tardío al insertar marcador revierte filas y auditoría", async () => {
      const p = await fixture();
      const before = await signature();
      await db.exec(
        "CREATE FUNCTION pg_temp.qa_reject_marker() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='qa.provisioning' THEN RAISE EXCEPTION 'Local injected failure' USING ERRCODE='P0001'; END IF; RETURN NEW; END $$; CREATE TRIGGER qa_reject_marker BEFORE INSERT ON public.audit_events FOR EACH ROW EXECUTE FUNCTION pg_temp.qa_reject_marker()",
      );
      try {
        await rejects(() => execute(p), ["P0001"]);
        assert.equal(await signature(), before);
      } finally {
        await db.exec(
          "DROP TRIGGER qa_reject_marker ON public.audit_events; DROP FUNCTION pg_temp.qa_reject_marker()",
        );
      }
    });
    await test("organización activa sin Admin falla al validar constraint diferido", async () => {
      await transactionReject(async () => {
        await q(
          "INSERT INTO public.organizations(id,slug,name,status) VALUES($1,$2,'QA invalid','active')",
          [randomUUID(), "qa-invalid-" + randomUUID().slice(0, 8)],
        );
        await db.exec("SET CONSTRAINTS ALL IMMEDIATE");
      });
    });
    await test("nombre vacío al activar membresía causa rechazo CHECK y rollback", async () => {
      const p = await fixture();
      const person = p.people[1];
      await transactionReject(async () => {
        await q(
          "INSERT INTO public.organizations(id,slug,name) VALUES($1,$2,'QA invalid')",
          [p.organization.id, p.organization.slug],
        );
        await q("INSERT INTO public.profiles(id) VALUES($1)", [
          person.profile_id,
        ]);
        await q(
          "INSERT INTO public.organization_memberships(id,organization_id,profile_id,role) VALUES($1,$2,$3,'student')",
          [person.membership_id, p.organization.id, person.profile_id],
        );
        await q(
          "UPDATE public.organization_memberships SET status='active' WHERE id=$1",
          [person.membership_id],
        );
      });
    });
    await test("linked antes de vincular perfil es rechazado inmediatamente", async () => {
      const p = await fixture();
      const person = p.people[1];
      await transactionReject(async () => {
        await q(
          "INSERT INTO public.organizations(id,slug,name) VALUES($1,$2,'QA invalid')",
          [p.organization.id, p.organization.slug],
        );
        await q("INSERT INTO public.profiles(id) VALUES($1)", [
          person.profile_id,
        ]);
        await q(
          "INSERT INTO public.organization_memberships(id,organization_id,profile_id,role) VALUES($1,$2,$3,'student')",
          [person.membership_id, p.organization.id, person.profile_id],
        );
        await q(
          "INSERT INTO private.identity_activation_requests(id,organization_id,profile_id,membership_id,proposed_verified_contact,status,auth_user_id,idempotency_key,verified_at,linked_at) VALUES($1,$2,$3,$4,'qa@example.test','linked',$5,$6,now(),now())",
          [
            person.activation_request_id,
            p.organization.id,
            person.profile_id,
            person.membership_id,
            person.auth_user_id,
            person.idempotency_key,
          ],
        );
      });
    });
    for (const [label, statement] of [
      [
        "suspender",
        "UPDATE public.organization_memberships SET status='suspended' WHERE id=$1",
      ],
      [
        "bloquear perfil",
        "UPDATE public.profiles SET status='blocked' WHERE id=$1",
      ],
      [
        "desvincular Auth",
        "UPDATE public.profiles SET auth_user_id=NULL WHERE id=$1",
      ],
    ]) {
      await test("último Admin: " + label + " falla y revierte", async () => {
        const p = await provisioned();
        await transactionReject(async () => {
          await q(statement, [
            label === "suspender"
              ? p.people[0].membership_id
              : p.people[0].profile_id,
          ]);
          await db.exec("SET CONSTRAINTS ALL IMMEDIATE");
        });
      });
    }
    await test("RLS local: alumno solo ve perfil, membresía y organización propios", async () => {
      const p = await provisioned();
      await asUser(p.people[1].auth_user_id, "aal1", async () => {
        assert.equal(
          await scalar("SELECT count(*)::int FROM public.profiles"),
          1,
        );
        assert.equal(
          await scalar(
            "SELECT count(*)::int FROM public.organization_memberships",
          ),
          1,
        );
        assert.equal(
          await scalar("SELECT count(*)::int FROM public.organizations"),
          1,
        );
        assert.equal(
          await scalar(
            "SELECT count(*)::int FROM public.organization_memberships WHERE id=$1",
            [p.people[0].membership_id],
          ),
          0,
        );
        assert.equal(
          await scalar("SELECT private.org_admin($1)", [p.organization.id]),
          false,
        );
      });
    });
    await test("RLS local: Admin aal1 no adquiere permisos de administración", async () => {
      const p = await provisioned();
      await asUser(p.people[0].auth_user_id, "aal1", async () => {
        assert.equal(
          await scalar("SELECT private.org_admin($1)", [p.organization.id]),
          false,
        );
        assert.equal(
          await scalar(
            "SELECT count(*)::int FROM public.organization_memberships",
          ),
          1,
        );
        assert.equal(
          await scalar(
            "SELECT count(*)::int FROM public.organization_memberships WHERE id=$1",
            [p.people[1].membership_id],
          ),
          0,
        );
      });
    });
    await test("RLS local: Admin aal2 simulado ve membresías QA y solo su perfil", async () => {
      const p = await provisioned();
      await asUser(p.people[0].auth_user_id, "aal2", async () => {
        assert.equal(
          await scalar("SELECT private.org_admin($1)", [p.organization.id]),
          true,
        );
        assert.equal(
          await scalar(
            "SELECT count(*)::int FROM public.organization_memberships",
          ),
          2,
        );
        assert.equal(
          await scalar("SELECT count(*)::int FROM public.profiles"),
          1,
        );
        assert.ok(
          (await scalar(
            "SELECT count(*)::int FROM public.audit_events WHERE organization_id=$1",
            [p.organization.id],
          )) > 0,
        );
      });
    });
    await test("rol anon no puede leer tablas operativas", async () => {
      await transactionReject(async () => {
        await db.exec("SET LOCAL ROLE anon");
        await db.query("SELECT id FROM public.courses");
      }, ["42501"]);
    });
    await test("guarda local: marker ausente, vacío o duplicado impide ejecutar", async () => {
      const p = await fixture();
      await db.exec("DROP TABLE pg_temp.qa_local_validation_scope");
      try {
        await rejectWithoutChanges(p, undefined, "42501");
      } finally {
        await db.exec(
          "CREATE TEMP TABLE qa_local_validation_scope(scope text NOT NULL)",
        );
      }
      try {
        await rejectWithoutChanges(p, undefined, "42501");
      } finally {
        await db.exec(
          "INSERT INTO qa_local_validation_scope VALUES('local_validation'),('local_validation')",
        );
      }
      try {
        await rejectWithoutChanges(p, undefined, "42501");
      } finally {
        await db.exec(
          "TRUNCATE pg_temp.qa_local_validation_scope; INSERT INTO qa_local_validation_scope VALUES('local_validation')",
        );
      }
    });
    await test("aislamiento distinto y auth.uid no nulo impiden aprovisionar", async () => {
      const p = await fixture();
      await rejectWithoutChanges(p, { isolation: "READ COMMITTED" }, "42501");
      await rejectWithoutChanges(
        p,
        {
          claims: { sub: p.people[0].auth_user_id, aal: "aal2" },
        },
        "42501",
      );
    });
    return { results, engineVersion };
  } finally {
    await db.close();
  }
}
