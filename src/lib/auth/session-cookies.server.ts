import "server-only";
import type { cookies } from "next/headers";

export function clearSupabaseSessionCookies(
  jar: Awaited<ReturnType<typeof cookies>>,
  config: { url: string; origin: string },
) {
  const project = new URL(config.url).hostname.split(".")[0];
  const key = "sb-" + project + "-auth-token";
  for (const { name } of jar.getAll())
    if (name === key || name.startsWith(key + "."))
      jar.set(name, "", {
        path: "/",
        sameSite: "lax",
        secure: config.origin.startsWith("https:"),
        maxAge: 0,
      });
}
