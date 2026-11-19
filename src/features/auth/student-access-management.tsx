import { PageHeading } from "@/components/ui/primitives";
import ui from "@/components/ui/ui.module.css";
import css from "@/features/academic/academic.module.css";
import styles from "./student-access-management.module.css";
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
        description="Genera códigos de inscripción y recuperación para alumnos de tu institución."
      />
      <section className={css.section} aria-labelledby="issue-student-access">
        <h2 id="issue-student-access">Generar un código</h2>
        <p className={styles.introduction}>
          El sistema genera el código automáticamente. Es único, caduca y solo
          permite completar una inscripción o recuperación. Los códigos de
          inscripción duran 24 horas y los de recuperación, 15 minutos.
        </p>
        <form action={action} method="post" className={styles.form}>
          <label className={css.field + " " + styles.fullWidth}>
            ¿Qué necesita el alumno?
            <select name="action" defaultValue="enroll">
              <option value="enroll">Crear su cuenta de alumno</option>
              <option value="recover">Recuperar el acceso a su cuenta</option>
            </select>
          </label>
          <label className={css.field}>
            Código interno del alumno
            <input
              name="recipient"
              pattern={"[A-Za-z0-9][A-Za-z0-9._\\-]{2,63}"}
              placeholder="Ej. inscripcion-2026-001"
              aria-describedby="student-recipient-help"
              required
              minLength={3}
              maxLength={64}
            />
            <small id="student-recipient-help" className={styles.fieldHelp}>
              Usa la referencia del alumno en el padrón de tu institución.
              Consérvala para recuperar su cuenta más adelante.
            </small>
          </label>
          <label className={css.field}>
            Registro de la comprobación
            <input
              name="evidence"
              pattern={"[A-Za-z0-9][A-Za-z0-9._\\-]{2,63}"}
              placeholder="Ej. verificacion-2026-001"
              aria-describedby="student-evidence-help"
              required
              minLength={3}
              maxLength={64}
            />
            <small id="student-evidence-help" className={styles.fieldHelp}>
              Indica la referencia de la comprobación que realizaste contra el
              padrón y el canal privado confirmado.
            </small>
          </label>
          <p className={styles.fieldHelp + " " + styles.fullWidth}>
            Usa referencias internas de 3 a 64 caracteres con letras, números,
            puntos, guiones o guiones bajos, sin espacios ni datos personales
            sensibles como DNI, teléfonos o contraseñas.
          </p>
          <label className={styles.verification + " " + styles.fullWidth}>
            <input name="verified" type="checkbox" value="yes" required />
            <span>
              Comprobé la identidad del alumno en el padrón institucional y
              confirmé su canal privado de contacto.
            </span>
          </label>
          <div className={styles.delivery + " " + styles.fullWidth}>
            <h3>Entrega privada al alumno</h3>
            <p>
              Al generar, verás una sola vez el código y la prueba del canal
              verificado. Entrega el código únicamente al alumno comprobado y
              envía la prueba por separado, mediante su canal privado ya
              confirmado. El alumno necesita ambos para completar el formulario.
            </p>
          </div>
          <button className={ui.primaryLink} type="submit">
            Generar código y prueba
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
                  <th>Código interno del alumno</th>
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
                          className={styles.reissueForm}
                        >
                          <input type="hidden" name="action" value="reissue" />
                          <input type="hidden" name="id" value={grant.id} />
                          <label className={css.field}>
                            Registro de la nueva comprobación
                            <input
                              name="evidence"
                              placeholder="Ej. verificacion-2026-002"
                              pattern={"[A-Za-z0-9][A-Za-z0-9._\\-]{2,63}"}
                              minLength={3}
                              required
                              maxLength={64}
                            />
                          </label>
                          <label className={styles.verification}>
                            <input
                              name="verified"
                              type="checkbox"
                              value="yes"
                              required
                            />
                            <span>
                              Volví a comprobar al alumno en el padrón y
                              confirmé su canal privado.
                            </span>
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
