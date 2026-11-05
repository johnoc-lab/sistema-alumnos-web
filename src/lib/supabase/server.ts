import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database.generated";
import { authConfig } from "./config";
import { IntegrationUnavailableError } from "./integration-state";
export async function createServerSupabaseClient(writable = false) {
  const config = authConfig();
  if (!config) throw new IntegrationUnavailableError();
  const jar = await cookies();
  return createServerClient<Database>(config.url, config.key, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: config.origin.startsWith("https:"),
    },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) => {
        if (writable) {
          values.forEach(({ name, value, options }) =>
            jar.set(name, value, options),
          );
          return;
        }
        try {
          values.forEach(({ name, value, options }) =>
            jar.set(name, value, options),
          );
        } catch {
          // En Server Components la escritura corresponde al proxy de esta solicitud.
        }
      },
    },
  });
}
