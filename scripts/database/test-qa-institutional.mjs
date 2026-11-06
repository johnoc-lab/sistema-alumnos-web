const clone = (x) => JSON.parse(JSON.stringify(x));
// Solo pruebas locales aisladas; no carga .env ni SDK remoto.
(async function suite() {
  const assert = (await import("node:assert/strict")).default;
  const { readFile } = await import("node:fs/promises"),
    { randomUUID, createHash } = await import("node:crypto");
  const { createEmbedded, migrate } = await import(
    "../../tests/database/engine.mjs"
  );
  if (process.argv.length !== 2)
    throw Error("Solo entorno embebido, sin destinos");
  const root = new URL("../../", import.meta.url),
    dir = new URL("supabase/qa/v2/", root),
    db = await createEmbedded();
  let passed = 0;
  const q = (s, p = []) => db.query(s, p),
    one = async (s, p = []) => Object.values((await q(s, p)).rows[0])[0];
  async function check(name, fn) {
    await fn();
    passed++;
    console.log("PASS: " + name);
  }
  try {
    await db.exec(
      "ALTER TABLE auth.users ADD COLUMN is_anonymous boolean DEFAULT false; ALTER TABLE auth.users ADD COLUMN banned_until timestamptz; ALTER TABLE auth.users ADD COLUMN deleted_at timestamptz",
    );
    assert.equal((await migrate(db)).length, 5);
    const migration = await readFile(
      new URL("migrations/20261104170000_institutional_activation.sql", dir),
      "utf8",
    );
    const legacyOrg = randomUUID(),
      legacyProfile = randomUUID(),
      legacyMember = randomUUID(),
      legacyRequest = randomUUID();
    await q(
      "INSERT INTO public.organizations(id,slug,name) VALUES($1,'qa-legacy','Legacy')",
      [legacyOrg],
    );
    await q("INSERT INTO public.profiles(id) VALUES($1)", [legacyProfile]);
    await q(
      "INSERT INTO public.organization_memberships(id,organization_id,profile_id) VALUES($1,$2,$3)",
      [legacyMember, legacyOrg, legacyProfile],
    );
    await q(
      "INSERT INTO private.identity_activation_requests(id,organization_id,profile_id,membership_id,proposed_verified_contact,idempotency_key) VALUES($1,$2,$3,$4,'legacy@example.invalid',gen_random_uuid())",
      [legacyRequest, legacyOrg, legacyProfile, legacyMember],
    );
    await db.exec(migration);
    await check(
      "migración conserva fila legacy sin inventar evidencia",
      async () => {
        const x = (
          await q(
            "SELECT verification_kind,proposed_verified_contact,verified_at,login_identifier,status FROM private.identity_activation_requests WHERE id=$1",
            [legacyRequest],
          )
        ).rows[0];
        assert.deepEqual(x, {
          verification_kind: "legacy_unspecified",
          proposed_verified_contact: "legacy@example.invalid",
          verified_at: null,
          login_identifier: null,
          status: "requested",
        });
      },
    );
    const prod = await readFile(new URL("provision.sql", dir), "utf8"),
      post = await readFile(new URL("postcheck.sql", dir), "utf8");
    const productionHash = createHash("sha256").update(prod).digest("hex");
    const manifest = JSON.parse(
        await readFile(new URL("approval.pending.json", dir), "utf8"),
      ),
      p = clone(manifest.envelope.payload);
    const realIds = [
      "6cabd8d2-55d0-401c-b4f6-a20040215134",
      "55d355b9-21d7-46af-8d6d-650a528743eb",
      "db59e5dd-1810-4627-bb45-4c7efc242a8c",
      "9eeeb988-f329-439d-b4b4-0f54cc1318d7",
      "6d8c8f78-1d3b-43b5-8eb0-638e9d0cd8fa",
    ];
    const fakeIds = realIds.map(() => randomUUID()),
      version = await one("SHOW server_version_num");
    function instrument(s, guard = false) {
      for (let i = 0; i < realIds.length; i++) {
        if (guard || i >= 2) assert.ok(s.includes(realIds[i]));
        s = s.replaceAll(realIds[i], fakeIds[i]);
      }
      if (guard) {
        assert.equal(
          s.split("current_setting('server_version_num')::integer <> 170011")
            .length,
          2,
        );
        s = s.replace(
          "current_setting('server_version_num')::integer <> 170011",
          "current_setting('server_version_num')::integer <> " + version,
        );
      }
      return s;
    }
    const sql = instrument(prod, true),
      postSql = instrument(post);
    p.approval_state = "approved";
    p.approval_ref = "LOCAL_SYNTHETIC_APPROVAL";
    p.operator_ref = "LOCAL_TEST";
    p.operation_id = randomUUID();
    p.organization.id = randomUUID();
    for (let i = 0; i < 2; i++) {
      const a = p.people[i];
      a.auth_user_id = fakeIds[i];
      for (const k of [
        "profile_id",
        "membership_id",
        "activation_request_id",
        "idempotency_key",
      ])
        a[k] = randomUUID();
      a.assignment_by_ref = "LOCAL_QA_RESPONSIBLE";
      a.assignment_evidence_ref = "LOCAL_ASSIGNMENT_RECORD";
      a.assignment_verified_at = new Date(Date.now() - 60000).toISOString();
    }
    for (let i = 0; i < 5; i++)
      await q(
        "INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,$2,current_timestamp)",
        [
          fakeIds[i],
          i < 2
            ? p.people[i].login_identifier
            : "old-" + i + "@example.invalid",
        ],
      );
    await db.exec("SET TimeZone='UTC'; SET DateStyle='ISO,YMD'");
    const authBefore = await one(
      "SELECT jsonb_agg(to_jsonb(u) ORDER BY id)::text FROM auth.users u",
    );
    async function digest(x) {
      return one(
        "SELECT encode(sha256(convert_to($1::jsonb::text,'UTF8')),'hex')",
        [JSON.stringify(x)],
      );
    }
    async function snapshot() {
      const a = [];
      for (const t of [
        "auth.users",
        "public.organizations",
        "public.profiles",
        "public.organization_memberships",
        "private.identity_activation_requests",
        "public.audit_events",
      ])
        a.push(
          await one(
            "SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]')::text FROM " +
              t +
              " t",
          ),
        );
      return JSON.stringify(a);
    }
    async function run(x = p, o = {}) {
      await db.exec("BEGIN ISOLATION LEVEL SERIALIZABLE");
      try {
        const h = await digest(x);
        for (const [k, v] of [
          [
            "qa.institutional_manifest",
            JSON.stringify({
              payload: x,
              payload_sha256: o.badHash ? "0".repeat(64) : h,
            }),
          ],
          [
            "qa.cloud_verified_project_ref",
            o.project ?? "rnxgrunnrdlgjsbsrjev",
          ],
          ["qa.cloud_authorized_operation", o.operation ?? x.operation_id],
          ["qa.cloud_authorized_sha256", o.authorization ?? h],
        ])
          await q("SELECT set_config($1,$2,true)", [k, v]);
        await db.exec(o.original ? prod : sql);
        const outcome = await one("SELECT current_setting('qa.outcome')");
        await db.exec("COMMIT");
        return outcome;
      } catch (e) {
        await db.exec("ROLLBACK");
        throw e;
      }
    }
    async function negative(x, o = {}, codes = ["22023", "42501", "23505"]) {
      const before = await snapshot();
      await assert.rejects(run(x, o), (e) => codes.includes(e.code));
      assert.equal(await snapshot(), before);
    }
    await check("seis DDL locales; RLS permanece activa", async () =>
      assert.equal(
        Number(
          await one(
            "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname IN('public','private') AND c.relkind='r' AND c.relrowsecurity",
          ),
        ),
        23,
      ),
    );
    await check("original Cloud rechaza PG18 sin DML", () =>
      negative(p, { original: true }, ["42501"]),
    );
    for (const [name, fn] of [
      ["v1 rechazado", (x) => (x.version = 1)],
      ["scope incompatible", (x) => (x.scope = "cloud_qa")],
      ["aprobación pendiente", (x) => (x.approval_state = "pending")],
      ["responsable ausente", (x) => (x.people[0].assignment_by_ref = null)],
      [
        "evidencia ausente",
        (x) => (x.people[0].assignment_evidence_ref = null),
      ],
      ["fecha ausente", (x) => (x.people[0].assignment_verified_at = null)],
      [
        "verificación futura",
        (x) => (x.people[0].assignment_verified_at = "2999-01-01T00:00:00Z"),
      ],
      [
        "buzón ficticio declarado verificado",
        (x) => (x.people[0].mailbox_status = "verified"),
      ],
      ["roles invertidos", (x) => (x.people[0].role = "student")],
      ["UUID duplicados", (x) => (x.people[0].profile_id = x.organization.id)],
      ["identidad ajena", (x) => (x.people[0].auth_user_id = fakeIds[2])],
      [
        "identificador contradictorio",
        (x) =>
          (x.people[0].login_identifier =
            "u-000003@cuentas.sistema-alumnos.invalid"),
      ],
      [
        "campos v1 inesperados",
        (x) => (x.people[0].verified_contact = "fake@example.invalid"),
      ],
    ])
      await check(name, async () => {
        const x = clone(p);
        fn(x);
        await negative(x);
      });
    await check("destino runtime distinto", () =>
      negative(p, { project: "other" }),
    );
    await check("operación no autorizada", () =>
      negative(p, { operation: randomUUID() }),
    );
    await check("hash envelope incorrecto", () =>
      negative(p, { badHash: true }),
    );
    await check("hash runtime no autorizado", () =>
      negative(p, { authorization: "wrong" }),
    );
    const collision = randomUUID();
    await q(
      "INSERT INTO public.organizations(id,slug,name) VALUES($1,'qa-collision','Local collision')",
      [collision],
    );
    await check("colisión sin adoptar filas", async () => {
      const x = clone(p);
      x.organization.id = collision;
      await negative(x);
    });
    await check("rollback tardío incluye auditoría", async () => {
      await db.exec(
        "CREATE FUNCTION public.test_abort_v2() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='active' THEN RAISE EXCEPTION 'fixture abort' USING ERRCODE='P0001'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_abort_v2 AFTER UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.test_abort_v2()",
      );
      try {
        await negative(p, {}, ["P0001"]);
      } finally {
        await db.exec(
          "DROP TRIGGER test_abort_v2 ON public.organizations; DROP FUNCTION public.test_abort_v2()",
        );
      }
    });
    for (const field of [
      "email_confirmed_at",
      "is_anonymous",
      "banned_until",
    ]) {
      await check("estado Auth inválido: " + field, async () => {
        const before = await snapshot();
        const value =
          field === "email_confirmed_at"
            ? null
            : field === "is_anonymous"
              ? true
              : "2999-01-01T00:00:00Z";
        const original = await one(
          "SELECT " + field + " FROM auth.users WHERE id=$1",
          [fakeIds[0]],
        );
        await q("UPDATE auth.users SET " + field + "=$1 WHERE id=$2", [
          value,
          fakeIds[0],
        ]);
        await negative(p, {}, ["42501"]);
        await q("UPDATE auth.users SET " + field + "=$1 WHERE id=$2", [
          original,
          fakeIds[0],
        ]);
        assert.equal(await snapshot(), before);
      });
    }
    await check("alta institucional completa", async () =>
      assert.equal(await run(), "created"),
    );
    const stable = await snapshot();
    await check(
      "repetición entre transacciones no cambia filas ni auditoría",
      async () => {
        assert.equal(await run(), "already_applied");
        assert.equal(await snapshot(), stable);
      },
    );
    await check(
      "postcheck de solo lectura y evidencia institucional",
      async () => {
        await db.exec(
          "BEGIN READ ONLY; SET LOCAL TimeZone='UTC'; SET LOCAL DateStyle='ISO,YMD'",
        );
        try {
          await q("SELECT set_config('qa.institutional_manifest',$1,true)", [
            JSON.stringify({ payload: p, payload_sha256: await digest(p) }),
          ]);
          const out = (await q(postSql)).rows[0].qa_postcheck;
          for (const [k, v] of Object.entries(out))
            assert.equal(v, k === "is_authentication_test" ? false : true, k);
        } finally {
          await db.exec("ROLLBACK");
        }
        assert.equal(await snapshot(), stable);
      },
    );
    async function rejectWrite(s, args, code) {
      await db.exec("BEGIN");
      try {
        await assert.rejects(
          async () => {
            await q(s, args);
            await db.exec("SET CONSTRAINTS ALL IMMEDIATE");
          },
          (e) => e.code === code,
        );
      } finally {
        await db.exec("ROLLBACK");
      }
    }
    await check("CHECK rechaza evidencia institucional nula", () =>
      rejectWrite(
        "UPDATE private.identity_activation_requests SET verification_evidence_ref=NULL WHERE id=$1",
        [p.people[0].activation_request_id],
        "23514",
      ),
    );
    await check("legacy no permite nueva vinculación verificada", () =>
      rejectWrite(
        "UPDATE private.identity_activation_requests SET verification_kind='legacy_unspecified',login_identifier=NULL,verified_by_ref=NULL,verification_evidence_ref=NULL,proposed_verified_contact='fake@example.invalid' WHERE id=$1",
        [p.people[0].activation_request_id],
        "23514",
      ),
    );
    await check("se conserva protección del último administrador", () =>
      rejectWrite(
        "UPDATE public.organization_memberships SET status='suspended' WHERE id=$1",
        [p.people[0].membership_id],
        "23514",
      ),
    );
    await check("Admin aal1 sigue sin INSERT académico por RLS", async () => {
      await db.exec("BEGIN");
      try {
        await q("SELECT set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({ sub: fakeIds[0], aal: "aal1", is_anonymous: false }),
        ]);
        await db.exec("SET LOCAL ROLE authenticated");
        await assert.rejects(
          q(
            "INSERT INTO public.courses(id,organization_id,slug,title) VALUES($1,$2,'denied','Denied')",
            [randomUUID(), p.organization.id],
          ),
          (e) => e.code === "42501",
        );
      } finally {
        await db.exec("ROLLBACK");
      }
    });
    for (const [label, sub, org] of [
      ["alumno aal2 no obtiene Admin", fakeIds[1], p.organization.id],
      ["Admin aal2 no cruza organización", fakeIds[0], collision],
    ])
      await check(label, async () => {
        await db.exec("BEGIN");
        try {
          await q("SELECT set_config('request.jwt.claims',$1,true)", [
            JSON.stringify({ sub, aal: "aal2", is_anonymous: false }),
          ]);
          await db.exec("SET LOCAL ROLE authenticated");
          await assert.rejects(
            q(
              "INSERT INTO public.courses(id,organization_id,slug,title) VALUES($1,$2,'denied-extra','Denied')",
              [randomUUID(), org],
            ),
            (e) => e.code === "42501",
          );
        } finally {
          await db.exec("ROLLBACK");
        }
      });
    await check("drift posterior no se repara", async () => {
      await q(
        "UPDATE public.organization_memberships SET status='suspended' WHERE id=$1",
        [p.people[1].membership_id],
      );
      await negative(p, {}, ["55000"]);
    });
    await check("identidad anterior vinculada detiene reintento", async () => {
      await q(
        "INSERT INTO public.profiles(auth_user_id,status) VALUES($1,'pending')",
        [fakeIds[2]],
      );
      await negative(p, {}, ["23505"]);
    });
    await check(
      "Auth no se modificó y los UUID reales no se insertaron",
      async () => {
        assert.equal(Number(await one("SELECT count(*) FROM auth.users")), 5);
        assert.equal(
          await one(
            "SELECT jsonb_agg(to_jsonb(u) ORDER BY id)::text FROM auth.users u",
          ),
          authBefore,
        );
        assert.equal(
          Number(
            await one(
              "SELECT count(*) FROM auth.users WHERE id=ANY($1::uuid[])",
              [realIds],
            ),
          ),
          0,
        );
        assert.equal(
          createHash("sha256")
            .update(await readFile(new URL("provision.sql", dir)))
            .digest("hex"),
          productionHash,
        );
      },
    );
    console.log(
      passed +
        "/" +
        passed +
        " comprobaciones; PGlite " +
        (await one("SHOW server_version")),
    );
    console.log(
      "Copia de ensayo: versión y cinco UUID sustituidos en memoria; sin Cloud, seed o Auth real.",
    );
  } catch (e) {
    console.error("FAIL local [" + (e.message ?? e.code ?? "ASSERTION") + "]");
    process.exitCode = 1;
  } finally {
    await db.close();
  }
})();
