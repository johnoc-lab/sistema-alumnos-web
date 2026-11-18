"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ImpulsoBrand,
  usesImpulsoBrand,
} from "@/components/institutional/identity";
import type { ReactNode } from "react";
import {
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Award,
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
  "admin/certificados": Award,
  "admin/perfil": UserRound,
  dashboard: LayoutDashboard,
  "dashboard/cursos": BookOpen,
  "dashboard/materiales": FolderOpen,
  "dashboard/avisos": Megaphone,
  "dashboard/horario": CalendarDays,
  "dashboard/asistencia": ClipboardCheck,
  "dashboard/perfil": UserRound,
  "dashboard/certificados": Award,
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
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  function closeMenu() {
    dialog.current?.close();
    setOpen(false);
    menuButton.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const panel = dialog.current;
    if (panel && !panel.open) panel.showModal();
    closeButton.current?.focus();
    const desktop = window.matchMedia("(width > 760px)");
    function closeOnDesktop() {
      if (!desktop.matches) return;
      panel?.close();
      setOpen(false);
    }
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, [open]);

  return (
    <div className={css.mobileNav} data-organization={slug}>
      <button
        className={css.menuButton}
        ref={menuButton}
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
        <dialog
          ref={dialog}
          id="workspace-mobile-drawer"
          className={css.scrim + " " + css.menuDialog}
          aria-label={admin ? "Menú de administración" : "Menú del alumno"}
          onClick={closeMenu}
          onCancel={(event) => {
            event.preventDefault();
            closeMenu();
          }}
        >
          <aside
            className={css.drawer}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={css.drawerHeader}>
              <div className={css.brand}>
                {usesImpulsoBrand(slug) ? (
                  <ImpulsoBrand decorative />
                ) : (
                  <span className={css.brandMark} aria-hidden="true">S</span>
                )}
                <strong>Sistema Alumnos</strong>
              </div>
              <button
                className={css.closeButton}
                ref={closeButton}
                type="button"
                aria-label="Cerrar menú"
                onClick={closeMenu}
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
                    onClick={closeMenu}
                  >
                    <Icon size={19} aria-hidden="true" />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className={css.logout}>{logout}</div>
          </aside>
        </dialog>
      )}
    </div>
  );
}
