import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  set: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: mocks.set }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.create,
}));
import config from "../next.config";
import { AuthForm, LogoutForm } from "@/features/auth/components/auth-form";
import { authPost } from "@/lib/auth/handlers.server";

// Un Chromium ya instalado; nunca descarga software ni usa el perfil personal.
const browser = [
  process.env.AUTH_TEST_BROWSER,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].find((path): path is string => !!path && existsSync(path));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_AUTH_ENABLED", "true");
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_URL",
    "https://rnxgrunnrdlgjsbsrjev.supabase.co",
  );
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "sb_publishable_TEST_ONLY_NOT_A_REAL_KEY_123456",
  );
  vi.stubEnv("AUTH_FLOW_SECRET", "test-only-not-a-deployment-secret".repeat(2));
  for (const flag of [
    "AUTH_EMAIL_RECOVERY_ENABLED",
    "AUTH_TOKEN_HASH_RECOVERY_ENABLED",
    "AUTH_INVITATION_ACCEPT_ENABLED",
  ])
    vi.stubEnv(flag, "false");
  mocks.signIn.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.create.mockResolvedValue({
    auth: { signInWithPassword: mocks.signIn, signOut: mocks.signOut },
  });
});
afterEach(() => vi.unstubAllEnvs());

async function pagePolicy(source: string) {
  const rules = await config.headers!();
  let policy: string | undefined;
  for (const rule of rules)
    if (rule.source === "/:path*" || rule.source === source)
      for (const header of rule.headers)
        if (header.key.toLowerCase() === "referrer-policy")
          policy = header.value;
  return policy;
}

async function nativePost(
  policy: string,
  action: "login" | "logout" = "login",
) {
  const seen: {
    origin?: string;
    site?: string;
    mode?: string;
    contentType?: string;
    referer?: string;
    status?: number;
    location?: string | null;
    finalPath?: string;
    finalMethod?: string;
  } = {};
  let origin = "";
  let failed = false;
  const server = createServer(async (req, res) => {
    try {
      if (req.method === "POST") {
        // Solo cabeceras permitidas; no cookies, Authorization ni logs del cuerpo.
        const headers = new Headers();
        for (const name of [
          "origin",
          "sec-fetch-site",
          "sec-fetch-mode",
          "content-type",
        ]) {
          const value = req.headers[name];
          if (typeof value === "string") headers.set(name, value);
        }
        const parts: Buffer[] = [];
        for await (const part of req) parts.push(Buffer.from(part));
        seen.referer =
          typeof req.headers.referer === "string"
            ? req.headers.referer
            : "(missing)";
        seen.origin = headers.get("origin") ?? "(missing)";
        seen.site = headers.get("sec-fetch-site") ?? "(missing)";
        seen.mode = headers.get("sec-fetch-mode") ?? "(missing)";
        seen.contentType = headers.get("content-type") ?? "(missing)";
        const response = await authPost(
          new Request(origin + req.url, {
            method: "POST",
            headers,
            body: Buffer.concat(parts),
          }),
          action,
        );
        seen.status = response.status;
        seen.location = response.headers.get("location");
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(await response.text());
      } else if (req.url?.startsWith("/login?case=")) {
        const form = renderToStaticMarkup(
          createElement(action === "login" ? AuthForm : LogoutForm),
        );
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Referrer-Policy": policy,
          "Cache-Control": "no-store",
          "Content-Security-Policy":
            "default-src 'none'; script-src 'nonce-test-only'; form-action 'self'; base-uri 'none'",
        });
        res.end(`<!doctype html><title>Native form regression</title>${form}<script nonce="test-only">
          const form = document.querySelector("form");
          if (form.elements.email) form.elements.email.value = "synthetic@example.test";
          if (form.elements.password) form.elements.password.value = "not-a-real-password";
          form.requestSubmit();
        </script>`);
      } else {
        if (req.url !== "/favicon.ico") {
          seen.finalPath = req.url ?? "";
          seen.finalMethod = req.method ?? "";
        }
        res.writeHead(200, {
          "Content-Type": "text/html",
          "Referrer-Policy": "no-referrer",
        });
        res.end("<!doctype html><title>Completed</title>");
      }
    } catch {
      failed = true;
      res.writeHead(500);
      res.end("Test fixture failed");
    }
  });
  const profile = mkdtempSync(join(tmpdir(), "sistema-alumnos-origin-test-"));
  try {
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    if (!address || typeof address === "string")
      throw Error("No local test server");
    origin = `http://127.0.0.1:${address.port}`;
    vi.stubEnv("APP_ORIGIN", origin);
    await new Promise<void>((done, reject) => {
      const child = spawn(
        browser!,
        [
          "--headless",
          "--dump-dom",
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-background-networking",
          "--disable-component-update",
          "--disable-extensions",
          "--disable-sync",
          `--user-data-dir=${profile}`,
          origin + "/login?case=regression",
        ],
        { stdio: "ignore", windowsHide: true },
      );
      const timeout = setTimeout(() => {
        child.kill();
        reject(Error("Chromium native form timed out"));
      }, 20000);
      child.once("error", () => {
        clearTimeout(timeout);
        reject(Error("Could not launch test Chromium"));
      });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        if (code !== 0) reject(Error("Test Chromium failed"));
        else done();
      });
    });
    expect(failed).toBe(false);
    return { ...seen, expectedOrigin: origin };
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    const target = resolve(profile);
    if (
      target.startsWith(resolve(tmpdir()) + sep) &&
      target.split(sep).at(-1)?.startsWith("sistema-alumnos-origin-test-")
    )
      await rm(target, {
        recursive: true,
        force: true,
        maxRetries: 12,
        retryDelay: 100,
      });
  }
}

