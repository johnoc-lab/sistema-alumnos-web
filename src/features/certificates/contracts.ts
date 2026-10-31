import type { AuthorizedContext, QueryResult } from "@/lib/data/contracts";
export interface CertificateDto {
  id: string;
  organizationId: string;
  membershipId: string;
  enrollmentId: string;
  serial: string;
  status: "draft" | "issued" | "revoked" | "archived";
}
export interface CertificateQueries {
  listAuthorized(
    context: AuthorizedContext,
  ): Promise<QueryResult<readonly CertificateDto[]>>;
}
/** La elegibilidad y la emisión no se implementan ni se presumen en fase 3. */
