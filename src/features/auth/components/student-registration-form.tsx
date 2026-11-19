"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, GraduationCap } from "lucide-react";
import { OrganizationIdentity } from "@/components/institutional/identity";
import {
  suggestStaffUsername,
  staffUsernamePattern,
  staffUsernameMaxLength,
} from "@/features/staff/identifier";
import login from "./login.module.css";
import styles from "./student-registration.module.css";

export function StudentRegistrationForm({
  institutions,
  notice,
  recovery = false,
}: {
  institutions: Readonly<Record<string, string>>;
  notice: string | undefined;
  recovery?: boolean;
}) {
  const [institution, setInstitution] = useState("");
  const [pending, setPending] = useState(false);
  const name = institutions[institution];
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [edited, setEdited] = useState<string | null>(null);
  const username = edited ?? suggestStaffUsername(first, last);

  useEffect(() => {
    function restoreForm(event: PageTransitionEvent) {
      if (event.persisted) setPending(false);
    }
    window.addEventListener("pageshow", restoreForm);
    return () => window.removeEventListener("pageshow", restoreForm);
  }, []);

  const notices: Record<string, string> = {
    invalid: "Revisa los datos y la longitud de la contraseña.",
    unavailable:
      "No se pudo completar la solicitud. Revisa los datos o consulta al responsable de tu institución.",
    password_pending:
      "Aún no pudimos confirmar el estado de la contraseña. Vuelve a consultar con las mismas pruebas. Si vencieron, solicita una reemisión a tu institución.",
    password_rejected:
      "Auth rechazó la contraseña. Solicita una reemisión a tu institución para elegir otra.",
    revocation_pending:
      "La contraseña cambió. El cierre de las sesiones anteriores sigue pendiente. Reenvía el formulario con la contraseña que acabas de elegir para reintentar el cierre.",
    completion_pending:
      "La contraseña cambió y se solicitó el cierre global de sesiones. Vuelve a enviar las pruebas para completar el registro de la operación.",
  };
  const feedback =
    notice && Object.hasOwn(notices, notice) ? notices[notice] : null;

  return (
    <main
      id="main-content"
      className={styles.layout}
      data-organization={institution}
    >
      <section className={styles.intro} aria-labelledby="registration-title">
        <GraduationCap size={32} aria-hidden="true" />
        <h1 id="registration-title">
          {recovery
            ? "Recupera tu cuenta de alumno"
            : "Crea tu cuenta de alumno"}
        </h1>
        <p>
          {recovery
            ? "Solicita el código al responsable de tu institución después de verificar tu identidad."
            : "Accede a los talleres, materiales y actividades de tu institución desde tu Dashboard."}
        </p>
        {name && (
          <div className={styles.identity}>
            <OrganizationIdentity slug={institution} name={name} prominent />
          </div>
        )}
        <Link className={styles.returnLink} href="/login">
          <ArrowLeft size={18} aria-hidden="true" /> Volver al inicio de sesión
        </Link>
      </section>

      <form
        className={styles.form}
        action={
          recovery
            ? "/auth/recuperar-alumno/acciones"
            : "/auth/crear-cuenta/acciones"
        }
        method="post"
        onSubmit={() => setPending(true)}
      >
        {feedback && (
          <p role="alert" className={login.feedback}>
            {feedback}
          </p>
        )}
        <fieldset className={login.fields}>
          <legend>Tu institución</legend>
          <label>
            Institución
            <select
              name="organization"
              value={institution}
              onChange={(event) => setInstitution(event.target.value)}
              required
            >
              <option value="" disabled>
                Selecciona tu institución
              </option>
              {Object.entries(institutions).map(([slug, label]) => (
                <option key={slug} value={slug}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
        {!recovery && (
          <>
            <fieldset className={login.fields}>
              <legend>Modalidad de acceso</legend>
              <label className={styles.choice}>
                <input type="radio" checked readOnly /> Generar mi identificador
                automáticamente
              </label>
              <label className={styles.choice}>
                <input type="radio" disabled /> Usar correo personal
              </label>
              <small>
                El registro por correo personal estará disponible cuando se
                configure el envío de confirmaciones.
              </small>
            </fieldset>
            <fieldset className={login.fields}>
              <legend>Tus datos</legend>
              <div className={styles.names}>
                <label>
                  Nombres
                  <input
                    name="first_name"
                    autoComplete="given-name"
                    value={first}
                    onChange={(event) => setFirst(event.target.value)}
                    maxLength={100}
                    required
                  />
                </label>
                <label>
                  Apellidos
                  <input
                    name="last_name"
                    autoComplete="family-name"
                    value={last}
                    onChange={(event) => setLast(event.target.value)}
                    maxLength={100}
                    required
                  />
                </label>
              </div>
              <label>
                Usuario de acceso
                <input
                  name="username"
                  pattern={staffUsernamePattern}
                  maxLength={staffUsernameMaxLength}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  value={username}
                  onChange={(event) => setEdited(event.target.value)}
                />
              </label>
              <small>
                Usa este usuario para iniciar sesión. Puedes editar la
                sugerencia si el registro no lo acepta.
              </small>
            </fieldset>
          </>
        )}
        <fieldset className={login.fields}>
          <legend>Autorización institucional</legend>
          <label>
            {recovery ? "Código de recuperación" : "Código de inscripción"}
            <input
              name="code"
              type="password"
              autoComplete="off"
              maxLength={69}
              required
            />
          </label>
          <label>
            Prueba del canal verificado
            <input
              name="proof"
              type="password"
              autoComplete="off"
              maxLength={32}
              required
            />
          </label>
        </fieldset>
        <fieldset className={login.fields}>
          <legend>Datos de acceso</legend>
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
          <label>
            Confirma la contraseña
            <input
              name="confirmation"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={72}
              required
            />
          </label>
          <small id="student-password-help">
            Usa una contraseña única de al menos 12 caracteres y un máximo de 72
            bytes.
          </small>
        </fieldset>
        <button className={login.submit} type="submit" disabled={pending}>
          {pending
            ? "Procesando…"
            : recovery
              ? "Restablecer contraseña"
              : "Crear cuenta"}
        </button>
        <span className={styles.status} role="status">
          {pending ? "El registro se está procesando." : ""}
        </span>
      </form>
    </main>
  );
}
