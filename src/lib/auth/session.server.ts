import "server-only";
export type SessionResult =
  | { status: "unconfigured"; user: null }
  | { status: "anonymous"; user: null };
/** Fail closed: las cookies y parámetros recibidos no fabrican una identidad. */
export async function readSession(): Promise<SessionResult> {
  return { status: "unconfigured", user: null };
}
