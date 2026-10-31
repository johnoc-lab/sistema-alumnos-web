import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { readSession } from "@/lib/auth/session.server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import {
  IntegrationUnavailableError,
  integrationState,
} from "@/lib/supabase/integration-state";
import {
  enrollmentQueries,
  enrollmentMutations,
  lessonQueries,
  announcementQueries,
  certificateQueries,
  courseQueries,
  courseMutations,
  studentQueries,
  studentMutations,
  calendarQueries,
  membershipQueries,
  storageGateway,
} from "@/lib/data/unavailable-adapters.server";
describe("integración deshabilitada y sin fallback ficticio", () => {
  it("no existe identidad ni sesión de demostración", async () =>
    expect(await readSession()).toEqual({
      status: "unconfigured",
      user: null,
    }));
  it("no inicializa clientes ni contacta red aunque existan variables", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.test");
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "synthetic-not-a-credential",
    );
    try {
      expect(integrationState.enabled).toBe(false);
      expect(createServerSupabaseClient).toThrow(IntegrationUnavailableError);
      expect(createBrowserSupabaseClient).toThrow(IntegrationUnavailableError);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("repositorios y mutaciones no usan fixtures como alternativa", async () => {
    const context = {
      profileId: "test-profile",
      organizationId: "org-a",
      role: "admin",
    } as const;
    const expected = {
      status: "unavailable",
      reason: "integration_not_configured",
    };
    const results = await Promise.all([
      enrollmentQueries.listOwn(context),
      enrollmentMutations.changeStatus(context, {
        enrollmentId: "x",
        status: "paused",
        expectedVersion: 1,
      }),
      lessonQueries.listForCourse(context, "course"),
      announcementQueries.listAuthorized(context),
      certificateQueries.listAuthorized(context),
      courseQueries.list(context),
      courseMutations.archive(context, { courseId: "x", expectedVersion: 1 }),
      studentQueries.list(context),
      studentMutations.updateContact(context, {
        membershipId: "x",
        firstName: "Example",
        lastName: "Test",
        contactEmail: null,
        expectedVersion: 1,
      }),
      calendarQueries.listAssigned(context, {
        startsAt: "2026-11-01T00:00:00Z",
        endsAt: "2026-11-08T00:00:00Z",
      }),
      membershipQueries.findForVerifiedProfile("p", "o"),
      storageGateway.requestDownload(context, "asset"),
    ]);
    results.forEach((result) => expect(result).toEqual(expected));
  });
});
