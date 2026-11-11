import assert from "node:assert/strict";
import { ids } from "./fixture-ids.mjs";
export async function securitySuite(db) {
  const results = [];
  const q = (sql, params = []) => db.query(sql, params);
  const scalar = async (sql, params = []) =>
    Object.values((await q(sql, params)).rows[0])[0];
  async function actor(authId, aal = "aal1", extra = {}) {
    await db.exec("RESET ROLE");
    await q("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: authId, role: "authenticated", aal, ...extra }),
    ]);
    await db.exec("SET LOCAL ROLE authenticated");
  }
  async function owner() {
    await db.exec("RESET ROLE");
    await q("select set_config('request.jwt.claims','{}',true)");
  }
  async function errorCode(operation, code) {
    await db.exec("SAVEPOINT expected_error");
    let caught;
    try {
      await operation();
    } catch (error) {
      caught = error;
    }
    await db.exec(
      "ROLLBACK TO SAVEPOINT expected_error; RELEASE SAVEPOINT expected_error",
    );
    assert.equal(
      caught?.code,
      code,
      caught?.message ?? "La operación no fue rechazada",
    );
  }
  async function test(name, fn) {
    await db.exec("BEGIN");
    try {
      await fn();
      results.push({ name, passed: true });
    } catch (error) {
      results.push({ name, passed: false, error: error.message });
    } finally {
      await db.exec("ROLLBACK");
    }
  }
  const count = (table) => scalar("select count(*)::int from public." + table);
  const version = async (table) =>
    scalar("select row_version::int from public." + table + " where id=$1", [
      table === "courses" ? ids.courseA : ids.eventA,
    ]);
  const updateCourse = (org, id, rev, patch) =>
    q("select public.update_course($1,$2,$3,$4::jsonb)", [
      org,
      id,
      rev,
      JSON.stringify(patch),
    ]);
  await test("15 tablas públicas y RLS habilitada", async () => {
    assert.equal(
      await scalar(
        "select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity",
      ),
      15,
    );
  });
  await test("Roles ordinarios sin BYPASSRLS ni superuser", async () => {
    assert.equal(
      await scalar(
        "select count(*)::int from pg_roles where rolname in ('anon','authenticated') and (rolbypassrls or rolsuper)",
      ),
      0,
    );
  });
  await test("Tablas privadas sin grants a authenticated", async () => {
    assert.equal(
      await scalar(
        "select count(*)::int from information_schema.tables where table_schema='private' and has_table_privilege('authenticated',quote_ident(table_schema)||'.'||quote_ident(table_name),'SELECT,INSERT,UPDATE,DELETE')",
      ),
      0,
    );
  });
  await test("Sin UPDATE, DELETE ni TRUNCATE directos", async () => {
    assert.equal(
      await scalar(
        "select count(*)::int from information_schema.tables where table_schema='public' and table_type='BASE TABLE' and (has_table_privilege('authenticated',quote_ident(table_schema)||'.'||quote_ident(table_name),'UPDATE') or has_table_privilege('authenticated',quote_ident(table_schema)||'.'||quote_ident(table_name),'DELETE') or has_table_privilege('authenticated',quote_ident(table_schema)||'.'||quote_ident(table_name),'TRUNCATE'))",
      ),
      0,
    );
  });
  await test("Sin funciones sensibles ejecutables por anon", async () => {
    assert.equal(
      await scalar(
        "select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and has_function_privilege('anon',p.oid,'EXECUTE')",
      ),
      0,
    );
  });
  await test("Funciones definer con search_path vacío", async () => {
    assert.equal(
      await scalar(
        "select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prosecdef and not coalesce(p.proconfig @> ARRAY['search_path=\"\"'],false)",
      ),
      0,
    );
  });
  await test("Anónimo no puede leer cursos", async () => {
    await db.exec("SET LOCAL ROLE anon");
    await errorCode(() => count("courses"), "42501");
  });
  await test("Anónimo no puede invocar una mutación", async () => {
    await db.exec("SET LOCAL ROLE anon");
    await errorCode(
      () => updateCourse(ids.orgA, ids.courseA, 1, { title: "Intrusión" }),
      "42501",
    );
  });
  await test("Cuenta sin membresía no ve cursos", async () => {
    await actor(ids.authNoMember);
    assert.equal(await count("courses"), 0);
  });
  await test("Perfil bloqueado pierde acceso con JWT anterior", async () => {
    await actor(ids.authBlocked);
    assert.equal(await count("courses"), 0);
  });
  await test("Membresía suspendida no ve cursos", async () => {
    await actor(ids.authSuspended);
    assert.equal(await count("courses"), 0);
  });
  await test("JWT anónimo no aprovecha vínculo de perfil", async () => {
    await actor(ids.authStudentA, "aal1", { is_anonymous: true });
    assert.equal(await count("courses"), 0);
  });
  await test("Alumno solo ve su curso publicado", async () => {
    await actor(ids.authStudentA);
    assert.deepEqual(
      (await q("select id from public.courses")).rows.map((r) => r.id),
      [ids.courseA],
    );
  });
  await test("Alumno no ve curso ajeno del mismo tenant", async () => {
    await actor(ids.authStudentA);
    assert.equal(
      await scalar("select count(*)::int from public.courses where id=$1", [
        ids.courseA2,
      ]),
      0,
    );
  });
  await test("Alumno no ve curso de Incubadora por UUID conocido", async () => {
    await actor(ids.authStudentA);
    assert.equal(
      await scalar("select count(*)::int from public.courses where id=$1", [
        ids.courseB,
      ]),
      0,
    );
  });
  await test("Alumno solo ve su matrícula", async () => {
    await actor(ids.authStudentA);
    assert.equal(await count("enrollments"), 1);
  });
  await test("Alumno no enumera a compañeros", async () => {
    await actor(ids.authStudentA);
    assert.equal(await count("organization_memberships"), 1);
  });
  await test("Alumno no lee auth_user_id de perfiles", async () => {
    await actor(ids.authStudentA);
    await errorCode(
      () => q("select auth_user_id from public.profiles"),
      "42501",
    );
  });
  await test("Alumno solo ve su perfil mínimo", async () => {
    await actor(ids.authStudentA);
    assert.equal(await scalar("select count(id)::int from public.profiles"), 1);
  });
  await test("Alumno solo ve clase publicada, no borrador", async () => {
    await actor(ids.authStudentA);
    assert.equal(await count("lessons"), 1);
  });
  await test("Alumno no ve avisos ajenos, futuros o borradores", async () => {
    await actor(ids.authStudentA);
    assert.equal(await count("announcements"), 1);
  });
  await test("Alumno no ve materiales ajenos o borradores", async () => {
    await actor(ids.authStudentA);
    assert.equal(await count("materials"), 2);
  });
  await test("Alumno solo ve evento asignado y no borradores", async () => {
    await actor(ids.authStudentA);
    assert.equal(await count("calendar_events"), 1);
  });
  await test("Alumno no enumera asistentes compañeros", async () => {
    await actor(ids.authStudentA);
    assert.equal(await count("calendar_event_attendees"), 1);
  });
  await test("Identidad de dos organizaciones mantiene dos membresías explícitas", async () => {
    await actor(ids.authShared);
    assert.equal(await count("organizations"), 2);
    assert.equal(await count("courses"), 2);
  });
  await test("Admin con MFA solo ve su organización y borradores", async () => {
    await actor(ids.authAdminA, "aal2");
    assert.equal(await count("courses"), 3);
    assert.equal(
      await scalar(
        "select count(*)::int from public.courses where organization_id=$1",
        [ids.orgB],
      ),
      0,
    );
  });
  await test("Admin sin MFA no recibe vista administrativa", async () => {
    await actor(ids.authAdminA, "aal1");
    assert.equal(await count("courses"), 0);
  });
  await test("Metadata editable y dominio no conceden Admin", async () => {
    await actor(ids.authStudentA, "aal2", {
      user_metadata: {
        role: "admin",
        organization_id: ids.orgA,
        email: "admin@impulso.example.test",
      },
    });
    await errorCode(
      () => updateCourse(ids.orgA, ids.courseA, 1, { title: "Intrusión" }),
      "42501",
    );
  });
  await test("Alumno no escribe cursos mediante tabla", async () => {
    await actor(ids.authStudentA);
    await errorCode(
      () =>
        q(
          "insert into public.courses(organization_id,slug,title) values($1,'intrusion','Intrusión')",
          [ids.orgA],
        ),
      "42501",
    );
  });
  await test("Alumno no escribe cursos mediante RPC", async () => {
    await actor(ids.authStudentA, "aal2");
    await errorCode(
      () => updateCourse(ids.orgA, ids.courseA, 1, { title: "Intrusión" }),
      "42501",
    );
  });
  await test("Admin no escribe en otra organización", async () => {
    await actor(ids.authAdminA, "aal2");
    await errorCode(
      () => updateCourse(ids.orgB, ids.courseB, 1, { title: "Intrusión" }),
      "42501",
    );
  });
  await test("Admin no puede cambiar organization_id por patch", async () => {
    await actor(ids.authAdminA, "aal2");
    await errorCode(
      () =>
        updateCourse(ids.orgA, ids.courseA, 1, { organization_id: ids.orgB }),
      "42501",
    );
  });
  await test("Admin no puede falsificar auditoría ni versión", async () => {
    await actor(ids.authAdminA, "aal2");
    await errorCode(
      () =>
        updateCourse(ids.orgA, ids.courseA, 1, {
          row_version: 99,
          updated_by_membership_id: ids.memberAdminB,
        }),
      "42501",
    );
  });
  await test("Admin no concede role=admin mediante contacto", async () => {
    await actor(ids.authAdminA, "aal2");
    await errorCode(
      () =>
        q("select public.update_student_contact($1,$2,1,$3::jsonb)", [
          ids.orgA,
          ids.memberStudentA,
          JSON.stringify({ role: "admin" }),
        ]),
      "42501",
    );
  });
  await test("Alumno no cambia rol ni membresía directamente", async () => {
    await actor(ids.authStudentA);
    await errorCode(
      () =>
        q(
          "update public.organization_memberships set role='admin' where id=$1",
          [ids.memberStudentA],
        ),
      "42501",
    );
  });
  await test("Admin no cambia vínculo Auth directamente", async () => {
    await actor(ids.authAdminA, "aal2");
    await errorCode(
      () =>
        q("update public.profiles set auth_user_id=$1 where id=$2", [
          ids.authAdminA,
          ids.profileStudentA,
        ]),
      "42501",
    );
  });
  await test("Admin no edita otro Admin con rutina de alumnos", async () => {
    await actor(ids.authAdminA, "aal2");
    await errorCode(
      () =>
        q("select public.update_student_contact($1,$2,1,$3::jsonb)", [
          ids.orgA,
          ids.memberAdminA2,
          JSON.stringify({ first_name: "No permitido" }),
        ]),
      "42501",
    );
  });
  await test("Contacto cambia sin tocar matrículas", async () => {
    const before = await scalar(
      "select count(*)::int from public.enrollments where membership_id=$1",
      [ids.memberStudentA],
    );
    await actor(ids.authAdminA, "aal2");
    const rev = await scalar(
      "select row_version::int from public.organization_memberships where id=$1",
      [ids.memberStudentA],
    );
    await q("select public.update_student_contact($1,$2,$3,$4::jsonb)", [
      ids.orgA,
      ids.memberStudentA,
      rev,
      JSON.stringify({ first_name: "Alumno actualizado" }),
    ]);
    await owner();
    assert.equal(
      await scalar(
        "select count(*)::int from public.enrollments where membership_id=$1",
        [ids.memberStudentA],
      ),
      before,
    );
  });
  await test("Compare-and-swap incrementa versión y rechaza una escritura obsoleta", async () => {
    await actor(ids.authAdminA, "aal2");
    const rev = await version("courses");
    await updateCourse(ids.orgA, ids.courseA, rev, {
      title: "Primera edición",
    });
    await errorCode(
      () =>
        updateCourse(ids.orgA, ids.courseA, rev, { title: "Edición obsoleta" }),
      "40001",
    );
    assert.equal(await version("courses"), rev + 1);
  });
  await test("Una matrícula ajena al tenant se bloquea por RLS y por FK compuesta", async () => {
    const insert = () =>
      q(
        "insert into public.enrollments(organization_id,course_id,membership_id,enrolled_at) values($1,$2,$3,now())",
        [ids.orgA, ids.courseA, ids.memberStudentB],
      );
    await actor(ids.authAdminA, "aal2");
    await errorCode(insert, "42501");
    await owner();
    await errorCode(insert, "23503");
  });
  await test("No se duplican matrículas", async () => {
    await actor(ids.authAdminA, "aal2");
    await errorCode(
      () =>
        q(
          "insert into public.enrollments(organization_id,course_id,membership_id,enrolled_at) values($1,$2,$3,now())",
          [ids.orgA, ids.courseA, ids.memberStudentA],
        ),
      "23505",
    );
  });
  await test("Matrícula nueva necesita fecha", async () => {
    await actor(ids.authAdminA, "aal2");
    await errorCode(
      () =>
        q(
          "insert into public.enrollments(organization_id,course_id,membership_id) values($1,$2,$3)",
          [ids.orgA, ids.courseDraft, ids.memberStudentA],
        ),
      "23514",
    );
  });
  await test("Progreso fuera de rango se rechaza", async () => {
    await actor(ids.authAdminA, "aal2");
    await errorCode(
      () =>
        q("select public.update_enrollment($1,$2,1,$3::jsonb)", [
          ids.orgA,
          ids.enrollmentA,
          JSON.stringify({ progress_percent: 101 }),
        ]),
      "23514",
    );
  });
  await test("Módulo de otro curso no se vincula a una clase", async () => {
    await actor(ids.authAdminA, "aal2");
    await errorCode(
      () =>
        q(
          "insert into public.lessons(organization_id,course_id,module_id,title) values($1,$2,$3,'Incompatible')",
          [ids.orgA, ids.courseA2, ids.moduleA],
        ),
      "23503",
    );
  });
  await test("Precio requiere moneda y no admite negativos", async () => {
    await actor(ids.authAdminA, "aal2");
    await errorCode(
      () =>
        q(
          "insert into public.courses(organization_id,slug,title,price_amount) values($1,'bad-price','Precio',1)",
          [ids.orgA],
        ),
      "23514",
    );
    await errorCode(
      () =>
        q(
          "insert into public.courses(organization_id,slug,title,price_amount,currency) values($1,'bad-price','Precio',-1,'PEN')",
          [ids.orgA],
        ),
      "23514",
    );
  });
  await test("Material exige exactamente una fuente", async () => {
    await actor(ids.authAdminA, "aal2");
    await errorCode(
      () =>
        q(
          "insert into public.materials(organization_id,course_id,title) values($1,$2,'Sin fuente')",
          [ids.orgA, ids.courseA],
        ),
      "23514",
    );
  });
  await test("Enlaces no permitidos se rechazan", async () => {
    await actor(ids.authAdminA, "aal2");
    await errorCode(
      () =>
        q(
          "insert into public.materials(organization_id,course_id,title,external_url) values($1,$2,'No permitido','javascript:alert(1)')",
          [ids.orgA, ids.courseA],
        ),
      "23514",
    );
  });
  await test("Certificado personal no puede publicarse como material de curso", async () => {
    await actor(ids.authAdminA, "aal2");
    await errorCode(
      () =>
        q(
          "insert into public.materials(organization_id,course_id,title,file_asset_id) values($1,$2,'Incorrecto',$3)",
          [ids.orgA, ids.courseA, ids.assetCertificate],
        ),
      "23514",
    );
  });
  await test("Horario invertido falla", async () => {
    await actor(ids.authAdminA, "aal2");
    await errorCode(
      () =>
        q(
          "insert into public.calendar_events(organization_id,course_id,title,starts_at,ends_at) values($1,$2,'Invertido',now()+interval '1 hour',now())",
          [ids.orgA, ids.courseA],
        ),
      "23514",
    );
  });
  await test("Zona horaria inválida falla", async () => {
    await actor(ids.authAdminA, "aal2");
    await errorCode(
      () =>
        q(
          "insert into public.calendar_events(organization_id,course_id,title,starts_at,ends_at,timezone) values($1,$2,'Zona',now(),now()+interval '1 hour','Zona/Inexistente')",
          [ids.orgA, ids.courseA],
        ),
      "23514",
    );
  });
  await test("No se programa evento sin asistentes", async () => {
    await actor(ids.authAdminA, "aal2");
    await errorCode(async () => {
      await q(
        "insert into public.calendar_events(organization_id,course_id,title,starts_at,ends_at,status) values($1,$2,'Vacío',now(),now()+interval '1 hour','scheduled')",
        [ids.orgA, ids.courseA],
      );
      await db.exec("SET CONSTRAINTS ALL IMMEDIATE");
    }, "23514");
  });
  await test("Creación de evento y asistentes es atómica", async () => {
    await actor(ids.authAdminA, "aal2");
    const event = await scalar(
      "select public.create_scheduled_event($1,$2::jsonb,$3::uuid[])",
      [
        ids.orgA,
        JSON.stringify({
          course_id: ids.courseA,
          title: "Atómico",
          starts_at: "2026-12-01T18:00:00-05:00",
          ends_at: "2026-12-01T19:00:00-05:00",
        }),
        [ids.memberStudentA],
      ],
    );
    assert.equal(
      await scalar(
        "select count(*)::int from public.calendar_event_attendees where event_id=$1",
        [event],
      ),
      1,
    );
    await db.exec("SET CONSTRAINTS ALL IMMEDIATE");
  });
  await test("Evento con asistente ajeno se revierte por completo", async () => {
    await actor(ids.authAdminA, "aal2");
    const before = await count("calendar_events");
    await errorCode(
      () =>
        q("select public.create_scheduled_event($1,$2::jsonb,$3::uuid[])", [
          ids.orgA,
          JSON.stringify({
            course_id: ids.courseA,
            title: "Inválido",
            starts_at: "2026-12-01T18:00:00-05:00",
            ends_at: "2026-12-01T19:00:00-05:00",
          }),
          [ids.memberStudentB],
        ]),
      "23514",
    );
    assert.equal(await count("calendar_events"), before);
  });
  await test("Asistente del mismo tenant sin matrícula no se activa", async () => {
    await actor(ids.authAdminA, "aal2");
    const rev = await version("calendar_events");
    await errorCode(
      () =>
        q("select public.replace_event_attendees($1,$2,$3,$4::uuid[])", [
          ids.orgA,
          ids.eventA,
          rev,
          [ids.memberStudentA2],
        ]),
      "23514",
    );
  });
  await test("Reemplazo de asistentes no puede dejar evento programado vacío", async () => {
    await actor(ids.authAdminA, "aal2");
    const rev = await version("calendar_events");
    await errorCode(
      () =>
        q("select public.replace_event_attendees($1,$2,$3,$4::uuid[])", [
          ids.orgA,
          ids.eventA,
          rev,
          [],
        ]),
      "23514",
    );
  });
  await test("Alumno no reprograma eventos", async () => {
    await actor(ids.authStudentA, "aal2");
    await errorCode(
      () =>
        q("select public.update_calendar_event($1,$2,1,$3::jsonb)", [
          ids.orgA,
          ids.eventA,
          JSON.stringify({ title: "Intrusión" }),
        ]),
      "42501",
    );
  });
  await test("Matrícula pausada revoca curso, clase, aviso, material y evento inmediatamente", async () => {
    await q("update public.enrollments set status='paused' where id=$1", [
      ids.enrollmentA,
    ]);
    await actor(ids.authStudentA);
    for (const table of [
      "courses",
      "lessons",
      "announcements",
      "materials",
      "calendar_events",
    ])
      assert.equal(await count(table), 0, table);
  });
  await test("Módulo archivado oculta lección y materiales vinculados", async () => {
    await q("update public.course_modules set status='archived' where id=$1", [
      ids.moduleA,
    ]);
    await actor(ids.authStudentA);
    assert.equal(await count("lessons"), 0);
    assert.equal(await count("materials"), 0);
  });
  await test("Suspensión de organización revoca contenido incluso al Admin", async () => {
    await q("update public.organizations set status='suspended' where id=$1", [
      ids.orgA,
    ]);
    await actor(ids.authAdminA, "aal2");
    assert.equal(await count("courses"), 0);
  });
  await test("Sin recursión RLS en evento-asistentes y archivo-material-certificado", async () => {
    await actor(ids.authStudentA);
    assert.equal(await count("calendar_events"), 1);
    assert.equal(await count("calendar_event_attendees"), 1);
    assert.equal(await count("file_assets"), 3);
    assert.equal(await count("certificate_issues"), 1);
  });
  await test("No se entrega archivo sin vínculo publicado ni video sin vínculo modelado", async () => {
    await actor(ids.authStudentA);
    assert.equal(
      await scalar(
        "select count(*)::int from public.file_assets where id=any($1::uuid[])",
        [[ids.assetVideo, ids.assetUnlinked, ids.assetPending, ids.assetB]],
      ),
      0,
    );
  });
  await test("Certificado propio permanece visible tras cancelación de matrícula", async () => {
    await q("update public.enrollments set status='cancelled' where id=$1", [
      ids.enrollmentA,
    ]);
    await actor(ids.authStudentA);
    assert.equal(await count("certificate_issues"), 1);
    assert.equal(
      await scalar("select private.asset_access($1,$2)", [
        ids.orgA,
        ids.assetCertificate,
      ]),
      true,
    );
  });
  await test("Certificado revocado no entrega archivo", async () => {
    await q(
      "update public.certificate_issues set status='revoked' where id=$1",
      [ids.issueA],
    );
    await actor(ids.authStudentA);
    assert.equal(await count("certificate_issues"), 1);
    assert.equal(
      await scalar("select private.asset_access($1,$2)", [
        ids.orgA,
        ids.assetCertificate,
      ]),
      false,
    );
  });
  await test("Admin no marca ready un archivo por RPC sin verificación Storage", async () => {
    await actor(ids.authAdminA, "aal2");
    await errorCode(
      () =>
        q("select public.update_file_asset($1,$2,1,$3::jsonb)", [
          ids.orgA,
          ids.assetPending,
          JSON.stringify({ status: "ready" }),
        ]),
      "42501",
    );
  });
  await test("No se emite certificado vía registro administrativo público", async () => {
    await actor(ids.authAdminA, "aal2");
    await errorCode(
      () =>
        q(
          "insert into public.certificate_issues(organization_id,enrollment_id,course_id,membership_id,serial,status,issued_at,snapshot) values($1,$2,$3,$4,'INTRUSION','issued',now(),$5::jsonb)",
          [
            ids.orgA,
            ids.enrollmentA,
            ids.courseA,
            ids.memberStudentA,
            JSON.stringify({
              template_version: "test",
              participant: "Alumno",
              course: "Curso",
            }),
          ],
        ),
      "42501",
    );
  });
  await test("Auditoría no contiene los contactos ni cuerpos modificados", async () => {
    await actor(ids.authAdminA, "aal2");
    const rev = await version("courses");
    await updateCourse(ids.orgA, ids.courseA, rev, {
      title: "VALOR-PRIVADO-NO-LOG",
    });
    await owner();
    assert.equal(
      await scalar(
        "select count(*)::int from public.audit_events where changes::text like '%VALOR-PRIVADO-NO-LOG%'",
      ),
      0,
    );
  });
  await test("Alumno no escribe ni borra auditoría", async () => {
    await actor(ids.authStudentA);
    await errorCode(
      () =>
        q(
          "insert into public.audit_events(action,entity_type,actor_kind) values('INSERT','fake','user')",
        ),
      "42501",
    );
    await errorCode(() => q("delete from public.audit_events"), "42501");
  });
  await test("Admin no lee auditoría de otro tenant", async () => {
    await actor(ids.authAdminA, "aal2");
    assert.equal(
      await scalar(
        "select count(*)::int from public.audit_events where organization_id=$1",
        [ids.orgB],
      ),
      0,
    );
  });
  await test("Tablas de migración y activación siguen privadas al Admin", async () => {
    await actor(ids.authAdminA, "aal2");
    await errorCode(
      () => q("select * from private.identity_activation_requests"),
      "42501",
    );
    await errorCode(() => q("select * from private.import_records"), "42501");
  });
  await test("Payload privado rechaza claves de credenciales anidadas", async () => {
    assert.equal(
      await scalar("select private.no_secret_keys($1::jsonb)", [
        JSON.stringify({ source: { Password_Hash: "not-a-password" } }),
      ]),
      false,
    );
  });
  await test("No se suspende el último Admin en una transacción", async () => {
    await errorCode(async () => {
      await q(
        "update public.organization_memberships set status='suspended' where id=any($1::uuid[])",
        [[ids.memberAdminA, ids.memberAdminA2]],
      );
      await db.exec("SET CONSTRAINTS ALL IMMEDIATE");
    }, "23514");
  });
  await test("Bloquear los perfiles de todos los Admin también se rechaza", async () => {
    await errorCode(async () => {
      await q(
        "update public.profiles set status='blocked' where id=any($1::uuid[])",
        [[ids.profileAdminA, ids.profileAdminA2]],
      );
      await db.exec("SET CONSTRAINTS ALL IMMEDIATE");
    }, "23514");
  });
  await test("Sin autoalta de perfil ni Admin para authenticated", async () => {
    await actor(ids.authNoMember, "aal2");
    await errorCode(
      () =>
        q(
          "insert into public.profiles(auth_user_id,status) values($1,'active')",
          [ids.authNoMember],
        ),
      "42501",
    );
    await errorCode(
      () =>
        q(
          "insert into public.organization_memberships(organization_id,profile_id,role,status,first_name) values($1,$2,'admin','active','No permitido')",
          [ids.orgA, ids.profileNoMember],
        ),
      "42501",
    );
  });

  await test("Storage solo permite assets autorizados y no rutas adivinadas", async () => {
    await q(
      "insert into storage.objects(bucket_id,name) select bucket_name,object_path from public.file_assets",
    );
    await actor(ids.authStudentA);
    assert.equal(await scalar("select count(*)::int from storage.objects"), 3);
  });
  await test("Guard restrictivo de Storage resiste otra política permissiva", async () => {
    await q(
      "insert into storage.objects(bucket_id,name) select bucket_name,object_path from public.file_assets",
    );
    await db.exec(
      "CREATE POLICY accidental_overshare ON storage.objects FOR SELECT TO authenticated USING(true)",
    );
    await actor(ids.authStudentA);
    assert.equal(await scalar("select count(*)::int from storage.objects"), 3);
  });
  await test("Anónimo no ve metadata Storage aun con política accidental", async () => {
    await q(
      "insert into storage.objects(bucket_id,name) select bucket_name,object_path from public.file_assets",
    );
    await db.exec(
      "CREATE POLICY accidental_anon ON storage.objects FOR SELECT TO anon USING(true);SET LOCAL ROLE anon",
    );
    assert.equal(await scalar("select count(*)::int from storage.objects"), 0);
  });
  await test("Uploads quedan bloqueados aun con grant y política accidental", async () => {
    await db.exec(
      "GRANT INSERT ON storage.objects TO authenticated; CREATE POLICY accidental_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(true)",
    );
    await actor(ids.authAdminA, "aal2");
    await errorCode(
      () =>
        q(
          "insert into storage.objects(bucket_id,name) values('course-files','unverified-object')",
        ),
      "42501",
    );
  });
  await test("Cancelar todos los asistentes existentes falla al validar constraints", async () => {
    await errorCode(async () => {
      await q(
        "update public.calendar_event_attendees set status='cancelled' where event_id=$1",
        [ids.eventA],
      );
      await db.exec("SET CONSTRAINTS ALL IMMEDIATE");
    }, "23514");
  });
  await test("Nombre de archivo con separador no se acepta", async () => {
    await errorCode(
      () =>
        q(
          "update public.file_assets set original_name='../archivo.pdf' where id=$1",
          [ids.assetA],
        ),
      "23514",
    );
  });

  await test("La staging rechaza credenciales mediante CHECK real", async () => {
    const source = await scalar(
      "insert into private.migration_sources(source_kind,source_instance) values('sheets','synthetic') returning id",
    );
    const run = await scalar(
      "insert into private.import_runs(source_id,extractor_version,transform_version,input_sha256,operator_label) values($1,'test','test',$2,'test') returning id",
      [source, "a".repeat(64)],
    );
    await errorCode(
      () =>
        q(
          "insert into private.import_records(run_id,source_id,collection,record_key,source_location,payload,sha256) values($1,$2,'Usuarios','test','row-1',$3::jsonb,$4)",
          [
            run,
            source,
            JSON.stringify({
              nested: { Password_Hash: "synthetic-denied-value" },
            }),
            "b".repeat(64),
          ],
        ),
      "23514",
    );
  });
  await test("Mapa tipado no vincula curso de otro tenant", async () => {
    const source = await scalar(
      "insert into private.migration_sources(source_kind,source_instance) values('sheets','synthetic') returning id",
    );
    await errorCode(
      () =>
        q(
          "insert into private.legacy_id_map(source_id,entity_kind,legacy_id,organization_id,course_id,accepted_sha256) values($1,'course','old-id',$2,$3,$4)",
          [source, ids.orgA, ids.courseB, "a".repeat(64)],
        ),
      "23503",
    );
  });
  await test("Activación linked no puede apuntar al Auth de otra persona", async () => {
    await errorCode(
      () =>
        q(
          "insert into private.identity_activation_requests(organization_id,profile_id,membership_id,proposed_verified_contact,status,auth_user_id,idempotency_key,verified_at,linked_at) values($1,$2,$3,'synthetic@example.test','linked',$4,gen_random_uuid(),now(),now())",
          [ids.orgA, ids.profileStudentA, ids.memberStudentA, ids.authStudentB],
        ),
      "23514",
    );
  });
  await test("Evidencia emitida no puede volver a draft ni cambiar snapshot", async () => {
    await actor(ids.authAdminA, "aal2");
    const rev = await scalar(
      "select row_version::int from public.certificate_issues where id=$1",
      [ids.issueA],
    );
    await errorCode(
      () =>
        q("select public.update_certificate_issue($1,$2,$3,$4::jsonb)", [
          ids.orgA,
          ids.issueA,
          rev,
          JSON.stringify({ status: "draft" }),
        ]),
      "42501",
    );
    await errorCode(
      () =>
        q("select public.update_certificate_issue($1,$2,$3,$4::jsonb)", [
          ids.orgA,
          ids.issueA,
          rev,
          JSON.stringify({ snapshot: { participant: "Otra persona" } }),
        ]),
      "23514",
    );
  });
  return results;
}
