import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowLeftRight,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Award,
  FolderOpen,
  LayoutDashboard,
  Megaphone,
  ShieldCheck,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { VerifiedMembership } from "@/lib/authorization/access";
import {
  hasStaffPermission,
  staffModuleKeys,
  staffModules,
  staffRanks,
} from "@/lib/authorization/staff";
import { LogoutForm } from "@/features/auth/components/auth-form";
import { WorkspaceMobileNav } from "./workspace-mobile-nav";
import {
  CampusHeader,
  OrganizationIdentity,
} from "@/components/institutional/identity";
import campus from "@/components/institutional/campus.module.css";
import css from "./academic.module.css";
const icons: Record<string, LucideIcon> = {
  admin: LayoutDashboard,
  "admin/alumnos": Users,
  "admin/cursos": BookOpen,
  "admin/matriculas": ClipboardList,
  "admin/materiales": FolderOpen,
  "admin/avisos": Megaphone,
  "admin/horario": CalendarDays,
  "admin/asistencia": ClipboardCheck,
  "admin/administradores": ShieldCheck,
  dashboard: LayoutDashboard,
  "dashboard/cursos": BookOpen,
  "dashboard/materiales": FolderOpen,
  "dashboard/avisos": Megaphone,
  "dashboard/horario": CalendarDays,
  "dashboard/asistencia": ClipboardCheck,
  "dashboard/perfil": UserRound,
  "dashboard/certificados": Award,
};
export function AcademicShell({
  slug,
  name,
  admin,
  section,
  membership,
  children,
}: {
  slug: string;
  name: string;
  admin: boolean;
  section: string;
  membership?: VerifiedMembership;
  children: ReactNode;
}) {
  const links: [string, string][] = admin
    ? [
        ["admin", "Resumen"],
        ...staffModuleKeys
          .filter((key) => membership && hasStaffPermission(membership, key))
          .map(
            (key): [string, string] => [
              staffModules[key].path,
              staffModules[key].label,
            ],
          ),
        ...(membership && hasStaffPermission(membership, "staff.manage")
          ? [["admin/administradores", "Administradores"] as [string, string]]
          : []),
      ]
    : [
        ["dashboard", "Mi espacio"],
        ["dashboard/cursos", "Mis talleres"],
        ["dashboard/materiales", "Materiales"],
        ["dashboard/avisos", "Avisos"],
        ["dashboard/horario", "Mi horario"],
        ["dashboard/asistencia", "Mi asistencia"],
        ["dashboard/certificados", "Certificados"],
        ["dashboard/perfil", "Mi perfil"],
      ];
  return (
    <div className={campus.page}>
      <div className={css.workspaceShell}>
        <aside className={css.desktopSidebar}>
          <Link className={css.desktopBrand} href={"/o/" + encodeURIComponent(slug) + (admin ? "/admin" : "/dashboard")}>
            <span className={css.desktopBrandMark} aria-hidden="true">S</span>
            <strong>Sistema Alumnos</strong>
          </Link>
          <div className={css.desktopIdentity}>
            <span className={css.desktopAvatar} aria-hidden="true">
              {name.trim().slice(0, 1).toUpperCase() || "U"}
            </span>
            <div>
              <strong>{name}</strong>
              <small>
                {admin
                  ? membership?.staffRank
                    ? staffRanks[membership.staffRank]
                    : "Administración"
                  : "Espacio del alumno"}
              </small>
            </div>
          </div>
          <nav className={css.desktopLinks} aria-label={admin ? "Administración" : "Alumno"}>
            {links.map(([path, label]) => {
              const Icon = icons[path] ?? BookOpen;
              const active = section === path;
              return (
                <Link
                  key={path}
                  href={"/o/" + encodeURIComponent(slug) + "/" + path}
                  className={active ? css.desktopLinkActive : undefined}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={19} aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
          <div className={css.desktopLogout}>
            <LogoutForm />
          </div>
        </aside>
        <div className={css.workspaceContent}>
          <CampusHeader>
            <div className={css.headerActions}>
              <span className={css.role}>
                {admin
                  ? membership?.staffRank
                    ? staffRanks[membership.staffRank]
                    : "Administración"
                  : "Espacio del alumno"}
              </span>
              {admin && (
                <Link href="/auth/mfa">
                  <ShieldCheck size={16} aria-hidden="true" /> Seguridad MFA
                </Link>
              )}
            </div>
          </CampusHeader>
          <WorkspaceMobileNav
            slug={slug}
            name={name}
            admin={admin}
            section={section}
            links={links}
            logout={<LogoutForm />}
          />
          <div className={css.organizationBar}>
            <OrganizationIdentity
              slug={slug}
              name={name}
              detail={admin ? "Gestión académica" : "Tu organización"}
            />
            <Link href="/seleccionar-organizacion">
              <ArrowLeftRight size={15} aria-hidden="true" /> Cambiar organización
            </Link>
          </div>
          <main
            id="main-content"
            className={css.main}
            data-access-state="authorized"
          >
            {children}
          </main>
          <footer className={css.footer}>
            Sistema Alumnos <span>Aprendizaje, comunidad y propósito.</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
