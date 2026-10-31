import type { AuthorizedContext, QueryResult } from "@/lib/data/contracts";
export interface CalendarEventDto {
  id: string;
  organizationId: string;
  courseId: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: "draft" | "scheduled" | "cancelled" | "archived";
}
export interface CalendarQueries {
  listAssigned(
    context: AuthorizedContext,
    interval: { startsAt: string; endsAt: string },
  ): Promise<QueryResult<readonly CalendarEventDto[]>>;
}
