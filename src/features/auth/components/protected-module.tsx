import Link from "next/link";
import { redirect } from "next/navigation";
import type { OrganizationRole } from "@/lib/authorization/access";
import { organizationAccess } from "@/lib/auth/access.server";
import { AccessPending } from "./access-pending";
import { LogoutForm } from "./auth-form";
import styles from "@/components/ui/ui.module.css";
export async function ProtectedModule({
  slug,
  role,
  title,
  section,
}: {
  slug: string;
  role: OrganizationRole;
  title: string;
  section: string;
}) {
  const access = await organizationAccess(slug, role);
  if (!access.allowed) {
    if (access.session.status === "anonymous")
      redirect(
        "/login?next=" + encodeURIComponent("/o/" + slug + "/" + section),
      );
    if (access.reason === "mfa_required")
      return (
        <main
          id="main-content"
          className={styles.centered}
          data-access-state="forbidden"
        >
          <h1>Acceso no disponible</h1>
          <p>El panel administrativo requiere verificación MFA aal2.</p>
          <Link href="/auth/mfa" className={styles.primaryLink}>
            Configurar/verificar MFA
          </Link>
          <Link href="/seleccionar-organizacion">
            Volver a mis organizaciones
          </Link>
          <LogoutForm />
        </main>
      );
    return (
      <AccessPending
        state={
          access.session.status === "authenticated"
            ? "forbidden"
            : access.session.status
        }
        message={
          access.session.status === "authenticated"
            ? "Tu cuenta no tiene permisos vigentes para este módulo."
            : "El acceso no está configurado o no pudo verificarse. Inténtalo más tarde."
        }
      />
    );
  }
  return (
    <main
      id="main-content"
      data-access-state="authorized"
      className={styles.centered}
    >
      <p>{access.membership?.name}</p>
      <h1>{title}</h1>
      <p>
        Identidad y membresía verificadas. El contenido de este módulo se
        integrará en la siguiente fase.
      </p>
      <p>Las operaciones de gestión permanecen deshabilitadas.</p>
      <Link href="/seleccionar-organizacion">Cambiar organización</Link>
      <LogoutForm />
    </main>
  );
}
