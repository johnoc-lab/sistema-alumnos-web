export const SUPABASE_PROJECT_URL = "https://rnxgrunnrdlgjsbsrjev.supabase.co";
export function publicSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (
    url !== SUPABASE_PROJECT_URL ||
    !key?.startsWith("sb_publishable_") ||
    key.length < 30
  )
    return null;
  return { url, key };
}
export function authOrigin(value = process.env.APP_ORIGIN): string | null {
  try {
    const u = new URL(value ?? "");
    if (u.origin !== value || u.username || u.password) return null;
    if (
      u.protocol !== "https:" &&
      !(
        u.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(u.hostname)
      )
    )
      return null;
    return u.origin;
  } catch {
    return null;
  }
}
export function authConfig() {
  const publicConfig = publicSupabaseConfig(),
    origin = authOrigin();
  const secret = process.env.AUTH_FLOW_SECRET;
  if (
    process.env.SUPABASE_AUTH_ENABLED !== "true" ||
    !publicConfig ||
    !origin ||
    !secret ||
    secret.length < 43
  )
    return null;
  return { ...publicConfig, origin, secret };
}
export const noStoreHeaders = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};
