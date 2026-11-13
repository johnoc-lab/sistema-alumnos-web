import "server-only";
export type CredentialPurpose = "recovery" | "invite";
/** Privados y cerrados por defecto: solo el valor literal true habilita una función. */
export function authFeatures() {
  return {
    emailRecovery: process.env.AUTH_EMAIL_RECOVERY_ENABLED === "true",
    tokenHashRecovery: process.env.AUTH_TOKEN_HASH_RECOVERY_ENABLED === "true",
    invitationAccept: process.env.AUTH_INVITATION_ACCEPT_ENABLED === "true",
  };
}
export type AuthFeatures = ReturnType<typeof authFeatures>;
export function credentialPurposeEnabled(
  purpose: CredentialPurpose,
  features: AuthFeatures,
) {
  return purpose === "recovery"
    ? features.tokenHashRecovery
    : features.invitationAccept;
}
export function credentialUpdatesEnabled(features: AuthFeatures) {
  return features.tokenHashRecovery || features.invitationAccept;
}
/** Las rutas apagadas tampoco deben renovar/consumir sesiones desde el proxy. */
export function shouldRefreshAuthPath(
  pathname: string,
  features: AuthFeatures,
) {
  const path = pathname.replace(/\/+$/, "");
  if (
    path === "/auth/activar-personal" ||
    path === "/auth/activar-personal/acciones"
  )
    return false;
  if (["/auth/recover", "/auth/recuperar", "/auth/callback"].includes(path))
    return features.emailRecovery;
  if (
    [
      "/auth/confirm",
      "/auth/verify",
      "/auth/password",
      "/auth/actualizar-password",
    ].includes(path)
  )
    return credentialUpdatesEnabled(features);
  return true;
}
