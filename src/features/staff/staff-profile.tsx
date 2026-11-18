import { PageHeading } from "@/components/ui/primitives";
import { AcademicShell } from "@/features/academic/shell";
import academic from "@/features/academic/academic.module.css";
import { ProtectedModule } from "@/features/auth/components/protected-module";
import { organizationAccess } from "@/lib/auth/access.server";
import { staffRanks } from "@/lib/authorization/staff";
import { CopyAccessValue } from "./copy-access-value";
import { staffUsernameFromIdentifier } from "./identifier";

export async function StaffProfile({ slug }: { slug: string }) {
  const section = "admin/perfil";
  const access = await organizationAccess(slug, "admin", "overview");
  if (
    !access.allowed ||
    !access.membership ||
    access.session.status !== "authenticated"
  )
    return (
      <ProtectedModule
        slug={slug}
        role="admin"
        title="Mi perfil"
        section={section}
      />
    );

  const { user, memberships } = access.session;
  const identifier = user.email;
  const username = identifier ? staffUsernameFromIdentifier(identifier) : null;

  return (
    <AcademicShell
      slug={slug}
      name={access.membership.name}
      admin
      section={section}
      membership={access.membership}
    >
      <PageHeading
        eyebrow="MI CUENTA"
        title="Mi perfil"
        description={
          access.membership.displayName ||
          user.displayName ||
          "Consulta tus datos de acceso."
        }
      />
      <section
        className={academic.section}
        aria-labelledby="staff-access-title"
      >
        <h2 id="staff-access-title">Datos de acceso</h2>
        {username && (
          <CopyAccessValue label="Usuario de acceso" value={username} />
        )}
        {identifier && (
          <CopyAccessValue
            label={
              username ? "Identificador institucional" : "Correo de acceso"
            }
            value={identifier}
          />
        )}
        {username && (
          <p>
            El identificador institucional sirve para iniciar sesión y puede no
            tener un buzón asociado.
          </p>
        )}
      </section>
      <section
        className={academic.section}
        aria-labelledby="staff-organizations-title"
      >
        <h2 id="staff-organizations-title">Instituciones autorizadas</h2>
        <ul>
          {memberships.map((membership) => (
            <li key={membership.organizationId}>
              {membership.name} ·{" "}
              {membership.staffRank
                ? staffRanks[membership.staffRank]
                : "Alumno"}
            </li>
          ))}
        </ul>
      </section>
    </AcademicShell>
  );
}
