import { AcademicPage } from "@/features/academic/academic-page";
export default async function Page({
  params,
}: {
  params: Promise<{ organizationSlug: string; courseId: string }>;
}) {
  const { organizationSlug, courseId } = await params;
  return (
    <AcademicPage
      slug={organizationSlug}
      section="dashboard/cursos"
      courseId={courseId}
    />
  );
}
