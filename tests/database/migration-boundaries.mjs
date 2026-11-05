import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createEmbedded, projectRoot } from "./engine.mjs";
export async function migrationBoundarySuite() {
  const db = await createEmbedded();
  let passed = 0;
  const migrations = (
    await readdir(path.join(projectRoot, "supabase/migrations"))
  )
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const scalar = async (sql) => Object.values((await db.query(sql)).rows[0])[0];
  try {
    // Simula defaults globales amplios. Un REVOKE limitado al schema no los elimina.
    await db.exec(
      "ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon,authenticated;ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon,authenticated",
    );
    const preflight = await readFile(
      path.join(projectRoot, "supabase/checks/cloud-preflight.sql"),
      "utf8",
    );
    const before = await db.exec(preflight);
    assert.equal(
      before.find((result) => result.rows[0]?.preflight).rows[0].preflight
        .private_schema_exists,
      false,
    );
    assert.deepEqual(
      before.find((result) => result.rows[0]?.preflight).rows[0].preflight
        .public_relation_conflicts,
      [],
    );
    console.log("PASS preflight de solo lectura ejecutable antes del esquema");
    passed++;
    // Solo se simula el GUC para comprobar el diagnóstico; no se emula supautils.
    const initial = before.find((result) => result.rows[0]?.preflight).rows[0]
      .preflight;
    assert.equal(initial.storage_policy_target.managed_policy_grant, false);
    await db.query("SELECT set_config('supautils.policy_grants',$1,false)", [
      JSON.stringify({ postgres: ["storage.objects"] }),
    ]);
    const managed = await db.exec(preflight);
    assert.equal(
      managed.find((result) => result.rows[0]?.preflight).rows[0].preflight
        .storage_policy_target.managed_policy_grant,
      true,
    );
    await db.query("SELECT set_config('supautils.policy_grants',$1,false)", [
      JSON.stringify({ postgres: ["storage.buckets"] }),
    ]);
    const denied = await db.exec(preflight);
    assert.equal(
      denied.find((result) => result.rows[0]?.preflight).rows[0].preflight
        .storage_policy_target.managed_policy_grant,
      false,
    );
    await db.query("SELECT set_config('supautils.policy_grants','{}',false)");
    console.log(
      "PASS diagnóstico del permiso administrado específico, independiente de propiedad",
    );
    passed++;
    assert.equal(await scalar("SELECT count(*)::int FROM auth.users"), 0);
    for (const [index, name] of migrations.entries()) {
      const sql = await readFile(
        path.join(projectRoot, "supabase/migrations", name),
        "utf8",
      );
      assert.doesNotMatch(
        sql,
        /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:auth|storage)\./i,
      );
      await db.exec(sql);
      assert.equal(
        await scalar(
          "SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private') AND c.relkind='r' AND NOT c.relrowsecurity",
        ),
        0,
      );
      if (index < 3)
        assert.equal(
          await scalar(
            "SELECT count(*)::int FROM pg_tables WHERE schemaname IN ('public','private') AND (has_table_privilege('anon',format('%I.%I',schemaname,tablename),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_table_privilege('authenticated',format('%I.%I',schemaname,tablename),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))",
          ),
          0,
        );
      console.log("PASS commit protegido: " + name);
      passed++;
    }
    assert.equal(await scalar("SELECT count(*)::int FROM auth.users"), 0);
    assert.equal(await scalar("SELECT count(*)::int FROM storage.buckets"), 0);
    assert.equal(
      await scalar("SELECT count(*)::int FROM public.organizations"),
      0,
    );
    console.log("PASS reconstrucción sin seed, identidades ni buckets");
    passed++;
    await db.exec("BEGIN;SET LOCAL ROLE anon");
    let code;
    try {
      await db.query("SELECT * FROM public.courses");
    } catch (error) {
      code = error.code;
    }
    await db.exec("ROLLBACK");
    assert.equal(code, "42501");
    await db.exec("BEGIN;SET LOCAL ROLE authenticated");
    assert.equal(await scalar("SELECT count(*)::int FROM public.courses"), 0);
    code = undefined;
    try {
      await db.query(
        'SELECT public.update_course(gen_random_uuid(),gen_random_uuid(),1,\'{"title":"test"}\'::jsonb)',
      );
    } catch (error) {
      code = error.code;
    }
    await db.exec("ROLLBACK");
    assert.equal(code, "42501");
    console.log("PASS roles ordinarios sin identidad no leen ni mutan");
    passed++;
    assert.equal(
      await scalar(
        "SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND has_function_privilege('anon',p.oid,'EXECUTE')",
      ),
      0,
    );
    assert.equal(
      await scalar(
        "SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.prosecdef AND NOT ('search_path=\"\"'=ANY(p.proconfig))",
      ),
      0,
    );
    console.log(
      "PASS RPC sin EXECUTE anónimo y definers privados con search_path vacío",
    );
    passed++;
    assert.equal(
      await scalar(
        "SELECT count(*)::int FROM pg_tables WHERE schemaname='private' AND has_table_privilege('authenticated',format('%I.%I',schemaname,tablename),'SELECT,INSERT,UPDATE,DELETE')",
      ),
      0,
    );
    console.log("PASS defaults globales no abren tablas privadas");
    passed++;
    const post = await db.exec(
      await readFile(
        path.join(
          projectRoot,
          "supabase/checks/cloud-postmigration-readonly.sql",
        ),
        "utf8",
      ),
    );
    assert.equal(
      post.find((result) => result.rows[0]?.public_tables !== undefined).rows[0]
        .public_tables,
      14,
    );
    assert.equal(
      post.find(
        (result) => result.rows[0]?.courses_without_identity !== undefined,
      ).rows[0].courses_without_identity,
      0,
    );
    assert.equal(
      post.find(
        (result) => result.rows[0]?.admin_without_identity !== undefined,
      ).rows[0].admin_without_identity,
      false,
    );
    console.log(
      "PASS consulta posterior de solo lectura sin identidad ni datos",
    );
    passed++;
    return passed;
  } finally {
    await db.close();
  }
}
