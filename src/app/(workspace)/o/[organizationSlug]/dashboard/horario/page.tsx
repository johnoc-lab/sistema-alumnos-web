import type { OrganizationPageProps } from "@/types/routes";
import {
  SchedulePage,
  type ScheduleSearch,
} from "@/features/schedule/schedule-page";

export default async function Page({
  params,
  searchParams,
}: OrganizationPageProps & {
  searchParams: Promise<ScheduleSearch>;
}) {
  const { organizationSlug } = await params;
  return (
    <SchedulePage
      slug={organizationSlug}
      admin={false}
      search={await searchParams}
    />
  );
}
