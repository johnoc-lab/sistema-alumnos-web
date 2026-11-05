import { academicPdf } from "@/features/academic/handlers.server";
export async function GET(
  _request: Request,
  {
    params,
  }: { params: Promise<{ organizationSlug: string; assetId: string }> },
) {
  const { organizationSlug, assetId } = await params;
  return academicPdf(organizationSlug, assetId);
}
