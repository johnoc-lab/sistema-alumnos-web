import type { AuthorizedContext, QueryResult } from "@/lib/data/contracts";
export interface StorageGateway {
  requestDownload(
    context: AuthorizedContext,
    assetId: string,
  ): Promise<QueryResult<{ url: string; expiresAt: string }>>;
}
