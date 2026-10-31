import Link from "next/link";
import { Orbit, ArrowUpRight, ArrowLeft, Building2 } from "lucide-react";
import { DemoBanner } from "@/components/layouts/preview-shell";
import { Badge } from "@/components/ui/primitives";
import { previewOrganizations } from "@/features/preview/fixtures";
import { previewHref } from "@/features/preview/routes";
import styles from "./organization-selector.module.css";
export function OrganizationSelector() {
  return (
    <div className={styles.page} data-preview="synthetic">
      <DemoBanner />
      <header className={styles.header}>
        <Link href="/login" className={styles.brand}>
          <Orbit color="var(--accent)" strokeWidth={1.3} />
          Impulso Cero
        </Link>
        <Link href="/login" aria-label="Volver al login">
          <ArrowLeft size={20} />
        </Link>
      </header>
      <main id="main-content" className={styles.main}>
        <div className={styles.intro}>
          <Badge tone="amber">Datos sintéticos · Exploración pública</Badge>
          <h1>Elige un espacio de ejemplo</h1>
          <p>
            Revisa cómo se verá cada interfaz. Esta selección cambia el conjunto
            de datos ficticios; no valida membresías ni inicia sesión.
          </p>
        </div>
        <div className={styles.grid}>
          {previewOrganizations.map((org) => (
            <section
              className={
                styles.card + " " + (org.tone === "purple" ? styles.purple : "")
              }
              key={org.slug}
            >
              <div className={styles.symbol}>
                <Building2 size={28} strokeWidth={1.3} />
              </div>
              <h2>{org.name}</h2>
              <p>{org.description}</p>
              <div className={styles.links}>
                <Link href={previewHref(org.slug, "dashboard")}>
                  Vista de alumno
                  <ArrowUpRight size={16} />
                </Link>
                <Link href={previewHref(org.slug, "admin")}>
                  Vista de administración
                  <ArrowUpRight size={16} />
                </Link>
              </div>
            </section>
          ))}
        </div>
        <p className={styles.footnote}>
          Los nombres, cursos y contactos son ficticios. El acceso real por
          organización estará sujeto a autenticación y políticas de base de
          datos.
        </p>
      </main>
    </div>
  );
}
