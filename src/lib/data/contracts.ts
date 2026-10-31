import type { OrganizationRole } from "@/lib/authorization/access";
export interface AuthorizedContext {
  readonly profileId: string;
  readonly organizationId: string;
  readonly role: OrganizationRole;
}
export type QueryResult<T> =
  | { status: "ready"; data: T }
  | { status: "unavailable"; reason: "integration_not_configured" };
export type MutationResult = {
  status: "unavailable";
  reason: "integration_not_configured";
};
