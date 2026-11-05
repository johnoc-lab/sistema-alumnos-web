import Link from "next/link";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth/session.server";
import { AccessPending } from "@/features/auth/components/access-pending";
import { LogoutForm } from "@/features/auth/components/auth-form";
import styles from "@/components/ui/ui.module.css";
export const dynamic = "force-dynamic";
export default async function OrganizationPage() {
  const session = await readSession();
  if (session.status === "anonymous") redirect("/login");
  if (session.status !== "authenticated")
    return <AccessPending state={session.status} />;
  return (
    <main
      id="main-content"
      className={styles.centered}
      data-access-state="authenticated"
    >
      <h1>Mis organizaciones</h1>
      {!session.memberships.length && (
        <p>
          Tu cuenta no tiene perfil y membresía activos en una organización
          disponible. Contacta al responsable de tu organización.
        </p>
      )}
      {session.memberships.map((m) => (
        <div key={m.organizationId}>
          <h2>{m.name}</h2>
          <Link href={"/o/" + m.slug + "/dashboard"}>Dashboard</Link>{" "}
          {m.role === "admin" && (
            <Link href={"/o/" + m.slug + "/admin"}>
              Panel administrativo
              {session.identity?.assuranceLevel !== "aal2"
                ? " · requiere MFA"
                : ""}
            </Link>
          )}
        </div>
      ))}
      {session.identity?.status === "active" &&
        session.memberships.some(
          (membership) => membership.role === "admin",
        ) && (
          <Link href="/auth/mfa" className={styles.secondaryLink}>
            Configurar/verificar MFA
          </Link>
        )}
      <LogoutForm />
    </main>
  );
}
