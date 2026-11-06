import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { CredentialPurpose } from "./features.server";
export const recoveryCookie = "sa-credential-update";
type Binding = { sub: string; session_id: string };
type CredentialProof = Binding & { purpose: CredentialPurpose; exp: number };
export function makeRecoveryProof(
  binding: Binding & { purpose: CredentialPurpose },
  secret: string,
  now = Date.now(),
) {
  const payload = Buffer.from(
    JSON.stringify({ ...binding, exp: Math.floor(now / 1000) + 600 }),
  ).toString("base64url");
  return (
    payload +
    "." +
    createHmac("sha256", secret).update(payload).digest("base64url")
  );
}
/** Verifica MAC/plazo/propósito antes de permitir llamadas a Auth; no consume el ticket. */
export function readRecoveryProof(
  value: string | undefined,
  secret: string,
  now = Date.now(),
): CredentialProof | null {
  if (!value || value.length > 1500) return null;
  try {
    const [payload, signature, ...extra] = value.split(".");
    if (extra.length || !payload || !signature) return null;
    const expected = createHmac("sha256", secret).update(payload).digest(),
      actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return null;
    const data: unknown = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    if (!data || typeof data !== "object") return null;
    const p = data as Partial<CredentialProof>;
    if (
      typeof p.sub !== "string" ||
      !p.sub ||
      typeof p.session_id !== "string" ||
      !p.session_id ||
      (p.purpose !== "recovery" && p.purpose !== "invite") ||
      typeof p.exp !== "number" ||
      p.exp <= now / 1000 ||
      p.exp > now / 1000 + 600
    )
      return null;
    return p as CredentialProof;
  } catch {
    return null;
  }
}
export function validRecoveryProof(
  value: string | undefined,
  binding: Binding,
  secret: string,
  now = Date.now(),
) {
  const proof = readRecoveryProof(value, secret, now);
  return (
    !!proof &&
    proof.sub === binding.sub &&
    proof.session_id === binding.session_id
  );
}
