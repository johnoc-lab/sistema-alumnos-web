"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FolderOpen,
  LayoutDashboard,
  Megaphone,
  Menu,
  ShieldCheck,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import css from "./workspace-mobile-nav.module.css";

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
};

export function WorkspaceMobileNav({
  slug,
  name,
  admin,
  section,
  links,
  logout,
}: {
  slug: string;
  name: string;
  admin: boolean;
  section: string;
  links: [string, string][];
  logout: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <div className={css.mobileNav}>
      <button
        className={css.menuButton}
        type="button"
        aria-label="Abrir menú de navegación"
        aria-expanded={open}
        aria-controls={open ? "workspace-mobile-drawer" : undefined}
        onClick={() => setOpen(true)}
      >
        <Menu size={22} aria-hidden="true" />
        <span>Menú</span>
      </button>
      {open && (
        <div className={css.scrim} onClick={() => setOpen(false)}>
          <aside
            id="workspace-mobile-drawer"
            className={css.drawer}
            aria-label={admin ? "Menú de administración" : "Menú del alumno"}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={css.drawerHeader}>
              <div className={css.brand}>
                <span className={css.brandMark} aria-hidden="true">S</span>
                <strong>Sistema Alumnos</strong>
              </div>
              <button
                className={css.closeButton}
                type="button"
                aria-label="Cerrar menú"
                onClick={() => setOpen(false)}
              >
                <X size={22} aria-hidden="true" />
              </button>
            </div>
            <div className={css.identity}>
              <span className={css.avatar} aria-hidden="true">
                {name.trim().slice(0, 1).toUpperCase() || "U"}
              </span>
              <div>
                <strong>{name}</strong>
                <small>{admin ? "Panel administrativo" : "Espacio del alumno"}</small>
              </div>
            </div>
            <nav aria-label={admin ? "Administración" : "Alumno"} className={css.links}>
              {links.map(([path, label]) => {
                const Icon = icons[path] ?? BookOpen;
                const active = section === path;
                return (
                  <Link
                    key={path}
                    href={`/o/${encodeURIComponent(slug)}/${path}`}
                    className={active ? css.active : undefined}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                  >
                    <Icon size={19} aria-hidden="true" />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className={css.logout}>{logout}</div>
          </aside>
        </div>
      )}
    </div>
  );
}

