import type { VerifiedMembership } from "@/lib/authorization/access";
import type { QueryResult } from "@/lib/data/contracts";
export interface MembershipQueries {
  findForVerifiedProfile(
    profileId: string,
    organizationId: string,
  ): Promise<QueryResult<VerifiedMembership | null>>;
}
