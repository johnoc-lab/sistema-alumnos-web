export function authCsp(
  nonce: string,
  development: boolean,
  connectOrigin?: string,
) {
  return [
    "default-src 'self'",
    "script-src 'self' 'nonce-" +
      nonce +
      "' 'strict-dynamic'" +
      (development ? " 'unsafe-eval'" : ""),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'" +
      (connectOrigin ? " " + connectOrigin : "") +
      (development ? " ws://127.0.0.1:* ws://localhost:*" : ""),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}
