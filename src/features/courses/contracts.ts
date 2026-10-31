import type {
  AuthorizedContext,
  QueryResult,
  MutationResult,
} from "@/lib/data/contracts";
export interface CourseDto {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  status: "draft" | "published" | "archived";
  sortOrder: number;
}
export interface CourseQueries {
  list(context: AuthorizedContext): Promise<QueryResult<readonly CourseDto[]>>;
}
export interface CourseMutations {
  archive(
    context: AuthorizedContext,
    input: { courseId: string; expectedVersion: number },
  ): Promise<MutationResult>;
}
