import { notFound } from "next/navigation";
import { parsePreviewRoute } from "@/features/preview/routes";
import { RenderPreview } from "@/features/preview/render-preview";
export default async function DemoPage({
  params,
}: {
  params: Promise<{ segments: string[] }>;
}) {
  const { segments } = await params;
  const route = parsePreviewRoute(segments);
  if (!route) notFound();
  return <RenderPreview route={route} />;
}
