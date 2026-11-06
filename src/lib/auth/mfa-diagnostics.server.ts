import "server-only";
import { randomUUID } from "node:crypto";
export type EnrollmentStage =
  | "configuration"
  | "csrf"
  | "form"
  | "cookies"
  | "client"
  | "session"
  | "authorization"
  | "claims"
  | "list_factors"
  | "challenge_state_clear"
  | "auth_enroll"
  | "enroll_response"
  | "qr_receive"
  | "qr_validation"
  | "html_render"
  | "http_response";
export type EnrollmentCode =
  | "configuration_unavailable"
  | "csrf_rejected"
  | "invalid_form"
  | "context_anonymous"
  | "context_forbidden"
  | "context_unavailable"
  | "factor_list_failed"
  | "existing_factor"
  | "provider_error"
  | "invalid_enroll_response"
  | "qr_invalid_type_or_size"
  | "qr_invalid_prefix"
  | "qr_decode_failed"
  | "qr_invalid_structure"
  | "qr_blocked_markup"
  | "qr_external_reference"
  | "qr_unsupported_element"
  | "qr_rejected"
  | "unexpected_exception";
const providerCodes = new Set([
  "unexpected_failure",
  "validation_failed",
  "bad_json",
  "bad_jwt",
  "no_authorization",
  "user_not_found",
  "session_not_found",
  "session_expired",
  "refresh_token_not_found",
  "refresh_token_already_used",
  "user_banned",
  "email_not_confirmed",
  "too_many_enrolled_mfa_factors",
  "mfa_factor_name_conflict",
  "mfa_factor_not_found",
  "insufficient_aal",
  "over_request_rate_limit",
  "request_timeout",
  "mfa_totp_enroll_not_enabled",
  "mfa_totp_verify_not_enabled",
  "mfa_enroll_rejected",
  "hook_timeout",
  "hook_timeout_after_retry",
  "hook_payload_invalid_content_type",
]);
/** Temporal, servidor y desarrollo. Nunca recibe payloads ni serializa errores. */
export function enrollmentDiagnostics(active: boolean) {
  const enabled =
    active &&
    process.env.NODE_ENV === "development" &&
    process.env.MFA_ENROLL_DIAGNOSTICS === "true";
  const attempt = enabled ? randomUUID() : undefined;
  let stage: EnrollmentStage = "configuration";
  let failureStage: EnrollmentStage | undefined;
  let enrollState: "not_called" | "calling" | "returned" = "not_called";
  function emit(
    event: "enter" | "ok" | "failed" | "stop",
    code?: EnrollmentCode,
    error?: unknown,
  ) {
    if (!enabled) return;
    try {
      let providerCode: string | undefined, providerStatus: number | undefined;
      if (error && typeof error === "object") {
        if ("code" in error && typeof error.code === "string")
          providerCode = providerCodes.has(error.code)
            ? error.code
            : "unrecognized";
        if (
          "status" in error &&
          typeof error.status === "number" &&
          Number.isInteger(error.status) &&
          error.status >= 100 &&
          error.status <= 599
        )
          providerStatus = error.status;
      }
      const exception =
        event === "failed" && error !== undefined
          ? error instanceof TypeError
            ? "type_error"
            : error instanceof RangeError
              ? "range_error"
              : error instanceof Error
                ? "error"
                : "unknown"
          : undefined;
      console.info(
        "[mfa-enroll] " +
          JSON.stringify({
            attempt,
            stage,
            event,
            enroll_state: enrollState,
            ...(code ? { code } : {}),
            ...(providerCode ? { provider_code: providerCode } : {}),
            ...(providerStatus ? { provider_status: providerStatus } : {}),
            ...(exception ? { exception } : {}),
          }),
      );
    } catch {
      /* El diagnóstico no altera el resultado de autenticación. */
    }
  }
  return {
    at(next: EnrollmentStage) {
      stage = next;
      emit("enter");
    },
    ok() {
      emit("ok");
    },
    fail(code: EnrollmentCode, error?: unknown) {
      if (code === "unexpected_exception" && failureStage === stage) return;
      failureStage = stage;
      emit("failed", code, error);
    },
    stop(code: EnrollmentCode) {
      emit("stop", code);
    },
    calling() {
      enrollState = "calling";
    },
    returned() {
      enrollState = "returned";
    },
  };
}
