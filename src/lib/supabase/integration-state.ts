export const integrationState = Object.freeze({
  enabled: false,
  reason: "Supabase no está conectado en la fase 3.",
} as const);
export class IntegrationUnavailableError extends Error {
  constructor() {
    super(integrationState.reason);
    this.name = "IntegrationUnavailableError";
  }
}
