import { StaffPage, type StaffSearch } from "@/features/staff/staff-page";
import type { OrganizationPageProps } from "@/types/routes";

export default async function Page({
  params,
  searchParams,
}: OrganizationPageProps & {
  searchParams: Promise<StaffSearch>;
}) {
  const { organizationSlug } = await params;
  return <StaffPage slug={organizationSlug} search={await searchParams} />;
}
