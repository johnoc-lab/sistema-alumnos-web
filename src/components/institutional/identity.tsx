import Link from "next/link";
import Image from "next/image";
import { Building2, GraduationCap } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./campus.module.css";

// Catálogo exclusivamente visual. Nunca resuelve roles, membresías o autorizaciones.
export function usesImpulsoBrand(slug: string) {
  return slug === "impulso" || slug === "impulso-cero";
}

export function ImpulsoBrand({
  prominent = false,
  decorative = false,
}: {
  prominent?: boolean;
  decorative?: boolean;
}) {
  const alt = decorative ? "" : "Impulso Cero Academy";
  return (
    <span className={prominent ? styles.prominentLogo : undefined}>
      {prominent && (
        <span className={styles.fullLogo}>
          <Image
            src="/brands/impulso-cero-lockup.png"
            width={2388}
            height={927}
            alt={alt}
            unoptimized
          />
        </span>
      )}
      <span className={styles.compactLogo}>
        <Image
          src="/brands/impulso-cero-marca.png"
          width={2305}
          height={2258}
          alt={alt}
          unoptimized
        />
      </span>
    </span>
  );
}

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
  prominent = false,
}: {
  slug: string;
  name: string;
  detail?: string;
  prominent?: boolean;
}) {
  return (
    <span className={styles.organization}>
      {usesImpulsoBrand(slug) ? (
        <ImpulsoBrand prominent={prominent} decorative />
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
