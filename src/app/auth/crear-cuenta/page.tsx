import Link from "next/link";
import { AuthFeatureUnavailable } from "@/features/auth/components/feature-unavailable";
import {
  studentInstitutions,
  studentRegistrationConfig,
} from "@/features/auth/student-registration.server";
import styles from "@/features/auth/components/login.module.css";
import ui from "@/components/ui/ui.module.css";
import campus from "@/components/institutional/campus.module.css";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  if (!studentRegistrationConfig()) return <AuthFeatureUnavailable />;
  const { notice } = await searchParams;
  return (
    <main
      id="main-content"
      className={`${campus.page} ${ui.centered} ${styles.registrationPage}`}
    >
      <h1>Crear cuenta de alumno</h1>
      <p>Usa el correo de prueba autorizado por tu institución.</p>
      {notice === "invalid" && (
        <p role="alert" className={styles.feedback}>
          Revisa los datos y la longitud de la contraseña.
        </p>
      )}
      {notice === "unavailable" && (
        <p role="alert" className={styles.feedback}>
          No se pudo completar el registro. Revisa tus datos o consulta al
          responsable de tu institución.
        </p>
      )}
      <form action="/auth/crear-cuenta/acciones" method="post">
        <fieldset className={styles.fields + " " + styles.activationFields}>
          <legend>Datos del alumno</legend>
          <label>
            Institución
            <select name="organization" defaultValue="" required>
              <option value="" disabled>
                Selecciona tu institución
              </option>
              {Object.entries(studentInstitutions).map(([slug, name]) => (
                <option key={slug} value={slug}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nombres
            <input
              name="first_name"
              autoComplete="given-name"
              maxLength={100}
              required
            />
          </label>
          <label>
            Apellidos
            <input
              name="last_name"
              autoComplete="family-name"
              maxLength={100}
              required
            />
          </label>
          <label>
            Correo electrónico
            <input
              name="email"
              type="email"
              autoComplete="username"
              maxLength={254}
              required
            />
          </label>
          <label>
            Contraseña
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={72}
              aria-describedby="student-password-help"
              required
            />
          </label>
          <small id="student-password-help">
            Usa al menos 12 caracteres y un máximo de 72 bytes.
          </small>
          <button className={styles.submit} type="submit">
            Crear cuenta
          </button>
        </fieldset>
      </form>
      <Link href="/login" className={ui.secondaryLink}>
        Volver al inicio de sesión
      </Link>
    </main>
  );
}
