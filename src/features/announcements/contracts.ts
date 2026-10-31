import type { AuthorizedContext, QueryResult } from "@/lib/data/contracts";
export interface AnnouncementDto {
  id: string;
  organizationId: string;
  courseId: string;
  title: string;
  body: string;
  publishedAt: string | null;
  status: "draft" | "published" | "archived";
}
export interface AnnouncementQueries {
  listAuthorized(
    context: AuthorizedContext,
  ): Promise<QueryResult<readonly AnnouncementDto[]>>;
}
