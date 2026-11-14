import { StaffCertificates } from "@/features/certificates/pages";
import type { OrganizationPageProps } from "@/types/routes";

export default async function Page({
  params,
  searchParams,
}: OrganizationPageProps & {
  searchParams: Promise<{ course?: string; notice?: string }>;
}) {
  const { organizationSlug } = await params;
  const { course, notice } = await searchParams;
  return (
    <StaffCertificates
      slug={organizationSlug}
      course={course}
      notice={notice}
    />
  );
}
