"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { IntegrationUnavailableError } from "./integration-state";
/** No existe modo de conexión activable mediante variables de entorno en esta fase. */
export function createBrowserSupabaseClient(): SupabaseClient {
  throw new IntegrationUnavailableError();
}
