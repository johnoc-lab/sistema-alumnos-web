import Link from "next/link";
import type { ReactNode } from "react";
import { Orbit, Building2 } from "lucide-react";
import { LogoutForm } from "@/features/auth/components/auth-form";
import styles from "@/components/layouts/preview-shell.module.css";
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
    <div>
      <aside className={styles.sidebar} style={{ top: 0 }}>
        <Link
          className={styles.brand}
          href={"/o/" + slug + "/" + (admin ? "admin" : "dashboard")}
        >
          <div className={styles.brandIcon}>
            <Orbit size={23} />
          </div>
          <div>
            <strong>{name}</strong>
            <small>SISTEMA ALUMNOS</small>
          </div>
        </Link>
        <Link className={styles.org} href="/seleccionar-organizacion">
          <Building2 size={15} />
          Cambiar organización
        </Link>
        <p className={styles.navLabel}>
          {admin ? "ADMINISTRACIÓN" : "ESPACIO DEL ALUMNO"}
        </p>
        <nav
          className={styles.nav}
          aria-label={admin ? "Administración" : "Alumno"}
        >
          {links.map(([path, label]) => (
            <Link
              key={path}
              href={"/o/" + slug + "/" + path}
              className={section === path ? styles.active : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className={styles.sideBottom}>
          {admin && <Link href="/auth/mfa">Seguridad MFA</Link>}
          <LogoutForm />
        </div>
      </aside>
      <div className={styles.workspace}>
        <header className={styles.header}>
          <span>{name}</span>
          <div className={styles.headerRight}>
            <span>
              {admin ? "Panel administrativo" : "Dashboard del alumno"}
            </span>
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
