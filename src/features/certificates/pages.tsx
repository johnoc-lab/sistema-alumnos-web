import { PageHeading } from "@/components/ui/primitives";
import { AccessPending } from "@/features/auth/components/access-pending";
import { AcademicShell } from "@/features/academic/shell";
import { uuid } from "@/features/academic/forms";
import { ProtectedModule } from "@/features/auth/components/protected-module";
import { organizationAccess } from "@/lib/auth/access.server";
import { hasStaffPermission } from "@/lib/authorization/staff";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import css from "@/features/academic/academic.module.css";
import ui from "@/components/ui/ui.module.css";
import { detailsFromSnapshot } from "./certificates.server";

type StaffContext = {
  courses: { id: string; title: string }[];
  students: { id: string; name: string }[];
  pending: { id: string; student: string; teacher: string; course: string }[];
};

const notices = {
  recommended: "Recomendación enviada.",
  approved: "Certificado aprobado y disponible para el alumno.",
  rejected: "Recomendación rechazada.",
  duplicate:
    "Ya existe una recomendación o un certificado para esta matrícula.",
  failed:
    "No se pudo guardar. Comprueba que la matrícula y la recomendación sigan vigentes.",
} as const;

export async function StaffCertificates({
  slug,
  course,
  notice,
}: {
  slug: string;
  course?: string | undefined;
  notice?: string | undefined;
}) {
  const section = "admin/certificados";
  const access = await organizationAccess(slug, "admin", "certificates");
  if (!access.allowed || !access.membership) {
    return (
      <ProtectedModule
        slug={slug}
        role="admin"
        title="Certificados"
        section={section}
      />
    );
  }

  const membership = access.membership;
  const recommend =
    membership.staffRank === "teacher" &&
    hasStaffPermission(membership, "certificates.recommend");
  const approve = hasStaffPermission(membership, "certificates.approve");
  if (!recommend && !approve) {
    return (
      <AccessPending
        state="forbidden"
        message="Tu cuenta necesita permiso para recomendar o decidir certificados."
      />
    );
  }

  const base = "/o/" + encodeURIComponent(slug) + "/" + section;
  const selected = typeof course === "string" && uuid(course) ? course : "";
  const client = await createServerSupabaseClient();
  const result = await client.rpc("certificate_staff_context", {
    p_org: membership.organizationId,
    p_course: selected,
  });
  const data =
    !result.error && result.data
      ? (result.data as unknown as StaffContext)
      : null;
  const message =
    notice && Object.hasOwn(notices, notice)
      ? notices[notice as keyof typeof notices]
      : "";
  const alert = notice === "duplicate" || notice === "failed";
  return (
    <AcademicShell
      slug={slug}
      name={membership.name}
      admin
      section={section}
      membership={membership}
    >
      <PageHeading
        eyebrow="Gestión académica"
        title="Certificados"
        description="Recomendaciones de certificación por taller."
      />
      {message && (
        <p
          role={alert ? "alert" : "status"}
          className={alert ? css.error : css.success}
        >
          {message}
        </p>
      )}
      {!data ? (
        <p role="alert" className={css.error}>
          No se pudieron consultar los certificados.
        </p>
      ) : (
        <>
          {recommend && (
            <section className={css.section}>
              <h2>Recomendar certificado</h2>
              {data.courses.length === 0 ? (
                <p>No hay talleres disponibles.</p>
              ) : (
                <form method="get" action={base}>
                  <label className={css.field}>
                    Taller
                    <select name="course" defaultValue={selected} required>
                      <option value="">Selecciona un taller</option>
                      {data.courses.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className={ui.secondaryLink} type="submit">
                    Ver alumnos matriculados
                  </button>
                </form>
              )}
              {data.courses.some((item) => item.id === selected) &&
                (data.students.length === 0 ? (
                  <p>
                    No hay matrículas elegibles sin recomendación en este
                    taller.
                  </p>
                ) : (
                  <form method="post" action={base + "/acciones"}>
                    <input type="hidden" name="action" value="recommend" />
                    <label className={css.field}>
                      Alumno
                      <select name="id" defaultValue="" required>
                        <option value="">Selecciona un alumno</option>
                        {data.students.map((student) => (
                          <option key={student.id} value={student.id}>
                            {student.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className={ui.primaryLink} type="submit">
                      Recomendar
                    </button>
                  </form>
                ))}
            </section>
          )}
          {approve && (
            <section className={css.section}>
              <h2>Recomendaciones pendientes</h2>
              {data.pending.length === 0 ? (
                <p>No hay recomendaciones pendientes.</p>
              ) : (
                <div className={css.tableWrap}>
                  <table className={css.table}>
                    <thead>
                      <tr>
                        <th>Alumno</th>
                        <th>Taller</th>
                        <th>Profesor</th>
                        <th>Decisión</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.pending.map((item) => (
                        <tr key={item.id}>
                          <td>{item.student}</td>
                          <td>{item.course}</td>
                          <td>{item.teacher}</td>
                          <td>
                            <form method="post" action={base + "/acciones"}>
                              <input type="hidden" name="id" value={item.id} />
                              <button
                                type="submit"
                                name="action"
                                value="approve"
                                className={ui.primaryLink}
                                aria-label={
                                  "Aprobar certificado de " + item.student
                                }
                              >
                                Aprobar
                              </button>{" "}
                              <button
                                type="submit"
                                name="action"
                                value="reject"
                                className={ui.secondaryLink}
                                aria-label={
                                  "Rechazar certificado de " + item.student
                                }
                              >
                                Rechazar
                              </button>
                            </form>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </AcademicShell>
  );
}

export async function StudentCertificates({ slug }: { slug: string }) {
  const section = "dashboard/certificados";
  const access = await organizationAccess(slug, "student");
  if (!access.allowed || !access.membership) {
    return (
      <ProtectedModule
        slug={slug}
        role="student"
        title="Certificados"
        section={section}
      />
    );
  }
  const membership = access.membership;
  const client = await createServerSupabaseClient();
  const { data, error } = await client
    .from("certificate_issues")
    .select("id,snapshot,issued_at,serial")
    .eq("organization_id", membership.organizationId)
    .eq("status", "issued")
    .order("issued_at", { ascending: false });
  const certificates = (data ?? []).flatMap((row) => {
    const details = detailsFromSnapshot(
      row.snapshot,
      row.issued_at,
      row.serial,
    );
    return details ? [{ ...details, id: row.id }] : [];
  });
  return (
    <AcademicShell
      slug={slug}
      name={membership.name}
      admin={false}
      section={section}
      membership={membership}
    >
      <PageHeading
        eyebrow="Espacio del alumno"
        title="Mis certificados"
        description="Consulta y descarga los certificados de tus talleres."
      />
      <section className={css.section}>
        {error ? (
          <p role="alert" className={css.error}>
            No se pudieron consultar tus certificados.
          </p>
        ) : certificates.length === 0 ? (
          <p>Aún no tienes certificados aprobados.</p>
        ) : (
          certificates.map((item) => {
            const pdf =
              "/o/" + encodeURIComponent(slug) + "/" + section + "/" + item.id;
            return (
              <article className={css.card} key={item.id}>
                <h3>{item.course}</h3>
                <p>Emitido el {item.date}</p>
                <a
                  href={pdf + "?vista=pdf"}
                  className={ui.secondaryLink}
                  aria-label={"Ver certificado de " + item.course}
                >
                  Ver PDF
                </a>{" "}
                <a
                  href={pdf}
                  className={ui.primaryLink}
                  aria-label={"Descargar certificado de " + item.course}
                >
                  Descargar PDF
                </a>
              </article>
            );
          })
        )}
      </section>
    </AcademicShell>
  );
}
