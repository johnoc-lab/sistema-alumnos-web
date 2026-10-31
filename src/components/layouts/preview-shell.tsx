import Link from "next/link";
import type { ReactNode } from "react";
import {
  Orbit,
  Building2,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  BookOpen,
  CalendarDays,
  UserRound,
  Users,
  Layers3,
  Video,
  MessageSquare,
  FolderOpen,
  Award,
  ArrowUpRight,
  LogOut,
  Eye,
} from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { previewHref, type Section } from "@/features/preview/routes";
import type { PreviewOrganization } from "@/features/preview/fixtures";
import styles from "./preview-shell.module.css";
const studentNav = [
  { section: "dashboard", label: "Mi espacio", icon: LayoutDashboard },
  { section: "dashboard/cursos", label: "Mis talleres", icon: BookOpen },
  {
    section: "dashboard/calendario",
    label: "Mi calendario",
    icon: CalendarDays,
  },
  { section: "dashboard/perfil", label: "Mi perfil", icon: UserRound },
] as const;
const adminNav = [
  { section: "admin", label: "Resumen", icon: LayoutDashboard },
  { section: "admin/alumnos", label: "Alumnos", icon: Users },
  { section: "admin/cursos", label: "Talleres", icon: Layers3 },
  { section: "admin/clases", label: "Clases", icon: Video },
  { section: "admin/avisos", label: "Tablón de avisos", icon: MessageSquare },
  { section: "admin/materiales", label: "Materiales", icon: FolderOpen },
  { section: "admin/calendario", label: "Calendario", icon: CalendarDays },
  { section: "admin/certificados", label: "Certificados", icon: Award },
] as const;
export function DemoBanner() {
  return (
    <div className={styles.demoBar}>
      <Eye size={14} />
      <strong>DEMOSTRACIÓN</strong>
      <span>Datos ficticios · Sin autenticación ni operaciones reales</span>
      <Link href="/login">Salir de la demo</Link>
    </div>
  );
}
export function PreviewShell({
  organization,
  section,
  children,
}: {
  organization: PreviewOrganization;
  section: Section;
  children: ReactNode;
}) {
  const isAdmin = section.startsWith("admin");
  const items = isAdmin ? adminNav : studentNav;
  return (
    <div data-preview="synthetic">
      <DemoBanner />
      <aside className={styles.sidebar}>
        <Link className={styles.brand} href="/demo">
          <div className={styles.brandIcon}>
            <Orbit size={23} strokeWidth={1.3} />
          </div>
          <div>
            <strong>{organization.name}</strong>
            <small>ACADEMY · DEMO</small>
          </div>
        </Link>
        <Link href="/demo" className={styles.org}>
          <Building2 size={14} />
          {organization.shortName}
          <ChevronDown size={12} />
        </Link>
        <p className={styles.navLabel}>
          {isAdmin ? "VISTA ADMINISTRATIVA" : "ESPACIO DEL ALUMNO"}
        </p>
        <nav
          className={styles.nav}
          aria-label={
            isAdmin ? "Demostración administrativa" : "Demostración del alumno"
          }
        >
          {items.map((item) => (
            <Link
              key={item.section}
              className={section === item.section ? styles.active : ""}
              href={previewHref(organization.slug, item.section)}
              aria-current={section === item.section ? "page" : undefined}
            >
              <item.icon size={18} strokeWidth={1.6} />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className={styles.sideBottom}>
          <Link
            className={styles.switch}
            href={previewHref(
              organization.slug,
              isAdmin ? "dashboard" : "admin",
            )}
          >
            {isAdmin ? "Ver diseño de alumno" : "Ver diseño de Admin"}
            <ArrowUpRight size={14} />
          </Link>
          <div className={styles.user}>
            <div className={styles.avatar}>{isAdmin ? "AD" : "DE"}</div>
            <div>
              <strong>
                {isAdmin ? "Admin de ejemplo" : "Alumno de ejemplo"}
              </strong>
              <span>Sin sesión iniciada</span>
            </div>
            <Link aria-label="Salir de la demostración" href="/login">
              <LogOut size={16} />
            </Link>
          </div>
        </div>
      </aside>
      <div className={styles.workspace}>
        <header className={styles.header}>
          <div className={styles.breadcrumb}>
            <span>{organization.shortName}</span>
            <ChevronRight size={12} />
            <strong>{isAdmin ? "Administración" : "Mi aprendizaje"}</strong>
          </div>
          <div className={styles.headerRight}>
            <span className={styles.headerNote}>FASE 03 / INTERFACES</span>
            <Badge tone={isAdmin ? "purple" : "cyan"}>
              {isAdmin ? "Diseño Admin" : "Diseño alumno"}
            </Badge>
          </div>
        </header>
        <main id="main-content" className={styles.main}>
          {children}
        </main>
        <footer className={styles.footer}>
          <span>{organization.name} · Espacio de aprendizaje</span>
          <span>PROTOTIPO LOCAL · SIN DATOS REALES</span>
        </footer>
      </div>
    </div>
  );
}
