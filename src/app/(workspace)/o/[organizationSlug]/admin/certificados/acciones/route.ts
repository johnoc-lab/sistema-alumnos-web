import { certificatePost } from "@/features/certificates/certificates.server";
import type { OrganizationPageProps } from "@/types/routes";

export async function POST(
  request: Request,
  { params }: OrganizationPageProps,
) {
  return certificatePost(request, (await params).organizationSlug);
}
