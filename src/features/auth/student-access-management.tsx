import { PageHeading } from "@/components/ui/primitives";
import ui from "@/components/ui/ui.module.css";
import css from "@/features/academic/academic.module.css";
import { AcademicShell } from "@/features/academic/shell";
import { AccessPending } from "@/features/auth/components/access-pending";
import { ProtectedModule } from "@/features/auth/components/protected-module";
import { organizationAccess } from "@/lib/auth/access.server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { studentInstitutions } from "./student-registration.server";

const labels: Record<string, string> = {
  issued: "Pendiente",
  processing: "Requiere revisión",
  password_pending: "Cambio de contraseña sin confirmar",
  password_rejected: "Contraseña rechazada",
  revocation_pending: "Contraseña cambiada · cierre pendiente",
  completion_pending: "Cierre confirmado · finalización pendiente",
  completed: "Completada",
  expired: "Vencida",
  revoked: "Revocada",
};

export async function StudentAccessManagement({ slug }: { slug: string }) {
  const section = "admin/autorizaciones-alumnos";
  const access = await organizationAccess(slug, "admin", "student_access");
  if (!access.allowed || !access.membership)
    return (
      <ProtectedModule
        slug={slug}
        role="admin"
        title="Autorizaciones de alumnos"
        section={section}
      />
    );
  if (!Object.hasOwn(studentInstitutions, slug))
    return (
      <AccessPending
        state="forbidden"
        message="Esta institución no está habilitada para el autorregistro."
      />
    );

  const client = await createServerSupabaseClient();
  const grants = await client.rpc("list_student_access", {
    p_org: access.membership.organizationId,
  });
  const action = "/o/" + encodeURIComponent(slug) + "/" + section + "/acciones";
  const entries = Array.isArray(grants.data)
    ? (grants.data.filter(
        (item) =>
          item &&
          typeof item === "object" &&
          !Array.isArray(item) &&
          typeof item.id === "string" &&
          typeof item.recipient_ref === "string" &&
          typeof item.purpose === "string" &&
          typeof item.status === "string",
      ) as {
        id: string;
        recipient_ref: string;
        purpose: string;
        status: string;
      }[])
    : [];
  return (
    <AcademicShell
      slug={slug}
      name={access.membership.name}
      admin
      section={section}
      membership={access.membership}
    >
      <PageHeading
        eyebrow="GESTIÓN ACADÉMICA"
        title="Autorizaciones de alumnos"
        description="Emite códigos para alumnos verificados en el padrón de tu institución."
      />
      <section className={css.section} aria-labelledby="issue-student-access">
        <h2 id="issue-student-access">Emitir autorización</h2>
        <form action={action} method="post" className={css.form}>
          <label className={css.field}>
            Operación
            <select name="action" defaultValue="enroll">
              <option value="enroll">Inscripción</option>
              <option value="recover">Recuperación supervisada</option>
            </select>
          </label>
          <label className={css.field}>
            Referencia interna del padrón
            <input
              name="recipient"
              pattern={"[A-Za-z0-9][A-Za-z0-9._\\-]{2,63}"}
              required
              maxLength={64}
            />
          </label>
          <label className={css.field}>
            Referencia de la verificación
            <input
              name="evidence"
              pattern={"[A-Za-z0-9][A-Za-z0-9._\\-]{2,63}"}
              required
              maxLength={64}
            />
          </label>
          <label>
            <input name="verified" type="checkbox" value="yes" required />{" "}
            Verifiqué al titular contra el padrón y confirmé el canal privado.
            Usaré referencias internas, sin datos personales.
          </label>
          <button className={ui.primaryLink} type="submit">
            Emitir código y prueba
          </button>
        </form>
      </section>
      <section className={css.section} aria-labelledby="student-access-list">
        <h2 id="student-access-list">Autorizaciones recientes</h2>
        {grants.error ? (
          <p role="alert">No se pudieron consultar las autorizaciones.</p>
        ) : entries.length === 0 ? (
          <p>Todavía no hay autorizaciones.</p>
        ) : (
          <div className={css.tableWrap}>
            <table className={css.table}>
              <thead>
                <tr>
                  <th>Referencia</th>
                  <th>Operación</th>
                  <th>Estado</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((grant) => (
                  <tr key={grant.id}>
                    <td>{grant.recipient_ref}</td>
                    <td>
                      {grant.purpose === "enroll"
                        ? "Inscripción"
                        : "Recuperación"}
                    </td>
                    <td>{labels[grant.status] ?? grant.status}</td>
                    <td>
                      {[
                        "processing",
                        "expired",
                        "password_pending",
                        "password_rejected",
                        "revocation_pending",
                        "completion_pending",
                      ].includes(grant.status) && (
                        <form
                          action={action}
                          method="post"
                          className={css.form}
                        >
                          <input type="hidden" name="action" value="reissue" />
                          <input type="hidden" name="id" value={grant.id} />
                          <label className={css.field}>
                            Referencia de la nueva verificación
                            <input name="evidence" required maxLength={64} />
                          </label>
                          <label>
                            <input
                              name="verified"
                              type="checkbox"
                              value="yes"
                              required
                            />{" "}
                            Volví a verificar al titular y su canal privado.
                          </label>
                          <button type="submit" className={ui.secondaryLink}>
                            Reemitir
                          </button>
                        </form>
                      )}
                      {["issued", "expired"].includes(grant.status) && (
                        <form action={action} method="post">
                          <input type="hidden" name="action" value="revoke" />
                          <input type="hidden" name="id" value={grant.id} />
                          <button type="submit" className={ui.secondaryLink}>
                            Revocar
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AcademicShell>
  );
}
