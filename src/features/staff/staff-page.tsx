import type { ReactNode } from "react";
import { AcademicShell } from "@/features/academic/shell";
import { ProtectedModule } from "@/features/auth/components/protected-module";
import { PageHeading } from "@/components/ui/primitives";
import { organizationAccess } from "@/lib/auth/access.server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  isStaffRank,
  staffModuleKeys,
  staffModules,
  staffRanks,
  type StaffPermission,
  type StaffRank,
} from "@/lib/authorization/staff";
import { normalizeSearch } from "@/features/preview/presentation";
import { StaffPermissionFields } from "./permission-fields";
import academic from "@/features/academic/academic.module.css";
import ui from "@/components/ui/ui.module.css";
import css from "./staff.module.css";

export type StaffSearch = Record<string, string | string[] | undefined>;
type StaffMember = {
  id: string;
  name: string;
  identifier: string | null;
  rank: StaffRank;
  status: "active" | "suspended" | "archived";
  modules: StaffPermission[];
  version: number;
  self: boolean;
};
type PendingAssignment = { id: string; name: string; identifier: string };
type StaffData = { staff: StaffMember[]; pending: PendingAssignment[] };
const statusLabels = {
  active: "Activo",
  suspended: "Suspendido",
  archived: "Archivado",
} as const;
const notices: Record<string, string> = {
  linked: "Personal incorporado.",
  saved: "Cambios guardados.",
  stale:
    "La membresía cambió. Revisa sus datos actuales antes de volver a guardar.",
  failed:
    "No se pudo guardar. Verifica que el perfil y la asignación sigan vigentes.",
};
const field = (query: StaffSearch, key: string) =>
  typeof query[key] === "string" ? query[key] : "";

export async function StaffPage({
  slug,
  search,
}: {
  slug: string;
  search: StaffSearch;
}) {
  const section = "admin/administradores";
  const access = await organizationAccess(slug, "admin", "staff.manage");
  if (!access.allowed || !access.membership) {
    return (
      <ProtectedModule
        slug={slug}
        role="admin"
        title="Administradores"
        section={section}
      />
    );
  }
  let data: StaffData | null = null;
  try {
    const client = await createServerSupabaseClient();
    const result = await client.rpc("list_staff", {
      p_org: access.membership.organizationId,
    });
    if (!result.error) {
      const loaded = result.data as unknown as StaffData;
      if (Array.isArray(loaded?.staff) && Array.isArray(loaded?.pending))
        data = loaded;
    }
  } catch {
    // El estado de error evita presentar una lista vacía como si fuera un resultado válido.
  }
  return (
    <AcademicShell
      slug={slug}
      name={access.membership.name}
      admin
      section={section}
      membership={access.membership}
    >
      <PageHeading
        eyebrow="ADMINISTRACIÓN"
        title="Administradores"
        description="Gestiona el personal y sus permisos en esta organización."
      />
      {data ? (
        <StaffDirectory
          slug={slug}
          organization={access.membership.name}
          search={search}
          data={data}
        />
      ) : (
        <p className={academic.empty} role="alert">
          No se pudo consultar el personal. Vuelve a cargar esta página.
        </p>
      )}
    </AcademicShell>
  );
}

