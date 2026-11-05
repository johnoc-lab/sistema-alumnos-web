import { authOrigin } from "@/lib/supabase/config";
export function safeNext(value: unknown): string {
  if (typeof value !== "string" || value.length > 300)
    return "/seleccionar-organizacion";
  if (
    value === "/seleccionar-organizacion" ||
    /^\/o\/[a-z0-9]+(?:-[a-z0-9]+)*\/(?:dashboard|admin)(?:\/[a-z0-9-]+)*$/.test(
      value,
    )
  )
    return value;
  return "/seleccionar-organizacion";
}
export function sameOriginPost(request: Request, origin: string) {
  return (
    request.method === "POST" &&
    authOrigin(origin) === origin &&
    request.headers.get("origin") === origin &&
    (!request.headers.has("sec-fetch-site") ||
      ["same-origin", "none"].includes(request.headers.get("sec-fetch-site")!))
  );
}
export async function readFields(request: Request) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/x-www-form-urlencoded")
  )
    throw Error("invalid_body");
  const reader = request.body?.getReader();
  if (!reader) throw Error("invalid_body");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.length;
      if (bytes > 8192) {
        await reader.cancel();
        throw Error("invalid_body");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return new URLSearchParams(
    new TextDecoder("utf-8", { fatal: true }).decode(body),
  );
}
