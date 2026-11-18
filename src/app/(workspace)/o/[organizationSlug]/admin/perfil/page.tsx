import { StaffProfile } from "@/features/staff/staff-profile";
import type { OrganizationPageProps } from "@/types/routes";

export default async function Page({ params }: OrganizationPageProps) {
  const { organizationSlug } = await params;
  return <StaffProfile slug={organizationSlug} />;
}
