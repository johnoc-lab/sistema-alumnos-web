import Link from "next/link";
import Image from "next/image";
import { Building2, GraduationCap } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./campus.module.css";

// Catálogo exclusivamente visual. Nunca resuelve roles, membresías o autorizaciones.
const logos: Readonly<Record<string, string>> = {
  impulso: "/brands/impulso-cero.png",
  "impulso-cero": "/brands/impulso-cero.png",
};
export function CampusBrand() {
  return (
    <span className={styles.brand}>
      <span className={styles.mark}>
        <GraduationCap size={25} aria-hidden="true" />
      </span>
      <span>
        <strong>Sistema Alumnos</strong>
        <small>CAMPUS DE APRENDIZAJE</small>
      </span>
    </span>
  );
}
export function CampusHeader({ children }: { children?: ReactNode }) {
  return (
    <header className={styles.header}>
      <Link
        href="/seleccionar-organizacion"
        aria-label="Sistema Alumnos, mis organizaciones"
      >
        <CampusBrand />
      </Link>
      {children}
    </header>
  );
}
export function OrganizationIdentity({
  slug,
  name,
  detail,
}: {
  slug: string;
  name: string;
  detail?: string;
}) {
  const logo = Object.hasOwn(logos, slug) ? logos[slug] : undefined;
  return (
    <span className={styles.organization}>
      {logo ? (
        <span className={styles.logo}>
          <Image
            src={logo}
            width={785}
            height={318}
            alt={"Logotipo de " + name}
            unoptimized
          />
        </span>
      ) : (
        <span className={styles.fallback} aria-hidden="true">
          <Building2 size={23} />
        </span>
      )}
      <span>
        <strong>{name}</strong>
        {detail && <small>{detail}</small>}
      </span>
    </span>
  );
}
