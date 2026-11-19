import { StudentAccessManagement } from "@/features/auth/student-access-management";
import type { OrganizationPageProps } from "@/types/routes";

export default async function Page({ params }: OrganizationPageProps) {
  const { organizationSlug } = await params;
  return <StudentAccessManagement slug={organizationSlug} />;
}
