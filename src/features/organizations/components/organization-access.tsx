import Link from "next/link";
import { Building2, ArrowRight, ShieldCheck, Orbit } from "lucide-react";
import type { AuthenticatedSession } from "@/lib/auth/resolve";
import { LogoutForm } from "@/features/auth/components/auth-form";
import { Badge } from "@/components/ui/primitives";
import styles from "./organization-selector.module.css";
import ui from "@/components/ui/ui.module.css";

export function OrganizationAccess({
  session,
}: {
  session: AuthenticatedSession;
}) {
  return (
    <div className={styles.page} data-access-state="authenticated">
      <header className={styles.header}>
        <Link href="/seleccionar-organizacion" className={styles.brand}>
          <Orbit color="var(--accent)" /> Sistema Alumnos
        </Link>
        <LogoutForm />
      </header>
      <main id="main-content" className={styles.main}>
        <div className={styles.intro}>
          <Badge tone="cyan">Espacio académico</Badge>
          <h1>Mis organizaciones</h1>
          <p>
            Elige tu organización para continuar con tus talleres y actividades.
          </p>
        </div>
        {!session.memberships.length && (
          <div className={styles.empty} role="status">
            <Building2 size={32} aria-hidden="true" />
            <h2>Aún no tienes un espacio asignado</h2>
            <p>
              Tu cuenta no tiene perfil y membresía activos en una organización
              disponible. Contacta al responsable de tu organización.
            </p>
          </div>
        )}
        <div className={styles.grid}>
          {session.memberships.map((m) => {
            const needsMfa = session.identity?.assuranceLevel !== "aal2";
            return (
              <section key={m.organizationId} className={styles.card}>
                <div className={styles.symbol}>
                  <Building2 size={28} aria-hidden="true" />
                </div>
                <Badge tone={m.role === "admin" ? "purple" : "green"}>
                  {m.role === "admin" ? "Administrador" : "Alumno"}
                </Badge>
                <h2>{m.name}</h2>
                <p>
                  {m.role === "admin"
                    ? "Gestiona alumnos, talleres y contenidos de este espacio."
                    : "Consulta tus talleres, materiales, avisos y calendario."}
                </p>
                <div className={styles.links}>
                  <Link href={"/o/" + m.slug + "/dashboard"}>
                    Dashboard <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                  {m.role === "admin" && (
                    <Link href={"/o/" + m.slug + "/admin"}>
                      Panel administrativo{needsMfa ? " · requiere MFA" : ""}
                      <ShieldCheck size={16} aria-hidden="true" />
                    </Link>
                  )}
                </div>
              </section>
            );
          })}
        </div>
        {session.identity?.status === "active" &&
          session.memberships.some((m) => m.role === "admin") && (
            <div className={styles.security}>
              <ShieldCheck size={18} aria-hidden="true" />
              <p>
                El acceso administrativo requiere un segundo factor verificado.
              </p>
              <Link href="/auth/mfa" className={ui.secondaryLink}>
                Configurar/verificar MFA
              </Link>
            </div>
          )}
      </main>
    </div>
  );
}
