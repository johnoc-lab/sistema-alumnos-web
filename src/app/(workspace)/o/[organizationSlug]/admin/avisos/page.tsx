import { AcademicPage } from "@/features/academic/academic-page";
import type { OrganizationPageProps } from "@/types/routes";
export default async function Page({
  params,
  searchParams,
}: OrganizationPageProps & {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organizationSlug } = await params;
  return (
    <AcademicPage
      slug={organizationSlug}
      section="admin/avisos"
      search={await searchParams}
    />
  );
}
