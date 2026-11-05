import { academicPost } from "@/features/academic/handlers.server";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationSlug: string }> },
) {
  return academicPost(request, (await params).organizationSlug);
}
