import type {
  AuthorizedContext,
  QueryResult,
  MutationResult,
} from "@/lib/data/contracts";
export interface StudentDto {
  membershipId: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  contactEmail: string | null;
  status: "invited" | "active" | "suspended" | "archived";
}
export interface StudentQueries {
  list(context: AuthorizedContext): Promise<QueryResult<readonly StudentDto[]>>;
}
export interface StudentMutations {
  updateContact(
    context: AuthorizedContext,
    input: {
      membershipId: string;
      firstName: string;
      lastName: string;
      contactEmail: string | null;
      expectedVersion: number;
    },
  ): Promise<MutationResult>;
}
