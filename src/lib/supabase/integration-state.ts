export const integrationState = {
  enabled: false,
  reason: "Los repositorios académicos y CRUD siguen sin conexión en fase 5A.",
} as const;
export class IntegrationUnavailableError extends Error {
  constructor() {
    super(
      "Configura y habilita explícitamente Supabase Auth para este entorno.",
    );
    this.name = "IntegrationUnavailableError";
  }
}
