import { studentAccessManagementPost } from "@/features/auth/student-access-management.server";
import type { OrganizationPageProps } from "@/types/routes";

export async function POST(
  request: Request,
  { params }: OrganizationPageProps,
) {
  return studentAccessManagementPost(request, (await params).organizationSlug);
}
