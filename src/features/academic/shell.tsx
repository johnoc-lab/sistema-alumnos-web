import Link from "next/link";
import type { ReactNode } from "react";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  ClipboardList,
  ClipboardCheck,
  FolderOpen,
  Megaphone,
  CalendarDays,
  UserRound,
  ShieldCheck,
  ArrowLeftRight,
  type LucideIcon,
} from "lucide-react";
import { LogoutForm } from "@/features/auth/components/auth-form";
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
  "dashboard/asistencia": ClipboardCheck,
  dashboard: LayoutDashboard,
  "dashboard/cursos": BookOpen,
  "dashboard/materiales": FolderOpen,
  "dashboard/avisos": Megaphone,
  "dashboard/horario": CalendarDays,
  "dashboard/perfil": UserRound,
};
export function AcademicShell({
  slug,
  name,
  admin,
  section,
  children,
}: {
  slug: string;
  name: string;
  admin: boolean;
  section: string;
  children: ReactNode;
}) {
  const links = admin
    ? [
        ["admin", "Resumen"],
        ["admin/alumnos", "Alumnos"],
        ["admin/cursos", "Talleres"],
        ["admin/matriculas", "Matrículas"],
        ["admin/materiales", "Materiales"],
        ["admin/avisos", "Avisos"],
        ["admin/horario", "Horario"],
        ["admin/asistencia", "Asistencia"],
      ]
    : [
        ["dashboard", "Mi espacio"],
        ["dashboard/cursos", "Mis talleres"],
        ["dashboard/materiales", "Materiales"],
        ["dashboard/avisos", "Avisos"],
        ["dashboard/horario", "Mi horario"],
        ["dashboard/asistencia", "Mi asistencia"],
        ["dashboard/perfil", "Mi perfil"],
      ];
  return (
    <div className={campus.page}>
      <CampusHeader>
        <div className={css.headerActions}>
          <span className={css.role}>
            {admin ? "Administración" : "Espacio del alumno"}
          </span>
          {admin && (
            <Link href="/auth/mfa">
              <ShieldCheck size={16} aria-hidden="true" /> Seguridad MFA
            </Link>
          )}
          <LogoutForm />
        </div>
      </CampusHeader>
      <div className={css.navigation}>
        <nav
          aria-label={admin ? "Administración" : "Alumno"}
          className={css.nav}
        >
          {links.map(([path, label]) => {
            const Icon = icons[path!] ?? BookOpen;
            return (
              <Link
                key={path}
                href={"/o/" + slug + "/" + path}
                className={section === path ? css.navActive : undefined}
                aria-current={section === path ? "page" : undefined}
              >
                <Icon size={17} aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
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
  );
}