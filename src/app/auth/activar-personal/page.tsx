import Link from "next/link";
import { AuthFeatureUnavailable } from "@/features/auth/components/feature-unavailable";
import { staffRegistrationEnabled } from "@/lib/supabase/staff-admin.server";
import ui from "@/components/ui/ui.module.css";
import styles from "@/features/auth/components/login.module.css";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  if (!staffRegistrationEnabled()) return <AuthFeatureUnavailable />;
  const { notice } = await searchParams;
  return (
    <main id="main-content" className={ui.centered}>
      <h1>Activar cuenta de personal</h1>
      <p>
        Usa tu identificador institucional y el código entregado por tu
        organización.
      </p>
      {notice === "invalid" && (
        <p role="alert" className={styles.feedback}>
          Revisa los datos, el código y su vigencia. Usa una contraseña de al
          menos 12 caracteres.
        </p>
      )}
      {notice === "pending" && (
        <p role="alert" className={styles.feedback}>
          No se confirmó la activación. Pide al administrador que revise el alta
          antes de volver a intentarlo.
        </p>
      )}
      <form action="/auth/activar-personal/acciones" method="post">
        <fieldset className={styles.fields}>
          <legend>Datos de activación</legend>
          <label>
            Identificador institucional
            <input
              name="identifier"
              type="email"
              autoComplete="username"
              maxLength={254}
              required
            />
          </label>
          <label>
            Código de activación
            <input
              name="code"
              type="password"
              autoComplete="off"
              minLength={43}
              maxLength={43}
              required
            />
          </label>
          <label>
            Nueva contraseña
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={72}
              required
            />
          </label>
          <label>
            Repite la contraseña
            <input
              name="confirmation"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={72}
              required
            />
          </label>
          <button type="submit" className={styles.submit}>
            Activar mi cuenta
          </button>
        </fieldset>
      </form>
      <Link href="/login">Volver al inicio de sesión</Link>
    </main>
  );
}
