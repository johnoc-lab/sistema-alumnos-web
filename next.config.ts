import { publicSupabaseConfig } from "./src/lib/supabase/config";
import type { NextConfig } from "next";
const development = process.env.NODE_ENV === "development";
const policy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (development ? " 'unsafe-eval'" : ""),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'" +
    (publicSupabaseConfig()
      ? " https://rnxgrunnrdlgjsbsrjev.supabase.co"
      : "") +
    (development ? " ws://127.0.0.1:* ws://localhost:*" : ""),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");
const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/auth/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
        ],
      },
      {
        source: "/o/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
        ],
      },
      {
        source: "/seleccionar-organizacion",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: policy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      // Un POST nativo con no-referrer envía Origin: null. Conserva solo el origen,
      // sin rutas ni parámetros en Referer; el servidor sigue exigiendo Origin exacto.
      ...[
        "/login",
        "/auth/:path*",
        "/o/:path*",
        "/seleccionar-organizacion",
      ].map((source) => ({
        source,
        headers: [{ key: "Referrer-Policy", value: "strict-origin" }],
      })),
    ];
  },
};
export default config;
