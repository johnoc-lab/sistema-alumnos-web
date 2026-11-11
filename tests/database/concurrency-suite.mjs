import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { connectLocal } from "../../scripts/database/native-client.mjs";
import { ids } from "./fixture-ids.mjs";
async function beginUser(client, sub) {
  await client.query("BEGIN");
  await client.query("SELECT set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub, role: "authenticated", aal: "aal2" }),
  ]);
  await client.query("SET LOCAL ROLE authenticated");
}
async function waitForLock(observer, pid) {
  const deadline = Date.now() + 3500;
  while (Date.now() < deadline) {
    const { rows } = await observer.query(
      "SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",
      [pid],
    );
    if (rows[0]?.wait_event_type === "Lock") return;
    await delay(25);
  }
  throw new Error("No se observó la segunda conexión esperando el bloqueo.");
}
export async function concurrencySuite(observer) {
  const a = await connectLocal("phase4-concurrency-a");
  const b = await connectLocal("phase4-concurrency-b");
  const results = [];
  const test = async (name, fn) => {
    try {
      await fn();
      results.push({ name, passed: true });
    } catch (error) {
      results.push({ name, passed: false, error: error.message });
    } finally {
      await a.query("ROLLBACK");
      await b.query("ROLLBACK");
    }
  };
  try {
    const pid = (await b.query("SELECT pg_backend_pid() pid")).rows[0].pid;
    await test("Dos administradores: un cambio de curso gana y el otro recibe 40001", async () => {
      const original = (
        await observer.query(
          "SELECT title,row_version FROM public.courses WHERE id=$1",
          [ids.courseA],
        )
      ).rows[0];
      let pending;
      try {
        await beginUser(a, ids.authAdminA);
        await beginUser(b, ids.authAdminA2);
        await a.query("SELECT public.update_course($1,$2,$3,$4)", [
          ids.orgA,
          ids.courseA,
          original.row_version,
          { title: "Cambio concurrente sintético" },
        ]);
        pending = b
          .query("SELECT public.update_course($1,$2,$3,$4)", [
            ids.orgA,
            ids.courseA,
            original.row_version,
            { title: "No debe sobrescribir" },
          ])
          .then(
            () => null,
            (error) => error.code,
          );
        await waitForLock(observer, pid);
        await a.query("COMMIT");
        assert.equal(await pending, "40001");
      } finally {
        await a.query("ROLLBACK");
        await b.query("ROLLBACK");
        if (pending) await pending;
        await observer.query("UPDATE public.courses SET title=$1 WHERE id=$2", [
          original.title,
          ids.courseA,
        ]);
      }
    });
    await test("Dos operadores: no pueden suspender simultáneamente a todos los administradores", async () => {
      let pending;
      try {
        await a.query("BEGIN");
        await b.query("BEGIN");
        await a.query(
          "UPDATE public.organization_memberships SET status='suspended' WHERE id=$1",
          [ids.memberAdminA],
        );
        pending = b
          .query(
            "UPDATE public.organization_memberships SET status='suspended' WHERE id=$1",
            [ids.memberAdminA2],
          )
          .then(
            () => null,
            (error) => error.code,
          );
        await waitForLock(observer, pid);
        await a.query("COMMIT");
        assert.equal(await pending, null);
        let code;
        try {
          await b.query("COMMIT");
        } catch (error) {
          code = error.code;
        }
        assert.equal(code, "23514");
      } finally {
        await a.query("ROLLBACK");
        await b.query("ROLLBACK");
        if (pending) await pending;
        await observer.query(
          "UPDATE public.organization_memberships SET status='active' WHERE id=ANY($1::uuid[])",
          [[ids.memberAdminA, ids.memberAdminA2]],
        );
      }
    });
    await test("Snapshot repetible: una suspensión concurrente conserva al último principal", async () => {
      let pending;
      try {
        await a.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
        await b.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
        await b.query("SELECT id FROM public.organizations WHERE id=$1", [
          ids.orgA,
        ]);
        await a.query(
          "UPDATE public.organization_memberships SET status='suspended' WHERE id=$1",
          [ids.memberAdminA],
        );
        pending = b
          .query(
            "UPDATE public.organization_memberships SET staff_rank='administrator' WHERE id=$1",
            [ids.memberAdminA2],
          )
          .then(
            () => null,
            (error) => error.code,
          );
        await waitForLock(observer, pid);
        await a.query("COMMIT");
        assert.equal(await pending, "40001");
        await b.query("ROLLBACK");
        const surviving = await observer.query(
          "SELECT id FROM public.organization_memberships WHERE organization_id=$1 AND staff_rank='principal' AND status='active'",
          [ids.orgA],
        );
        assert.deepEqual(surviving.rows, [{ id: ids.memberAdminA2 }]);
      } finally {
        await a.query("ROLLBACK");
        await b.query("ROLLBACK");
        if (pending) await pending;
        await observer.query(
          "UPDATE public.organization_memberships SET status='active',staff_rank='principal' WHERE id=ANY($1::uuid[])",
          [[ids.memberAdminA, ids.memberAdminA2]],
        );
      }
    });
    await test("Dos principales: la sesión que pierde el rango no puede degradar al otro", async () => {
      let pending;
      try {
        const { rows } = await observer.query(
          "SELECT id,row_version FROM public.organization_memberships WHERE id=ANY($1::uuid[])",
          [[ids.memberAdminA, ids.memberAdminA2]],
        );
        const versions = new Map(rows.map((row) => [row.id, row.row_version]));
        const statement =
          "SELECT public.update_staff($1,$2,$3,'secretary',ARRAY['attendance'],'active')";
        await beginUser(a, ids.authAdminA);
        await beginUser(b, ids.authAdminA2);
        await a.query(statement, [
          ids.orgA,
          ids.memberAdminA2,
          versions.get(ids.memberAdminA2),
        ]);
        pending = b
          .query(statement, [
            ids.orgA,
            ids.memberAdminA,
            versions.get(ids.memberAdminA),
          ])
          .then(
            () => null,
            (error) => error.code,
          );
        await waitForLock(observer, pid);
        await a.query("COMMIT");
        assert.equal(await pending, "42501");
        await b.query("ROLLBACK");
        const surviving = await observer.query(
          "SELECT id FROM public.organization_memberships WHERE organization_id=$1 AND staff_rank='principal' AND status='active'",
          [ids.orgA],
        );
        assert.deepEqual(surviving.rows, [{ id: ids.memberAdminA }]);
      } finally {
        await a.query("ROLLBACK");
        await b.query("ROLLBACK");
        if (pending) await pending;
        await observer.query(
          "UPDATE public.organization_memberships SET status='active',staff_rank='principal',allowed_modules=ARRAY[]::text[] WHERE id=ANY($1::uuid[])",
          [[ids.memberAdminA, ids.memberAdminA2]],
        );
      }
    });
    await test("Dos administradores: reemplazar asistentes usa la versión del evento y serializa cambios", async () => {
      const version = (
        await observer.query(
          "SELECT row_version FROM public.calendar_events WHERE id=$1",
          [ids.eventA],
        )
      ).rows[0].row_version;
      let pending;
      try {
        await beginUser(a, ids.authAdminA);
        await beginUser(b, ids.authAdminA2);
        await a.query(
          "SELECT public.replace_event_attendees($1,$2,$3,$4::uuid[])",
          [ids.orgA, ids.eventA, version, [ids.memberStudentA]],
        );
        pending = b
          .query("SELECT public.replace_event_attendees($1,$2,$3,$4::uuid[])", [
            ids.orgA,
            ids.eventA,
            version,
            [ids.memberSharedA],
          ])
          .then(
            () => null,
            (error) => error.code,
          );
        await waitForLock(observer, pid);
        await a.query("COMMIT");
        assert.equal(await pending, "40001");
      } finally {
        await a.query("ROLLBACK");
        await b.query("ROLLBACK");
        if (pending) await pending;
        await observer.query(
          "UPDATE public.calendar_event_attendees SET status='active' WHERE id=ANY($1::uuid[])",
          [[ids.attendeeA, ids.attendeeSharedA]],
        );
      }
    });
  } finally {
    await a.end();
    await b.end();
  }
  return results;
}
