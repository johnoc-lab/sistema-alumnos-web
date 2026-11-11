import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createEmbedded, migrate } from "./engine.mjs";
import { ids } from "./fixture-ids.mjs";

const mediaRef = "b64a6d9ddf8c3ff9c1be6a80401490f11765e9f3";
const mediaMigrations = [
  "20261110100000_announcement_media.sql",
  "20261110120000_announcement_uploads.sql",
  "20261110130000_material_links_and_pdf_upload.sql",
];
const name = "20261111120000_staff_permissions.sql";
const roles = await readFile(
  new URL("../../supabase/migrations/" + name, import.meta.url),
  "utf8",
);
const qaOrg = "211f6de1-5f3f-45ac-bbb1-d8363d715d01";
const qaAuth = "6cabd8d2-55d0-401c-b4f6-a20040215134";
const qaProfile = "5c68dac3-31fe-4a70-a823-45fa69f3c058";
const qaMembership = "6e4260d4-b596-4158-8663-91b73a382f7a";
const image = ids.assetA;
const pdf = ids.assetB;
const imagePath = qaOrg + "/" + image + "/image.png";
const pdfPath = qaOrg + "/" + pdf + "/guide.pdf";
const as = (db, user, work, aal = "aal2") =>
  db.transaction(async (tx) => {
    await tx.query("SELECT set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: user, aal, role: "authenticated" }),
    ]);
    await tx.exec("SET LOCAL ROLE authenticated");
    return work(tx);
  });
const first = async (db, query, args = []) =>
  (await db.query(query, args)).rows[0];
const version = async (db, table, id) =>
  (
    await first(
      db,
      "SELECT row_version FROM public." + table + " WHERE id=$1",
      [id],
    )
  ).row_version;
const modify = (db, kind, id, rev, patch, org = qaOrg) =>
  db.query("SELECT public.update_" + kind + "($1,$2,$3,$4::jsonb)", [
    org,
    id,
    rev,
    JSON.stringify(patch),
  ]);
const denied = { code: "42501" };

