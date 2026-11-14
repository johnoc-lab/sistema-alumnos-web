import { certificateDownload } from "@/features/certificates/certificates.server";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ organizationSlug: string; certificateId: string }>;
  },
) {
  const { organizationSlug, certificateId } = await params;
  return certificateDownload(
    organizationSlug,
    certificateId,
    new URL(request.url).searchParams.get("vista") === "pdf",
  );
}
