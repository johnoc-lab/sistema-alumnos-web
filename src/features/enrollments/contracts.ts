import type {
  AuthorizedContext,
  QueryResult,
  MutationResult,
} from "@/lib/data/contracts";
export interface EnrollmentDto {
  id: string;
  organizationId: string;
  courseId: string;
  membershipId: string;
  status: "active" | "paused" | "completed" | "cancelled" | "archived";
  progressPercent: number | null;
  rowVersion: number;
}
export interface EnrollmentQueries {
  listOwn(
    context: AuthorizedContext,
  ): Promise<QueryResult<readonly EnrollmentDto[]>>;
}
export interface EnrollmentMutations {
  changeStatus(
    context: AuthorizedContext,
    input: {
      enrollmentId: string;
      status: EnrollmentDto["status"];
      expectedVersion: number;
    },
  ): Promise<MutationResult>;
}