describe("política HTTP de páginas con formularios nativos", () => {
  it.each(["/login", "/auth/:path*", "/o/:path*", "/seleccionar-organizacion"])(
    "permite Origin en %s sin transmitir rutas o parámetros por Referer",
    async (source) => {
      expect(await pagePolicy(source)).toBe("strict-origin");
    },
  );
  it("la demo conserva no-referrer", async () => {
    expect(await pagePolicy("/demo/:path*")).toBe("no-referrer");
  });
});

describe.skipIf(!browser)(
  "POST real de Chromium, Auth totalmente simulado",
  () => {
    it("reproduce el error anterior: no-referrer genera Origin null y 403 antes de Auth", async () => {
      const seen = await nativePost("no-referrer");
      expect(seen).toMatchObject({
        origin: "null",
        site: "same-origin",
        mode: "navigate",
        status: 403,
        location: null,
      });
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.signIn).not.toHaveBeenCalled();
    }, 40000);
    it("la política configurada deja pasar el formulario real y el 303 se sigue con GET", async () => {
      const seen = await nativePost((await pagePolicy("/login"))!);
      expect(seen.origin).toBe(seen.expectedOrigin);
      expect(seen).toMatchObject({
        site: "same-origin",
        mode: "navigate",
        status: 303,
        finalPath: "/seleccionar-organizacion",
        finalMethod: "GET",
      });
      expect(seen.referer).toBe(seen.expectedOrigin + "/");
      expect(seen.contentType).toContain("application/x-www-form-urlencoded");
      expect(seen.location).toBe(
        seen.expectedOrigin + "/seleccionar-organizacion",
      );
      expect(mocks.signIn).toHaveBeenCalledTimes(1);
    }, 25000);
    it("un rechazo de credenciales vuelve al login con mensaje genérico mediante 303 y GET", async () => {
      mocks.signIn.mockResolvedValue({ error: Error("simulated rejection") });
      const seen = await nativePost((await pagePolicy("/login"))!);
      expect(seen).toMatchObject({
        status: 303,
        finalPath: "/login?notice=credentials",
        finalMethod: "GET",
      });
      expect(seen.location).toBe(
        seen.expectedOrigin + "/login?notice=credentials",
      );
    }, 25000);
    it("el logout nativo también conserva Origin y vuelve por GET", async () => {
      const seen = await nativePost((await pagePolicy("/o/:path*"))!, "logout");
      expect(seen.origin).toBe(seen.expectedOrigin);
      expect(seen).toMatchObject({
        status: 303,
        finalPath: "/login?notice=logged_out",
        finalMethod: "GET",
      });
      expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    }, 25000);
  },
);
