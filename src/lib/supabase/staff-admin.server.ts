import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import { authConfig } from "./config";

function staffAdminConfig() {
  const config = authConfig();
  const secret = process.env.SUPABASE_STAFF_SECRET_KEY;
  if (
    process.env.STAFF_REGISTRATION_ENABLED !== "true" ||
    !config ||
    !secret ||
    !/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(secret)
  )
    return null;
  return { url: config.url, secret };
}

export function staffRegistrationEnabled() {
  return !!staffAdminConfig();
}

export function createStaffAdminClient() {
  const config = staffAdminConfig();
  if (!config) return null;
  return createClient<Database>(config.url, config.secret, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
