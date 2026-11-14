import { StudentCertificates } from "@/features/certificates/pages";
import type { OrganizationPageProps } from "@/types/routes";

export default async function Page({ params }: OrganizationPageProps) {
  return <StudentCertificates slug={(await params).organizationSlug} />;
}
