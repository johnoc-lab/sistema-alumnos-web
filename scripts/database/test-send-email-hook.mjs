// Solo PGlite en memoria. Sin CLI, red, env, Auth, migraciones o seed.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
if (process.argv.length !== 2) throw Error("No admite argumentos ni destinos.");
const db = new PGlite();
let passed = 0;
const expected = {
  error: {
    http_code: 403,
    message: "Email delivery is disabled by institutional policy.",
  },
};
const check = async (name, fn) => {
  await fn();
  passed++;
  console.log("PASS: " + name);
};
const query = (s, p = []) => db.query(s, p);
const scalar = async (s, p = []) =>
  Object.values((await query(s, p)).rows[0])[0];
async function asRole(role, fn) {
  await db.exec("BEGIN");
  try {
    await db.exec("SET LOCAL ROLE " + role);
    return await fn();
  } finally {
    await db.exec("ROLLBACK");
  }
}
try {
  await db.exec(
    "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE ROLE supabase_auth_admin NOLOGIN",
  );
  const sql = await readFile(
    new URL(
      "../../supabase/proposals/send-email-hook-deny.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await db.exec(sql);
  const actions = [
    "signup",
    "invite",
    "magiclink",
    "recovery",
    "email_change",
    "reauthentication",
    "password_changed_notification",
    "email_changed_notification",
    "phone_changed_notification",
    "identity_linked_notification",
    "identity_unlinked_notification",
    "mfa_factor_enrolled_notification",
    "mfa_factor_unenrolled_notification",
    "future_unknown_event",
  ];
  for (const action of actions)
    await check("rechaza " + action, () =>
      asRole("supabase_auth_admin", async () => {
        const value = await scalar(
          "SELECT auth_email_hooks.deny_email($1::jsonb)",
          [
            JSON.stringify({
              user: { email: "synthetic@example.invalid" },
              email_data: {
                email_action_type: action,
                token: "TEST_ONLY_SENTINEL",
                token_hash: "TEST_ONLY_HASH",
                redirect_to: "https://example.invalid/TEST_ONLY_LINK",
              },
            }),
          ],
        );
        assert.deepEqual(value, expected);
        assert.equal(JSON.stringify(value).includes("TEST_ONLY"), false);
      }),
    );
  for (const value of [
    null,
    "null",
    "{}",
    "[]",
    "42",
    '"text"',
    '{"email_data":null}',
  ])
    await check("rechazo constante de entrada " + String(value), () =>
      asRole("supabase_auth_admin", async () =>
        assert.deepEqual(
          await scalar("SELECT auth_email_hooks.deny_email($1::jsonb)", [
            value,
          ]),
          expected,
        ),
      ),
    );
  for (const role of ["anon", "authenticated", "service_role"])
    await check("sin ejecución para " + role, async () => {
      await assert.rejects(
        asRole(role, () =>
          query("SELECT auth_email_hooks.deny_email('{}'::jsonb)"),
        ),
        (e) => e.code === "42501",
      );
      assert.equal(
        await scalar(
          "SELECT has_function_privilege($1,'auth_email_hooks.deny_email(jsonb)','EXECUTE')",
          [role],
        ),
        false,
      );
    });
  await check("Auth solo tiene USAGE y EXECUTE", async () => {
    assert.equal(
      await scalar(
        "SELECT has_schema_privilege('supabase_auth_admin','auth_email_hooks','USAGE')",
      ),
      true,
    );
    assert.equal(
      await scalar(
        "SELECT has_schema_privilege('supabase_auth_admin','auth_email_hooks','CREATE')",
      ),
      false,
    );
  });
  await check(
    "sin SECURITY DEFINER, con contrato y búsqueda fijos",
    async () => {
      const p = (
        await query(
          "SELECT prosecdef,proisstrict,provolatile,proconfig,pg_get_function_result(oid) AS result,proargnames FROM pg_proc WHERE oid='auth_email_hooks.deny_email(jsonb)'::regprocedure",
        )
      ).rows[0];
      assert.equal(p.prosecdef, false);
      assert.equal(p.proisstrict, false);
      assert.equal(p.provolatile, "i");
      assert.equal(p.result, "jsonb");
      assert.deepEqual(p.proargnames, ["event"]);
      assert.ok(p.proconfig.includes("search_path=pg_catalog"));
    },
  );
  await check("JSON inválido no se trata como éxito", () =>
    assert.rejects(
      asRole("supabase_auth_admin", () =>
        query("SELECT auth_email_hooks.deny_email($1::jsonb)", ["{"]),
      ),
      (e) => e.code === "22P02",
    ),
  );
  await check("no crea tablas ni canales de escritura", async () =>
    assert.equal(
      Number(
        await scalar(
          "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='auth_email_hooks'",
        ),
      ),
      0,
    ),
  );
  await check("colisión de esquema aborta; no reemplaza función", async () => {
    await assert.rejects(db.exec(sql), (e) => e.code === "42P06");
    await db.exec("ROLLBACK");
    assert.deepEqual(
      await scalar("SELECT auth_email_hooks.deny_email(NULL)"),
      expected,
    );
  });
  console.log(
    passed +
      "/" +
      passed +
      " comprobaciones PostgreSQL; motor " +
      (await scalar("SHOW server_version")),
  );
  console.log("No prueba HTTP Auth, SMTP, JWT, MFA o Cloud.");
} catch (e) {
  console.error("FAIL local [" + (e.code ?? "ASSERTION") + "]");
  process.exitCode = 1;
} finally {
  await db.close();
}
