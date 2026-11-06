import "server-only";
import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { authConfig } from "@/lib/supabase/config";
import { resolveSession, type SessionResult } from "./resolve";
export type { SessionResult } from "./resolve";
export const readSession = cache(async (): Promise<SessionResult> => {
  if (!authConfig()) return { status: "unconfigured", user: null };
  const client = await createServerSupabaseClient();
  return readSessionForClient(client);
});
/** Resuelve identidad y pertenencia con un cliente concreto; no cachea su estado MFA. */
export async function readSessionForClient(
  client: Awaited<ReturnType<typeof createServerSupabaseClient>>,
): Promise<SessionResult> {
  return resolveSession({
    user: async () => {
      const { data, error } = await client.auth.getUser();
      return { data: data.user, error };
    },
    claims: async () => {
      const { data, error } = await client.auth.getClaims();
      return { data: data?.claims ?? null, error };
    },
    profile: async () =>
      await client.from("profiles").select("id,status").maybeSingle(),
    memberships: async (profileId) =>
      await client
        .from("organization_memberships")
        .select("profile_id,organization_id,role,status")
        .eq("profile_id", profileId)
        .eq("status", "active"),
    organizations: async (ids) =>
      await client
        .from("organizations")
        .select("id,slug,name,status")
        .in("id", ids)
        .eq("status", "active"),
  });
}
