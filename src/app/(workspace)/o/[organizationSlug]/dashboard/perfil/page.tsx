import { AccessPending } from "@/features/auth/components/access-pending";
import { isOrganizationSlug, previewHref } from "@/features/preview/routes";
import type { OrganizationPageProps } from "@/types/routes";
export default async function Page({ params }: OrganizationPageProps) {
  const { organizationSlug } = await params;
  const previewPath = isOrganizationSlug(organizationSlug)
    ? previewHref(organizationSlug, "dashboard/perfil")
    : "/demo";
  return <AccessPending previewPath={previewPath} />;
}
