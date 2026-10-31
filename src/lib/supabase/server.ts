import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { IntegrationUnavailableError } from "./integration-state";
/** Punto de extensión futuro. No inicializa SDK, lee claves ni realiza peticiones. */
export function createServerSupabaseClient(): SupabaseClient {
  throw new IntegrationUnavailableError();
}
