import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { enrollmentDiagnostics } from "@/lib/auth/mfa-diagnostics.server";
import { privateQrDataUri } from "@/lib/auth/mfa.server";
const privateValue = "DO_NOT_LOG_PRIVATE_MFA_PAYLOAD";
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("MFA_ENROLL_DIAGNOSTICS", "true");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe("diagnóstico temporal MFA: privacidad", () => {
  it.each([
    ["production", "true", true],
    ["test", "true", true],
    ["development", "false", true],
    ["development", "true", false],
  ] as const)(
    "no registra en %s con flag %s y activo %s",
    (environment, flag, active) => {
      vi.stubEnv("NODE_ENV", environment);
      vi.stubEnv("MFA_ENROLL_DIAGNOSTICS", flag);
      const log = vi.spyOn(console, "info").mockImplementation(() => {});
      const d = enrollmentDiagnostics(active);
      d.at("auth_enroll");
      d.fail("provider_error", { message: privateValue, code: privateValue });
      expect(log).not.toHaveBeenCalled();
    },
  );
  it("serializa solo metadatos permitidos y nunca el objeto de error", () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {}),
      toJSON = vi.fn(() => {
        throw Error(privateValue);
      });
    const d = enrollmentDiagnostics(true);
    d.at("auth_enroll");
    d.calling();
    d.fail("provider_error", {
      code: privateValue,
      status: privateValue,
      name: privateValue,
      message: privateValue,
      stack: privateValue,
      cause: privateValue,
      headers: { authorization: privateValue, cookie: privateValue },
      body: {
        qr_code: privateValue,
        secret: privateValue,
        access_token: privateValue,
      },
      toJSON,
    });
    const output = log.mock.calls.flat().join("");
    expect(output).not.toContain(privateValue);
    expect(toJSON).not.toHaveBeenCalled();
    const last = JSON.parse(
      String(log.mock.calls.at(-1)?.[0]).replace("[mfa-enroll] ", ""),
    );
    expect(last).toMatchObject({
      stage: "auth_enroll",
      enroll_state: "calling",
      code: "provider_error",
      provider_code: "unrecognized",
    });
    expect(last).not.toHaveProperty("provider_status");
    expect(Object.keys(last).sort()).toEqual(
      [
        "attempt",
        "code",
        "enroll_state",
        "event",
        "exception",
        "provider_code",
        "stage",
      ].sort(),
    );
  });
  it("admite únicamente códigos públicos conocidos y un estado HTTP numérico", () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {}),
      d = enrollmentDiagnostics(true);
    d.returned();
    d.at("enroll_response");
    d.fail("provider_error", {
      code: "mfa_totp_enroll_not_enabled",
      status: 403,
      message: privateValue,
    });
    const output = log.mock.calls.flat().join("");
    expect(output).toContain("mfa_totp_enroll_not_enabled");
    expect(output).toContain('"provider_status":403');
    expect(output).not.toContain(privateValue);
  });
  it("correlaciona un intento sin identificadores de usuario, sesión o factor", () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {}),
      d = enrollmentDiagnostics(true);
    d.at("configuration");
    d.ok();
    d.at("csrf");
    const records = log.mock.calls.map(([s]) =>
      JSON.parse(String(s).replace("[mfa-enroll] ", "")),
    );
    expect(new Set(records.map((r) => r.attempt)).size).toBe(1);
    for (const r of records)
      expect(Object.keys(r).sort()).toEqual(
        ["attempt", "stage", "event", "enroll_state"].sort(),
      );
  });
  it("un logger o getter de error que falle no altera el flujo", () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {
        throw Error(privateValue);
      }),
      d = enrollmentDiagnostics(true);
    expect(() => d.at("csrf")).not.toThrow();
    expect(() =>
      d.fail("unexpected_exception", Error(privateValue)),
    ).not.toThrow();
    log.mockImplementation(() => {});
    const error = Object.defineProperty({}, "code", {
      get() {
        throw Error(privateValue);
      },
    });
    expect(() => d.fail("provider_error", error)).not.toThrow();
  });
  it.each([
    [undefined, "qr_invalid_type_or_size"],
    ["data:image/png;base64,FAKE", "qr_invalid_prefix"],
    ["data:image/svg+xml;utf-8,%3c%ZZ", "qr_decode_failed"],
    ["data:image/svg+xml;utf-8,not-svg", "qr_invalid_structure"],
    [
      "data:image/svg+xml;utf-8,<svg onclick='PRIVATE_MARKUP'></svg>",
      "qr_blocked_markup",
    ],
    [
      'data:image/svg+xml;utf-8,<svg><path d="https://example.test"/></svg>',
      "qr_external_reference",
    ],
    ["data:image/svg+xml;utf-8,<svg><circle/></svg>", "qr_unsupported_element"],
  ])("explica rechazo QR mediante una etiqueta fija %s", (qr, reason) => {
    const rejected = vi.fn();
    expect(privateQrDataUri(qr, rejected)).toBeNull();
    expect(rejected).toHaveBeenCalledExactlyOnceWith(reason);
    expect(rejected.mock.calls.flat()).not.toContain(qr);
  });
});
