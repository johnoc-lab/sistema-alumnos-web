import Link from "next/link";
import type { ReactNode } from "react";
import {
  Orbit,
  Building2,
  LayoutDashboard,
  Users,
  BookOpen,
  ClipboardList,
  FolderOpen,
  Megaphone,
  CalendarDays,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { LogoutForm } from "@/features/auth/components/auth-form";
import styles from "@/components/layouts/preview-shell.module.css";
import css from "./academic.module.css";
const icons: Record<string, LucideIcon> = {
  admin: LayoutDashboard,
  "admin/alumnos": Users,
  "admin/cursos": BookOpen,
  "admin/matriculas": ClipboardList,
  "admin/materiales": FolderOpen,
  "admin/avisos": Megaphone,
  "admin/calendario": CalendarDays,
  dashboard: LayoutDashboard,
  "dashboard/cursos": BookOpen,
  "dashboard/materiales": FolderOpen,
  "dashboard/avisos": Megaphone,
  "dashboard/calendario": CalendarDays,
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
        ["admin/calendario", "Calendario"],
      ]
    : [
        ["dashboard", "Mi espacio"],
        ["dashboard/cursos", "Mis talleres"],
        ["dashboard/materiales", "Materiales"],
        ["dashboard/avisos", "Avisos"],
        ["dashboard/calendario", "Calendario"],
        ["dashboard/perfil", "Mi perfil"],
      ];
  return (
    <div className={css.shell}>
      <aside className={styles.sidebar + " " + css.sidebar}>
        <Link
          className={styles.brand}
          href={"/o/" + slug + "/" + (admin ? "admin" : "dashboard")}
        >
          <div className={styles.brandIcon}>
            <Orbit size={23} />
          </div>
          <div>
            <strong>Sistema Alumnos</strong>
            <small>ESPACIO ACADÉMICO</small>
          </div>
        </Link>
        <Link
          className={styles.org + " " + css.organization}
          href="/seleccionar-organizacion"
        >
          <Building2 size={17} aria-hidden="true" />
          <span>
            <strong>{name}</strong>
            <small>Cambiar organización</small>
          </span>
        </Link>
        <p className={styles.navLabel}>
          {admin ? "ADMINISTRACIÓN" : "ESPACIO DEL ALUMNO"}
        </p>
        <nav
          className={styles.nav}
          aria-label={admin ? "Administración" : "Alumno"}
        >
          {links.map(([path, label]) => {
            const Icon = icons[path!] ?? BookOpen;
            return (
              <Link
                key={path}
                href={"/o/" + slug + "/" + path}
                className={section === path ? styles.active : undefined}
                aria-current={section === path ? "page" : undefined}
              >
                <Icon size={18} aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className={styles.sideBottom + " " + css.sideBottom}>
          <p>Un espacio para aprender y avanzar.</p>
          {admin && <Link href="/auth/mfa">Seguridad MFA</Link>}
        </div>
      </aside>
      <div className={styles.workspace}>
        <header className={styles.header + " " + css.header}>
          <div>
            <span className={css.hint}>
              {admin ? "Administración" : "Espacio del alumno"}
            </span>
            <strong>{name}</strong>
          </div>
          <div className={styles.headerRight + " " + css.headerActions}>
            {admin && <Link href="/auth/mfa">Seguridad MFA</Link>}
            <LogoutForm />
          </div>
        </header>
        <main
          id="main-content"
          className={styles.main}
          data-access-state="authorized"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