function StaffDirectory({
  slug,
  organization,
  search,
  data,
}: {
  slug: string;
  organization: string;
  search: StaffSearch;
  data: StaffData;
}) {
  const base = "/o/" + encodeURIComponent(slug) + "/admin/administradores";
  const post = base + "/acciones";
  const q = field(search, "q").slice(0, 100);
  const rank = field(search, "rank");
  const status = field(search, "status");
  const notice = field(search, "notice");
  const filtered = data.staff.filter(
    (member) =>
      (!isStaffRank(rank) || member.rank === rank) &&
      (!Object.hasOwn(statusLabels, status) || member.status === status) &&
      normalizeSearch(member.name + " " + (member.identifier ?? "")).includes(
        normalizeSearch(q),
      ),
  );
  return (
    <>
      {Object.hasOwn(notices, notice) && (
        <p
          role={notice === "failed" || notice === "stale" ? "alert" : "status"}
          className={
            notice === "failed" || notice === "stale"
              ? academic.error
              : academic.success
          }
        >
          {notices[notice]}
        </p>
      )}
      <details className={academic.section}>
        <summary className={ui.primaryLink}>Agregar personal</summary>
        {data.pending.length ? (
          <form className={css.form} method="post" action={post}>
            <input type="hidden" name="action" value="link" />
            <p>
              <strong>{organization}</strong>
            </p>
            <label className={academic.field}>
              Cuenta con asignación institucional verificada
              <select name="id" required defaultValue="">
                <option value="" disabled>
                  Selecciona una cuenta
                </option>
                {data.pending.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.identifier}
                  </option>
                ))}
              </select>
            </label>
            <StaffPermissionFields />
            <label className={academic.field}>
              Estado inicial
              <select name="status" defaultValue="active">
                <option value="active">Activo</option>
                <option value="suspended">Suspendido</option>
              </select>
            </label>
            <button type="submit" className={ui.primaryLink}>
              Incorporar personal
            </button>
          </form>
        ) : (
          <p className={academic.hint}>
            Un operador debe verificar la asignación institucional de la cuenta
            antes de incorporarla.
          </p>
        )}
      </details>

      <form className={css.filters} method="get" action={base}>
        <label className={academic.field}>
          Nombre o identificador
          <input type="search" name="q" defaultValue={q} maxLength={100} />
        </label>
        <label className={academic.field}>
          Rango
          <select name="rank" defaultValue={isStaffRank(rank) ? rank : ""}>
            <option value="">Todos</option>
            {Object.entries(staffRanks).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={academic.field}>
          Estado
          <select
            name="status"
            defaultValue={Object.hasOwn(statusLabels, status) ? status : ""}
          >
            <option value="">Todos</option>
            {Object.entries(statusLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={ui.secondaryLink}>
          Filtrar
        </button>
      </form>

      {filtered.length ? (
        <div
          className={academic.tableWrap}
          role="region"
          aria-label="Tabla de personal"
          tabIndex={0}
        >
          <table className={academic.table}>
            <caption>Personal de la organización</caption>
            <thead>
              <tr>
                <th scope="col">Nombre e identificador</th>
                <th scope="col">Rango</th>
                <th scope="col">Estado</th>
                <th scope="col">Módulos</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((member) => (
                <tr key={member.id}>
                  <td>
                    <strong>{member.name}</strong>
                    <p className={academic.hint}>
                      {member.identifier ?? "Sin identidad vinculada"}
                    </p>
                  </td>
                  <td>{staffRanks[member.rank]}</td>
                  <td>{statusLabels[member.status]}</td>
                  <td>
                    {member.rank === "principal"
                      ? "Todos"
                      : staffModuleKeys
                          .filter((key) => member.modules.includes(key))
                          .map((key) => staffModules[key].label)
                          .join(", ") || "Sin módulos"}
                    {member.modules.includes("certificates.recommend") && (
                      <p className={academic.hint}>
                        Puede recomendar certificados
                      </p>
                    )}
                    {member.modules.includes("certificates.approve") && (
                      <p className={academic.hint}>
                        Puede aprobar recomendaciones
                      </p>
                    )}
                  </td>
                  <td>
                    <StaffActions member={member} post={post} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={academic.empty} role="status">
          No hay personal que coincida con los filtros.
        </p>
      )}
    </>
  );
}

function StaffUpdateForm({
  member,
  post,
  status,
  children,
}: {
  member: StaffMember;
  post: string;
  status: StaffMember["status"];
  children: ReactNode;
}) {
  return (
    <form className={css.form} method="post" action={post}>
      <input type="hidden" name="action" value="update" />
      <input type="hidden" name="id" value={member.id} />
      <input type="hidden" name="version" value={member.version} />
      <input type="hidden" name="status" value={status} />
      {children}
    </form>
  );
}

function StaffActions({ member, post }: { member: StaffMember; post: string }) {
  if (member.self) return <span>Tu cuenta</span>;
  if (member.status === "archived") return <span>Archivado</span>;
  const active = member.status === "active";
  return (
    <div className={css.actions}>
      <details>
        <summary>Editar permisos</summary>
        <StaffUpdateForm member={member} post={post} status={member.status}>
          <StaffPermissionFields
            initialRank={member.rank}
            initialModules={member.modules}
          />
          <button type="submit" className={ui.primaryLink}>
            Guardar permisos
          </button>
        </StaffUpdateForm>
      </details>
      <StaffUpdateForm
        member={member}
        post={post}
        status={active ? "suspended" : "active"}
      >
        <input type="hidden" name="rank" value={member.rank} />
        {member.modules.map((module) => (
          <input type="hidden" name="module" key={module} value={module} />
        ))}
        <button type="submit" className={ui.secondaryLink}>
          {active ? "Suspender" : "Activar"}
        </button>
      </StaffUpdateForm>
    </div>
  );
}
