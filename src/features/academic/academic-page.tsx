import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { organizationAccess } from "@/lib/auth/access.server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ProtectedModule } from "@/features/auth/components/protected-module";
import { PageHeading, Badge } from "@/components/ui/primitives";
import { normalizeSearch } from "@/features/preview/presentation";
import { AcademicShell } from "./shell";
import { loadAcademic, type AcademicData } from "./data.server";
import { labels, noticeText, resourceUrl, states, uuid } from "./forms";
import ui from "@/components/ui/ui.module.css";
import css from "./academic.module.css";
type Search = Record<string, string | string[] | undefined>;
type Props = {
  slug: string;
  section: string;
  search?: Search;
  courseId?: string;
};
const value = (search: Search, key: string) =>
  typeof search[key] === "string" ? (search[key] as string) : "";
const name = (m: AcademicData["memberships"][number]) =>
  [m.first_name, m.last_name].filter(Boolean).join(" ") || "Sin nombre";
const date = (v: string | null) =>
  v
    ? new Intl.DateTimeFormat("es-PE", {
        timeZone: "America/Lima",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(v))
    : "Sin fecha";
const localInput = (v: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(v))
    .replace(" ", "T");
function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={css.field + " " + (wide ? css.wide : "")}>
      <span>{label}</span>
      {children}
    </label>
  );
}
function Status({ status }: { status: string }) {
  return (
    <Badge
      tone={
        ["active", "published", "scheduled", "completed"].includes(status)
          ? "green"
          : "amber"
      }
    >
      {labels[status] ?? status}
    </Badge>
  );
}
function StatusInput({
  options,
  current,
}: {
  options: readonly string[];
  current: string;
}) {
  return (
    <Field label="Estado">
      <select name="status" defaultValue={current} required>
        {options.map((s) => (
          <option key={s} value={s}>
            {labels[s] ?? s}
          </option>
        ))}
      </select>
    </Field>
  );
}
function BaseForm({
  slug,
  action,
  id,
  version,
  children,
}: {
  slug: string;
  action: string;
  id?: string | undefined;
  version?: number | undefined;
  children: ReactNode;
}) {
  return (
    <form
      className={css.form}
      action={"/o/" + slug + "/acciones"}
      method="post"
    >
      <input type="hidden" name="action" value={action} />
      {id && (
        <>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="version" value={version} />
        </>
      )}
      {children}
    </form>
  );
}
function Save({ disabled = false }: { disabled?: boolean }) {
  return (
    <button className={ui.primaryLink} type="submit" disabled={disabled}>
      Guardar
    </button>
  );
}
function CourseSelect({
  data,
  current,
  selected,
}: {
  data: AcademicData;
  current?: string | undefined;
  selected?: string | undefined;
}) {
  return current ? (
    <input type="hidden" name="course_id" value={current} />
  ) : (
    <Field label="Taller">
      <select
        name="course_id"
        defaultValue={
          data.courses.some((c) => c.id === selected) ? selected : ""
        }
        required
      >
        <option value="" disabled>
          Selecciona un taller
        </option>
        {data.courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title} · {labels[c.status]}
          </option>
        ))}
      </select>
    </Field>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <p className={css.empty} role="status">
      {children}
    </p>
  );
}
function CourseForm({
  slug,
  course,
}: {
  slug: string;
  course?: AcademicData["courses"][number];
}) {
  return (
    <BaseForm
      slug={slug}
      action="course"
      id={course?.id}
      version={course?.row_version}
    >
      <Field label="Nombre del taller">
        <input
          name="title"
          maxLength={200}
          required
          defaultValue={course?.title}
        />
      </Field>
      {!course && (
        <Field label="Identificador (letras, números y guiones)">
          <input
            name="slug"
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            maxLength={100}
            placeholder="taller-emprendimiento"
            required
          />
        </Field>
      )}
      <Field label="Categoría">
        <input name="tag" maxLength={80} defaultValue={course?.tag} />
      </Field>
      <StatusInput
        options={states.content}
        current={course?.status ?? "draft"}
      />
      <Field label="Descripción" wide>
        <textarea
          name="description"
          maxLength={2000}
          defaultValue={course?.description}
        />
      </Field>
      <Save />
    </BaseForm>
  );
}
function SearchForm({
  search,
  student = false,
}: {
  search: Search;
  student?: boolean;
}) {
  return (
    <form method="get" className={css.form}>
      <Field label={student ? "Buscar alumno" : "Buscar taller"}>
        <input
          name="q"
          defaultValue={value(search, "q")}
          maxLength={100}
          placeholder="Nombre o categoría"
        />
      </Field>
      <Field label="Filtrar estado">
        <select name="status" defaultValue={value(search, "status")}>
          <option value="">Todos</option>
          {(student ? states.student : states.content).map((s) => (
            <option key={s} value={s}>
              {labels[s]}
            </option>
          ))}
        </select>
      </Field>
      <button className={ui.secondaryLink}>Buscar</button>
    </form>
  );
}
function CoursesAdmin({
  slug,
  data,
  search,
}: {
  slug: string;
  data: AcademicData;
  search: Search;
}) {
  const q = normalizeSearch(value(search, "q")),
    status = value(search, "status");
  const courses = data.courses.filter(
    (c) =>
      (!status || c.status === status) &&
      normalizeSearch(c.title + " " + c.tag).includes(q),
  );
  return (
    <>
      <section className={css.section}>
        <h2>Crear taller</h2>
        <CourseForm slug={slug} />
      </section>
      <SearchForm search={search} />
      {!courses.length && (
        <Empty>
          No hay talleres que coincidan con la búsqueda. Crea el primero arriba.
        </Empty>
      )}
      {courses.map((c) => (
        <article className={css.section} key={c.id}>
          <Status status={c.status} />
          <h2>{c.title}</h2>
          <p>{c.description || "Sin descripción."}</p>
          <p className={css.hint}>
            {c.tag} · {c.slug}
          </p>
          <Link href={"/o/" + slug + "/admin/matriculas?course=" + c.id}>
            Ver matrículas
          </Link>
          <details>
            <summary>Detalles y edición</summary>
            <CourseForm slug={slug} course={c} />
          </details>
        </article>
      ))}
    </>
  );
}
function StudentsAdmin({
  slug,
  data,
  search,
}: {
  slug: string;
  data: AcademicData;
  search: Search;
}) {
  const q = normalizeSearch(value(search, "q")),
    status = value(search, "status");
  const students = data.memberships.filter(
    (m) =>
      m.role === "student" &&
      (!status || m.status === status) &&
      normalizeSearch(name(m) + " " + (m.contact_email ?? "")).includes(q),
  );
  return (
    <>
      <p className={css.hint}>
        Se gestionan alumnos existentes. Crear credenciales y vincular nuevas
        cuentas sigue siendo un procedimiento administrativo pendiente.
      </p>
      <SearchForm search={search} student />
      {!students.length && (
        <Empty>No hay alumnos que coincidan con la búsqueda.</Empty>
      )}
      {!!students.length && (
        <div className={css.tableWrap}>
          <table className={css.table}>
            <caption>Alumnos de la organización</caption>
            <thead>
              <tr>
                <th scope="col">Alumno</th>
                <th scope="col">Estado</th>
                <th scope="col">Matrículas</th>
                <th scope="col">Gestión</th>
              </tr>
            </thead>
            <tbody>
              {students.map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{name(m)}</strong>
                    <p className={css.hint}>
                      {m.contact_email ?? "Sin correo de contacto"}
                    </p>
                  </td>
                  <td>
                    <Status status={m.status} />
                  </td>
                  <td>
                    {
                      data.enrollments.filter((e) => e.membership_id === m.id)
                        .length
                    }
                  </td>
                  <td>
                    {" "}
                    <details>
                      <summary>Ficha y datos del alumno</summary>
                      <p className={css.hint}>
                        Ingreso: {date(m.joined_at)}. Los datos de contacto no
                        cambian las credenciales de acceso.
                      </p>
                      <BaseForm
                        slug={slug}
                        action="student"
                        id={m.id}
                        version={m.row_version}
                      >
                        <Field label="Nombres">
                          <input
                            name="first_name"
                            required
                            maxLength={100}
                            defaultValue={m.first_name}
                          />
                        </Field>
                        <Field label="Apellidos">
                          <input
                            name="last_name"
                            maxLength={100}
                            defaultValue={m.last_name}
                          />
                        </Field>
                        <Field label="Correo de contacto (opcional)">
                          <input
                            type="email"
                            name="contact_email"
                            maxLength={254}
                            defaultValue={m.contact_email ?? ""}
                          />
                        </Field>
                        <Save />
                      </BaseForm>
                      <BaseForm
                        slug={slug}
                        action="student-status"
                        id={m.id}
                        version={m.row_version}
                      >
                        <StatusInput
                          options={states.student}
                          current={m.status}
                        />
                        <Save />
                      </BaseForm>
                      <h3>Matrículas</h3>
                      {data.enrollments
                        .filter((e) => e.membership_id === m.id)
                        .map((e) => (
                          <p key={e.id}>
                            {data.courses.find((c) => c.id === e.course_id)
                              ?.title ?? "Taller no disponible"}{" "}
                            · {labels[e.status]}
                          </p>
                        ))}
                      {!data.enrollments.some(
                        (e) => e.membership_id === m.id,
                      ) && <Empty>Sin matrículas.</Empty>}
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
function EnrollmentsAdmin({
  slug,
  data,
  search,
}: {
  slug: string;
  data: AcademicData;
  search: Search;
}) {
  const students = data.memberships.filter(
    (m) => m.role === "student" && m.status === "active",
  );
  const selected = value(search, "course"),
    enrollments = data.enrollments.filter(
      (e) => !selected || e.course_id === selected,
    );
  return (
    <>
      <section className={css.section}>
        <h2>Inscribir alumno existente</h2>
        <BaseForm slug={slug} action="enrollment">
          <CourseSelect data={data} selected={selected} />
          <Field label="Alumno activo">
            <select name="membership_id" defaultValue="" required>
              <option value="" disabled>
                Selecciona un alumno
              </option>
              {students.map((m) => (
                <option key={m.id} value={m.id}>
                  {name(m)}
                </option>
              ))}
            </select>
          </Field>
          <Save disabled={!students.length || !data.courses.length} />
        </BaseForm>
        <p className={css.hint}>
          Cada alumno tiene una sola matrícula por taller. Una matrícula
          cancelada o pausada se modifica desde su ficha; no se reemplaza ni se
          elimina.
        </p>
      </section>
      {selected && (
        <Link href={"/o/" + slug + "/admin/matriculas"}>
          Ver todas las matrículas
        </Link>
      )}
      {!enrollments.length && <Empty>No hay matrículas para mostrar.</Empty>}
      {!!enrollments.length && (
        <div className={css.tableWrap}>
          <table className={css.table}>
            <caption>Matrículas de la organización</caption>
            <thead>
              <tr>
                <th scope="col">Alumno / taller</th>
                <th scope="col">Estado</th>
                <th scope="col">Avance</th>
                <th scope="col">Gestión</th>
              </tr>
            </thead>
            <tbody>
              {enrollments.map((e) => {
                const student = data.memberships.find(
                  (m) => m.id === e.membership_id,
                );
                return (
                  <tr key={e.id}>
                    <td>
                      <strong>
                        {student ? name(student) : "Alumno no disponible"}
                      </strong>
                      <p>
                        {data.courses.find((c) => c.id === e.course_id)
                          ?.title ?? "Taller no disponible"}
                      </p>
                      <p className={css.hint}>
                        Inscripción: {date(e.enrolled_at)}
                      </p>
                    </td>
                    <td>
                      <Status status={e.status} />
                    </td>
                    <td>{e.progress_percent ?? 0}%</td>
                    <td>
                      {" "}
                      <details>
                        <summary>Editar estado y avance</summary>
                        <BaseForm
                          slug={slug}
                          action="enrollment"
                          id={e.id}
                          version={e.row_version}
                        >
                          <StatusInput
                            options={states.enrollment}
                            current={e.status}
                          />
                          <Field label="Avance (%)">
                            <input
                              name="progress_percent"
                              type="number"
                              min={0}
                              max={100}
                              step="0.01"
                              defaultValue={e.progress_percent ?? 0}
                            />
                          </Field>
                          <Save />
                        </BaseForm>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
function MaterialForm({
  slug,
  data,
  item,
}: {
  slug: string;
  data: AcademicData;
  item?: AcademicData["materials"][number];
}) {
  return (
    <BaseForm
      slug={slug}
      action="material"
      id={item?.id}
      version={item?.row_version}
    >
      <CourseSelect data={data} current={item?.course_id} />
      <Field label="Título">
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={item?.title}
        />
      </Field>
      <StatusInput options={states.content} current={item?.status ?? "draft"} />
      <Field label="Tipo de recurso">
        <select
          name="source"
          defaultValue={item?.file_asset_id ? "pdf" : "link"}
        >
          <option value="link">Enlace externo</option>
          <option value="pdf">PDF privado ya disponible</option>
        </select>
      </Field>
      <Field label="Enlace HTTPS (si elegiste enlace)">
        <input
          type="url"
          name="external_url"
          maxLength={2000}
          defaultValue={item?.external_url ?? ""}
          placeholder="https://www.youtube.com/watch?v=..."
        />
      </Field>
      <Field label="PDF del mismo taller (si elegiste PDF)">
        <select name="file_asset_id" defaultValue={item?.file_asset_id ?? ""}>
          <option value="">Selecciona un PDF listo</option>
          {data.files
            .filter((f) => !item || f.course_id === item.course_id)
            .map((f) => (
              <option key={f.id} value={f.id}>
                {data.courses.find((c) => c.id === f.course_id)?.title} ·{" "}
                {f.original_name}
              </option>
            ))}
        </select>
      </Field>
      <Save disabled={!data.courses.length} />
    </BaseForm>
  );
}
function Materials({
  slug,
  data,
  admin,
}: {
  slug: string;
  data: AcademicData;
  admin: boolean;
}) {
  return (
    <>
      {admin && (
        <section className={css.section}>
          <h2>Publicar material</h2>
          <p className={css.hint}>
            Enlaces admitidos: YouTube, Vimeo, Drive, Docs, Meet y Zoom. No se
            alojan videos. Los PDF se descargan desde Storage privado; subirlos
            requiere habilitar el flujo de carga posteriormente.
          </p>
          <MaterialForm slug={slug} data={data} />
        </section>
      )}
      {!data.materials.length && <Empty>No hay materiales disponibles.</Empty>}
      {data.materials.map((m) => (
        <article className={css.card} key={m.id}>
          <h3>{m.title}</h3>
          <p className={css.hint}>
            {data.courses.find((c) => c.id === m.course_id)?.title}
          </p>
          {admin && <Status status={m.status} />}
          <div className={css.row}>
            {m.external_url && resourceUrl(m.external_url) && (
              <a
                href={resourceUrl(m.external_url)!}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir enlace
              </a>
            )}
            {m.file_asset_id && (
              <a href={"/o/" + slug + "/archivos/" + m.file_asset_id}>
                Descargar PDF privado
              </a>
            )}
          </div>
          {admin && (
            <details>
              <summary>Editar material</summary>
              <MaterialForm slug={slug} data={data} item={m} />
            </details>
          )}
        </article>
      ))}
    </>
  );
}
function AnnouncementForm({
  slug,
  data,
  item,
}: {
  slug: string;
  data: AcademicData;
  item?: AcademicData["announcements"][number];
}) {
  return (
    <BaseForm
      slug={slug}
      action="announcement"
      id={item?.id}
      version={item?.row_version}
    >
      <CourseSelect data={data} current={item?.course_id} />
      <Field label="Título">
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={item?.title}
        />
      </Field>
      <StatusInput options={states.content} current={item?.status ?? "draft"} />
      <Field label="Comunicado" wide>
        <textarea
          name="body"
          required
          maxLength={2000}
          defaultValue={item?.body}
        />
      </Field>
      <Save disabled={!data.courses.length} />
    </BaseForm>
  );
}
function Announcements({
  slug,
  data,
  admin,
}: {
  slug: string;
  data: AcademicData;
  admin: boolean;
}) {
  return (
    <>
      {admin && (
        <section className={css.section}>
          <h2>Crear comunicado</h2>
          <p className={css.hint}>
            Los avisos se dirigen a los alumnos del taller seleccionado.
            Publicar establece la fecha de disponibilidad.
          </p>
          <AnnouncementForm slug={slug} data={data} />
        </section>
      )}
      {!data.announcements.length && <Empty>No hay avisos disponibles.</Empty>}
      {data.announcements.map((a) => (
        <article className={css.card} key={a.id}>
          <h3>{a.title}</h3>
          <p className={css.hint}>
            {data.courses.find((c) => c.id === a.course_id)?.title} ·{" "}
            {date(a.published_at)}
          </p>
          {admin && <Status status={a.status} />}
          <p>{a.body}</p>
          {admin && (
            <details>
              <summary>Editar aviso</summary>
              <AnnouncementForm slug={slug} data={data} item={a} />
            </details>
          )}
        </article>
      ))}
    </>
  );
}
function EventForm({
  slug,
  data,
  item,
}: {
  slug: string;
  data: AcademicData;
  item?: AcademicData["events"][number];
}) {
  return (
    <BaseForm
      slug={slug}
      action="event"
      id={item?.id}
      version={item?.row_version}
    >
      <CourseSelect data={data} current={item?.course_id} />
      <Field label="Actividad">
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={item?.title}
        />
      </Field>
      <Field label="Inicio · hora de Lima">
        <input
          type="datetime-local"
          name="starts_at"
          required
          defaultValue={item ? localInput(item.starts_at) : undefined}
        />
      </Field>
      <Field label="Fin · hora de Lima">
        <input
          type="datetime-local"
          name="ends_at"
          required
          defaultValue={item ? localInput(item.ends_at) : undefined}
        />
      </Field>
      {item && <StatusInput options={states.event} current={item.status} />}
      <Save disabled={!data.courses.length} />
    </BaseForm>
  );
}
function Calendar({
  slug,
  data,
  admin,
}: {
  slug: string;
  data: AcademicData;
  admin: boolean;
}) {
  return (
    <>
      {admin && (
        <section className={css.section}>
          <h2>Registrar actividad</h2>
          <p className={css.hint}>
            Agenda única de la organización, por taller. Se asigna a los alumnos
            activos matriculados al guardar. Usa “Actualizar participantes” para
            incorporar nuevas matrículas a una actividad existente. Horario de
            Lima (UTC−05).
          </p>
          <EventForm slug={slug} data={data} />
        </section>
      )}
      {!data.events.length && (
        <Empty>No hay actividades académicas disponibles.</Empty>
      )}
      {data.events.map((e) => (
        <article className={css.card} key={e.id}>
          <h3>{e.title}</h3>
          <p>
            {date(e.starts_at)} — {date(e.ends_at)}
          </p>
          <p className={css.hint}>
            {data.courses.find((c) => c.id === e.course_id)?.title} · Hora de
            Lima
          </p>
          <Status status={e.status} />
          {admin && (
            <details>
              <summary>Editar actividad y participantes</summary>
              <EventForm slug={slug} data={data} item={e} />
              <BaseForm
                slug={slug}
                action="event-attendees"
                id={e.id}
                version={e.row_version}
              >
                <button className={ui.secondaryLink}>
                  Actualizar participantes desde matrículas activas
                </button>
              </BaseForm>
            </details>
          )}
        </article>
      ))}
    </>
  );
}
export function AcademicView({
  slug,
  section,
  data,
  profileId,
  search = {},
  courseId,
}: {
  slug: string;
  section: string;
  data: AcademicData;
  profileId: string;
  search?: Search;
  courseId?: string;
}) {
  const admin = section.startsWith("admin"),
    own = data.memberships.find((m) => m.profile_id === profileId);
  if (section === "admin/cursos")
    return <CoursesAdmin slug={slug} data={data} search={search} />;
  if (section === "admin/alumnos")
    return <StudentsAdmin slug={slug} data={data} search={search} />;
  if (section === "admin/matriculas")
    return <EnrollmentsAdmin slug={slug} data={data} search={search} />;
  if (section.endsWith("/materiales"))
    return <Materials slug={slug} data={data} admin={admin} />;
  if (section.endsWith("/avisos"))
    return <Announcements slug={slug} data={data} admin={admin} />;
  if (section.endsWith("/calendario"))
    return <Calendar slug={slug} data={data} admin={admin} />;
  if (section === "dashboard/perfil")
    return (
      <section className={css.section}>
        <h2>{own ? name(own) : "Mi perfil"}</h2>
        <p>Contacto: {own?.contact_email ?? "Sin correo de contacto"}</p>
        <p>Organización: {slug}</p>
        <p>Estado: {own ? labels[own.status] : ""}</p>
        <p className={css.hint}>
          Si necesitas corregir tus datos, solicita el cambio al administrador.
          No se cambian credenciales desde este módulo.
        </p>
      </section>
    );
  if (section === "dashboard/cursos") {
    if (courseId) {
      const c = data.courses.find((c) => c.id === courseId);
      if (!c) return <Empty>Taller no disponible.</Empty>;
      const subset = {
        ...data,
        materials: data.materials.filter((m) => m.course_id === c.id),
        announcements: data.announcements.filter((a) => a.course_id === c.id),
        events: data.events.filter((e) => e.course_id === c.id),
      };
      const enrollment = data.enrollments.find(
        (e) => e.course_id === c.id && e.membership_id === own?.id,
      );
      return (
        <>
          <Link href={"/o/" + slug + "/dashboard/cursos"}>
            Volver a mis talleres
          </Link>
          <section className={css.section}>
            <h2>{c.title}</h2>
            <p>{c.description || "Sin descripción."}</p>
            {enrollment && (
              <p>
                Avance: {enrollment.progress_percent ?? 0}% ·{" "}
                {labels[enrollment.status]}
              </p>
            )}
          </section>
          <section className={css.section}>
            <h2>Materiales del taller</h2>
            <Materials slug={slug} data={subset} admin={false} />
          </section>
          <section className={css.section}>
            <h2>Avisos del taller</h2>
            <Announcements slug={slug} data={subset} admin={false} />
          </section>
          <section className={css.section}>
            <h2>Actividades del taller</h2>
            <Calendar slug={slug} data={subset} admin={false} />
          </section>
        </>
      );
    }
    return (
      <>
        {!data.courses.length && (
          <Empty>
            No tienes talleres disponibles. El administrador debe matricularte y
            publicar el taller.
          </Empty>
        )}
        {data.courses.map((c) => (
          <article key={c.id} className={css.section}>
            <h2>{c.title}</h2>
            <p>{c.description || "Sin descripción."}</p>
            <Link
              className={ui.secondaryLink}
              href={"/o/" + slug + "/dashboard/cursos/" + c.id}
            >
              Ver taller y materiales
            </Link>
          </article>
        ))}
      </>
    );
  }
  return (
    <>
      <p>
        {admin
          ? "Gestiona la información académica de tu organización."
          : "Hola, " +
            (own ? name(own) : "estudiante") +
            ". Aquí encontrarás tus talleres y actividades."}
      </p>
      <div className={css.metrics}>
        {(admin
          ? [
              [
                data.memberships.filter((m) => m.role === "student").length,
                "Alumnos",
                "admin/alumnos",
              ],
              [data.courses.length, "Talleres", "admin/cursos"],
              [data.enrollments.length, "Matrículas", "admin/matriculas"],
            ]
          : [
              [data.courses.length, "Mis talleres", "dashboard/cursos"],
              [data.materials.length, "Materiales", "dashboard/materiales"],
              [data.announcements.length, "Avisos", "dashboard/avisos"],
            ]
        ).map(([count, label, path]) => (
          <Link key={path} href={"/o/" + slug + "/" + path}>
            <strong>{count}</strong>
            {label}
          </Link>
        ))}
      </div>
      {admin && (
        <section className={css.section}>
          <h2>Prepara tu espacio académico</h2>
          <p className={css.hint}>
            Publica un taller, matricula a un alumno y comparte sus primeros
            contenidos.
          </p>
          <ol className={css.steps}>
            <li>
              <Link href={"/o/" + slug + "/admin/cursos"}>
                Crear y publicar un taller
              </Link>
            </li>
            <li>
              <Link href={"/o/" + slug + "/admin/matriculas"}>
                Matricular a un alumno existente
              </Link>
            </li>
            <li>
              <Link href={"/o/" + slug + "/admin/materiales"}>
                Publicar un material por enlace
              </Link>
            </li>
            <li>
              <Link href={"/o/" + slug + "/admin/avisos"}>
                Compartir un aviso del taller
              </Link>
            </li>
          </ol>
        </section>
      )}
      {!admin && (
        <>
          <h2>Avisos recientes</h2>
          <Announcements
            slug={slug}
            data={{ ...data, announcements: data.announcements.slice(0, 3) }}
            admin={false}
          />
        </>
      )}
    </>
  );
}
const titles: Record<string, string> = {
  admin: "Resumen administrativo",
  "admin/cursos": "Talleres",
  "admin/alumnos": "Alumnos",
  "admin/matriculas": "Matrículas",
  "admin/materiales": "Materiales",
  "admin/avisos": "Avisos",
  "admin/calendario": "Calendario",
  dashboard: "Mi espacio",
  "dashboard/cursos": "Mis talleres",
  "dashboard/materiales": "Materiales",
  "dashboard/avisos": "Avisos",
  "dashboard/calendario": "Calendario",
  "dashboard/perfil": "Mi perfil",
};
export async function AcademicPage({
  slug,
  section,
  search = {},
  courseId,
}: Props) {
  const admin = section.startsWith("admin"),
    role = admin ? "admin" : "student",
    title = titles[section] ?? "Sistema Alumnos";
  const access = await organizationAccess(slug, role);
  if (
    !access.allowed ||
    !access.membership ||
    access.session.status !== "authenticated" ||
    !access.session.identity
  )
    return (
      <ProtectedModule
        slug={slug}
        role={role}
        title={title}
        section={section}
      />
    );
  let data: AcademicData;
  try {
    data = await loadAcademic(
      await createServerSupabaseClient(),
      access.membership.organizationId,
    );
  } catch {
    return (
      <AcademicShell
        slug={slug}
        name={access.membership.name}
        admin={admin}
        section={section}
      >
        <PageHeading
          eyebrow="INFORMACIÓN ACADÉMICA"
          title={title}
          description="No se pudieron cargar los datos."
        />
        <Empty>
          No se pudo consultar la información. Recarga la página o inténtalo más
          tarde.
        </Empty>
      </AcademicShell>
    );
  }
  if (
    courseId &&
    (!uuid(courseId) || !data.courses.some((c) => c.id === courseId))
  )
    notFound();
  const notice = value(search, "notice");
  return (
    <AcademicShell
      slug={slug}
      name={access.membership.name}
      admin={admin}
      section={section}
    >
      <PageHeading
        eyebrow={admin ? "ADMINISTRACIÓN" : "ESPACIO DEL ALUMNO"}
        title={title}
        description={
          admin
            ? "Información de la organización seleccionada."
            : "Contenido disponible según tus matrículas."
        }
      />
      {Object.hasOwn(noticeText, notice) && (
        <p
          role={notice === "saved" ? "status" : "alert"}
          className={notice === "saved" ? css.success : css.error}
        >
          {noticeText[notice]}
        </p>
      )}
      <AcademicView
        slug={slug}
        section={section}
        data={data}
        profileId={access.session.identity.profileId}
        search={search}
        {...(courseId ? { courseId } : {})}
      />
    </AcademicShell>
  );
}
