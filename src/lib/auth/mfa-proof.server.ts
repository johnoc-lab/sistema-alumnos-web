import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
export const mfaCookie = "sa-mfa-challenge";
export type MfaBinding = {
  sub: string;
  session_id: string;
  profile_id: string;
  organization_id: string;
  factor_id: string;
  challenge_id: string;
};
type MfaProof = MfaBinding & { purpose: "mfa-totp"; exp: number };
export function makeMfaProof(
  binding: MfaBinding,
  secret: string,
  expiresAt: number,
  now = Date.now(),
) {
  const exp = Math.min(Math.floor(expiresAt), Math.floor(now / 1000) + 300);
  if (!Number.isFinite(exp) || exp <= now / 1000)
    throw Error("expired_challenge");
  const payload = Buffer.from(
    JSON.stringify({ ...binding, purpose: "mfa-totp", exp }),
  ).toString("base64url");
  return (
    payload +
    "." +
    createHmac("sha256", secret)
      .update("mfa-totp:" + payload)
      .digest("base64url")
  );
}
export function readMfaProof(
  value: string | undefined,
  secret: string,
  now = Date.now(),
): MfaProof | null {
  if (!value || value.length > 2500) return null;
  try {
    const [payload, signature, ...rest] = value.split(".");
    if (!payload || !signature || rest.length) return null;
    const expected = createHmac("sha256", secret)
      .update("mfa-totp:" + payload)
      .digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return null;
    const p = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Partial<MfaProof>;
    if (
      !p ||
      p.purpose !== "mfa-totp" ||
      !Number.isInteger(p.exp) ||
      p.exp! <= now / 1000 ||
      p.exp! > now / 1000 + 300
    )
      return null;
    for (const key of [
      "sub",
      "session_id",
      "profile_id",
      "organization_id",
      "factor_id",
      "challenge_id",
    ] as const)
      if (typeof p[key] !== "string" || !p[key] || p[key]!.length > 128)
        return null;
    return p as MfaProof;
  } catch {
    return null;
  }
}
