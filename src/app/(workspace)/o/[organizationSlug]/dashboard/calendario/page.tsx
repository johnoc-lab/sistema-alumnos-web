import type { OrganizationPageProps } from "@/types/routes";
import {
  redirectCalendar,
  type ScheduleSearch,
} from "@/features/schedule/schedule-page";

export default async function Page({
  params,
  searchParams,
}: OrganizationPageProps & {
  searchParams: Promise<ScheduleSearch>;
}) {
  const { organizationSlug } = await params;
  redirectCalendar(organizationSlug, false, await searchParams);
}
