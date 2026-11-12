import { staffPost } from "@/features/staff/handlers.server";
import type { OrganizationPageProps } from "@/types/routes";

export async function POST(
  request: Request,
  { params }: OrganizationPageProps,
) {
  const { organizationSlug } = await params;
  return staffPost(request, organizationSlug);
}
