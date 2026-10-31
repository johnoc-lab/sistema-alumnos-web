import type { AuthorizedContext, QueryResult } from "@/lib/data/contracts";
export interface LessonDto {
  id: string;
  organizationId: string;
  courseId: string;
  moduleId: string | null;
  title: string;
  description: string;
  status: "draft" | "published" | "archived";
  videoUrl: string | null;
  liveUrl: string | null;
  sortOrder: number;
}
export interface LessonQueries {
  listForCourse(
    context: AuthorizedContext,
    courseId: string,
  ): Promise<QueryResult<readonly LessonDto[]>>;
}
