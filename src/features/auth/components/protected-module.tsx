import Link from "next/link";
import campus from "@/components/institutional/campus.module.css";
import { redirect } from "next/navigation";
import type { OrganizationRole } from "@/lib/authorization/access";
import { staffSectionPermission } from "@/lib/authorization/staff";
import { organizationAccess } from "@/lib/auth/access.server";
import { mfaUrl } from "@/lib/auth/security";
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
  const access = await organizationAccess(
    slug,
    role,
    role === "admin" ? staffSectionPermission(section) : undefined,
  );
  if (!access.allowed) {
    if (access.session.status === "anonymous")
      redirect(
        "/login?next=" + encodeURIComponent("/o/" + slug + "/" + section),
      );
    if (access.reason === "mfa_required")
      redirect(mfaUrl("/o/" + slug + "/" + section));
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
      className={campus.page + " " + styles.centered}
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