const db = await createEmbedded();
try {
  assert.equal((await migrate(db, name)).length, 9);
  await db.exec(
    "ALTER TABLE storage.buckets ADD COLUMN file_size_limit bigint, ADD COLUMN allowed_mime_types text[]; ALTER TABLE storage.objects ADD COLUMN metadata jsonb; GRANT INSERT ON storage.objects TO authenticated",
  );
  for (const file of mediaMigrations) {
    await db.exec(
      execFileSync("git", ["show", mediaRef + ":supabase/migrations/" + file], {
        encoding: "utf8",
      }),
    );
  }
  await db.exec(
    "INSERT INTO private.allowed_resource_hosts(host) VALUES('example.test')",
  );
  await db.transaction(async (tx) => {
    await tx.query(
      "INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ($1,'u-000002@cuentas.sistema-alumnos.invalid',now()),($2,'student@example.test',now()),($3,'staff@example.test',now()),($4,'unenrolled@example.test',now()),($5,'outside@example.test',now())",
      [
        qaAuth,
        ids.authStudentA,
        ids.authAdminA2,
        ids.authStudentA2,
        ids.authStudentB,
      ],
    );
    await tx.query(
      "INSERT INTO public.organizations(id,slug,name,status) VALUES($1,'qa-sistema-alumnos-01','QA sintética','active'),($2,'otra-qa','Otra QA','suspended')",
      [qaOrg, ids.orgB],
    );
    await tx.query(
      "INSERT INTO public.profiles(id,auth_user_id,status) VALUES($1,$2,'active'),($3,$4,'active'),($5,$6,'active'),($7,$8,'active'),($9,$10,'active')",
      [
        qaProfile,
        qaAuth,
        ids.profileStudentA,
        ids.authStudentA,
        ids.profileAdminA2,
        ids.authAdminA2,
        ids.profileStudentA2,
        ids.authStudentA2,
        ids.profileStudentB,
        ids.authStudentB,
      ],
    );
    await tx.query(
      "INSERT INTO public.organization_memberships(id,organization_id,profile_id,role,status,first_name) VALUES($1,$2,$3,'admin','active','QA'),($4,$2,$5,'student','active','Alumno'),($6,$2,$7,'admin','active','Delegado'),($8,$2,$9,'student','active','Sin matrícula'),($10,$11,$12,'student','active','Otra organización')",
      [
        qaMembership,
        qaOrg,
        qaProfile,
        ids.memberStudentA,
        ids.profileStudentA,
        ids.memberAdminA2,
        ids.profileAdminA2,
        ids.memberStudentA2,
        ids.profileStudentA2,
        ids.memberStudentB,
        ids.orgB,
        ids.profileStudentB,
      ],
    );
    await tx.query(
      "INSERT INTO public.courses(id,organization_id,slug,title,status) VALUES($1,$2,'taller-qa','Taller QA','published')",
      [ids.courseA, qaOrg],
    );
    await tx.query(
      "INSERT INTO public.enrollments(organization_id,course_id,membership_id,enrolled_at) VALUES($1,$2,$3,now())",
      [qaOrg, ids.courseA, ids.memberStudentA],
    );
    await tx.query(
      "INSERT INTO public.file_assets(id,organization_id,course_id,purpose,bucket_name,object_path,original_name,mime_type,status,size_bytes,sha256) VALUES($1,$2,$3,'announcement_image','course-files',$4,'image.png','image/png','ready',10,repeat('a',64)),($5,$2,$3,'course_material','course-files',$6,'guide.pdf','application/pdf','ready',12,repeat('b',64))",
      [image, qaOrg, ids.courseA, imagePath, pdf, pdfPath],
    );
    await tx.query(
      "INSERT INTO storage.objects(bucket_id,name) VALUES('course-files',$1),('course-files',$2)",
      [imagePath, pdfPath],
    );
    await tx.query(
      "INSERT INTO public.announcements(id,organization_id,course_id,title,body,status,published_at,image_asset_id) VALUES($1,$2,$3,'Aviso','Cuerpo','published',now(),$4)",
      [ids.announcementA, qaOrg, ids.courseA, image],
    );
    await tx.query(
      "INSERT INTO public.materials(id,organization_id,course_id,title,status,recording_url,help_url) VALUES($1,$2,$3,'Material','published','https://example.test/recording','https://example.test/help')",
      [ids.materialA, qaOrg, ids.courseA],
    );
    await tx.query(
      "INSERT INTO public.materials(organization_id,course_id,title,status,file_asset_id) VALUES($1,$2,'PDF','published',$3)",
      [qaOrg, ids.courseA, pdf],
    );
  });
  const mediaSecurity = (tx) =>
    first(
      tx,
      "SELECT (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.policyname) FROM pg_policies p WHERE p.schemaname='storage') AS policies, pg_get_functiondef('public.prepare_announcement_media(uuid,uuid,text,text,text,bigint)'::regprocedure) AS prepare, pg_get_functiondef('public.finalize_announcement_media(uuid,uuid,bigint,text)'::regprocedure) AS finalize",
    );
  const beforeSecurity = await mediaSecurity(db);
  const readContent = async () => ({
    materials: (await db.query("SELECT * FROM public.materials ORDER BY id"))
      .rows,
    announcements: (
      await db.query("SELECT * FROM public.announcements ORDER BY id")
    ).rows,
    files: (await db.query("SELECT * FROM public.file_assets ORDER BY id"))
      .rows,
  });
  const beforeContent = await readContent();
  await db.exec(roles);
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261112120000_staff_registration.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.deepEqual(await mediaSecurity(db), beforeSecurity);
  assert.deepEqual(await readContent(), beforeContent);
  assert.equal(
    (
      await first(
        db,
        "SELECT staff_rank FROM public.organization_memberships WHERE id=$1",
        [qaMembership],
      )
    ).staff_rank,
    "principal",
  );
  console.log(
    "PASS El contenido existente, las políticas Storage y las RPC de carga se conservan",
  );

  const grant = (modules) =>
    db.query(
      "UPDATE public.organization_memberships SET allowed_modules=$1::text[] WHERE id=$2",
      [modules, ids.memberAdminA2],
    );
  const canSee = (user, path, aal) =>
    as(
      db,
      user,
      async (tx) =>
        (
          await tx.query(
            "SELECT name FROM storage.objects WHERE bucket_id='course-files' AND name=$1",
            [path],
          )
        ).rows.length === 1,
      aal,
    );
  await grant(["announcements"]);
  assert(await canSee(ids.authStudentA, imagePath, "aal1"));
  assert(await canSee(ids.authStudentA, pdfPath, "aal1"));
  assert(!(await canSee(ids.authStudentA2, imagePath, "aal1")));
  assert(!(await canSee(ids.authStudentB, imagePath, "aal1")));
  assert(await canSee(ids.authAdminA2, imagePath));
  assert(!(await canSee(ids.authAdminA2, imagePath, "aal1")));
  assert(!(await canSee(ids.authAdminA2, pdfPath)));
  const av = await version(db, "announcements", ids.announcementA);
  await as(db, ids.authAdminA2, (tx) =>
    modify(tx, "announcement", ids.announcementA, av, {
      video_url: "https://example.test/video",
      status: "draft",
    }),
  );
  assert(!(await canSee(ids.authStudentA, imagePath, "aal1")));
  assert.equal(
    (
      await first(
        db,
        "SELECT video_url,image_asset_id FROM public.announcements WHERE id=$1",
        [ids.announcementA],
      )
    ).image_asset_id,
    image,
  );
  await assert.rejects(
    as(db, ids.authAdminA2, (tx) =>
      modify(tx, "announcement", ids.announcementA, av, {}),
    ),
    { code: "40001" },
  );
  await assert.rejects(
    as(db, ids.authAdminA2, (tx) =>
      modify(tx, "announcement", ids.announcementA, av, {}, ids.orgB),
    ),
    denied,
  );
  const mv = await version(db, "materials", ids.materialA);
  await assert.rejects(
    as(db, ids.authAdminA2, (tx) =>
      modify(tx, "material", ids.materialA, mv, {
        class_url: "https://example.test/another",
      }),
    ),
    denied,
  );
  console.log(
    "PASS Adjuntos por matrícula, módulos separados, edición de medios y CAS",
  );

  await grant(["materials"]);
  assert(await canSee(ids.authAdminA2, pdfPath));
  assert(!(await canSee(ids.authAdminA2, imagePath)));
  await as(db, ids.authAdminA2, (tx) =>
    modify(tx, "material", ids.materialA, mv, {
      title: "Editado",
      external_url: "https://example.test/recording",
      file_asset_id: null,
    }),
  );
  const retained = await first(
    db,
    "SELECT external_url,class_url,recording_url,help_url FROM public.materials WHERE id=$1",
    [ids.materialA],
  );
  assert.deepEqual(retained, {
    external_url: null,
    class_url: null,
    recording_url: "https://example.test/recording",
    help_url: "https://example.test/help",
  });
  await as(db, ids.authAdminA2, (tx) =>
    tx.query(
      "INSERT INTO public.materials(organization_id,course_id,title,external_url) VALUES($1,$2,'Alta anterior','https://example.test/old')",
      [qaOrg, ids.courseA],
    ),
  );
  assert.equal(
    (
      await first(
        db,
        "SELECT class_url FROM public.materials WHERE title='Alta anterior'",
      )
    ).class_url,
    "https://example.test/old",
  );
  const version2 = await version(db, "materials", ids.materialA);
  await as(db, ids.authAdminA2, (tx) =>
    modify(tx, "material", ids.materialA, version2, {
      class_url: "https://example.test/class",
      external_url: null,
    }),
  );
  assert.equal(
    (
      await first(db, "SELECT class_url FROM public.materials WHERE id=$1", [
        ids.materialA,
      ])
    ).class_url,
    "https://example.test/class",
  );
  await grant([]);
  assert(!(await canSee(ids.authAdminA2, pdfPath)));
  console.log(
    "PASS Enlaces nuevos, compatibilidad del formulario anterior y revocación en la misma identidad",
  );

  const prepare = (tx) =>
    first(
      tx,
      "SELECT public.prepare_announcement_media($1,$2,'course_material','test.pdf','application/pdf',12) AS file",
      [qaOrg, ids.courseA],
    );
  await assert.rejects(as(db, ids.authAdminA2, prepare), denied);
  await assert.rejects(as(db, qaAuth, prepare, "aal1"), denied);
  const { file } = await as(db, qaAuth, prepare);
  await as(db, qaAuth, async (tx) => {
    await tx.query(
      "INSERT INTO storage.objects(bucket_id,name,metadata) VALUES($1,$2,'{\"size\":12}')",
      [file.bucket, file.path],
    );
    await tx.query(
      "SELECT public.finalize_announcement_media($1,$2,12,repeat('c',64))",
      [qaOrg, file.id],
    );
  });
  assert(await canSee(qaAuth, file.path));
  console.log(
    "PASS Preparación, carga simulada y finalización de PDF por principal aal2",
  );
} catch (error) {
  console.error(error.code ?? "TEST", error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
const partial = await createEmbedded();
try {
  await migrate(partial, name);
  await partial.exec(
    "ALTER TABLE public.announcements ADD COLUMN image_url text",
  );
  await assert.rejects(partial.exec(roles), { code: "23514" });
  await partial.exec("ROLLBACK");
  assert.equal(
    (
      await first(
        partial,
        "SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='organization_memberships' AND column_name='staff_rank'",
      )
    ).n,
    0,
  );
  console.log("PASS Un esquema parcial aborta y conserva el esquema previo");
} finally {
  await partial.close();
}
