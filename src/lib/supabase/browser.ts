"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.generated";
import { publicSupabaseConfig } from "./config";
import { IntegrationUnavailableError } from "./integration-state";
/** Preparado para futuros componentes; los formularios actuales usan rutas del servidor. */
export function createBrowserSupabaseClient() {
  const config = publicSupabaseConfig();
  if (!config) throw new IntegrationUnavailableError();
  return createBrowserClient<Database>(config.url, config.key, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: window.location.protocol === "https:",
    },
    auth: { detectSessionInUrl: false },
  });
}
