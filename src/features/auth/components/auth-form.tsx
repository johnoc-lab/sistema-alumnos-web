import {
  authFeatures,
  credentialUpdatesEnabled,
} from "@/lib/auth/features.server";
import Link from "next/link";
import { authConfig } from "@/lib/supabase/config";
import styles from "./login.module.css";
export const notices: Record<string, string> = {
  credentials:
    "No se pudo iniciar sesión. Revisa tus datos o contacta al responsable de tu organización.",
  invalid: "Revisa los datos del formulario.",
  logged_out: "La sesión local está cerrada.",
  password_updated: "Contraseña actualizada. Inicia sesión nuevamente.",
  password_invalid:
    "La contraseña debe tener entre 12 y 128 caracteres y coincidir en ambos campos.",
  callback_failed:
    "El enlace no es válido, venció o la función no está disponible.",
  sent: "Si la cuenta admite recuperación, recibirás un correo con instrucciones.",
  unconfigured: "El acceso real aún no está configurado en este entorno.",
};
export function Notice({ code }: { code?: string | undefined }) {
  return typeof code === "string" && Object.hasOwn(notices, code) ? (
    <p role="status">{notices[code]}</p>
  ) : null;
}
export function AuthForm({
  mode = "login",
  next = "/seleccionar-organizacion",
}: {
  mode?: "login" | "recover" | "password";
  next?: string | undefined;
}) {
  const enabled = !!authConfig();
  const features = authFeatures();
  if (
    (mode === "recover" && !features.emailRecovery) ||
    (mode === "password" && !credentialUpdatesEnabled(features))
  )
    return null;
  return (
    <form
      action={
        mode === "login"
          ? "/auth/login"
          : mode === "recover"
            ? "/auth/recover"
            : "/auth/password"
      }
      method="post"
    >
      <fieldset className={styles.fields} disabled={!enabled}>
        {mode !== "password" && (
          <label>
            Correo electrónico
            <input
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="username"
            />
          </label>
        )}
        {mode !== "recover" && (
          <label>
            Contraseña
            <input
              name="password"
              type="password"
              required
              maxLength={mode === "password" ? 128 : 512}
              minLength={mode === "password" ? 12 : 1}
              autoComplete={
                mode === "password" ? "new-password" : "current-password"
              }
            />
          </label>
        )}
        {mode === "password" && (
          <label>
            Repite la contraseña
            <input
              name="confirmation"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
            />
          </label>
        )}
        {mode === "login" && <input type="hidden" name="next" value={next} />}
        <button className={styles.submit} type="submit">
          {!enabled
            ? "Ingreso no habilitado"
            : mode === "login"
              ? "Iniciar sesión"
              : mode === "recover"
                ? "Solicitar recuperación"
                : "Guardar contraseña"}
        </button>
      </fieldset>
      {!enabled && (
        <p className={styles.note}>
          Configura el acceso real antes de introducir credenciales.
        </p>
      )}
      {mode === "login" && enabled && features.emailRecovery && (
        <Link href="/auth/recuperar">Recuperar acceso</Link>
      )}
    </form>
  );
}
export function LogoutForm() {
  return (
    <form action="/auth/logout" method="post">
      <input type="hidden" name="intent" value="logout" />
      <button type="submit">Cerrar sesión</button>
    </form>
  );
}
