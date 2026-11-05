import { ProtectedModule } from "@/features/auth/components/protected-module";
import type { OrganizationPageProps } from "@/types/routes";
export default async function Page({ params }: OrganizationPageProps) {
  const { organizationSlug } = await params;
  return (
    <ProtectedModule
      slug={organizationSlug}
      role="admin"
      title="Certificados"
      section="admin/certificados"
    />
  );
}
