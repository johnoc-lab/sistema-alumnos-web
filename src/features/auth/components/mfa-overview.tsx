import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { CampusHeader } from "@/components/institutional/identity";
import campus from "@/components/institutional/campus.module.css";
import { LogoutForm } from "./auth-form";
import ui from "@/components/ui/ui.module.css";
import styles from "./mfa.module.css";

const notices: Record<string, string> = {
  failed: "No se pudo completar la operación. Inténtalo nuevamente.",
  expired: "La verificación venció. Inicia una nueva solicitud.",
  invalid:
    "No se pudo verificar el código. Revisa tu aplicación autenticadora e inténtalo nuevamente.",
  verified: "La verificación en dos pasos está completada para esta sesión.",
  exists:
    "La cuenta ya tiene una configuración TOTP. Utiliza la opción de verificación correspondiente.",
};

export function MfaOverview({
  aal,
  factors,
  notice,
  role = "admin",
  next = "/seleccionar-organizacion",
}: {
  aal: "aal1" | "aal2";
  factors: Array<{ id: string; status: "verified" | "unverified" }>;
  notice?: string | undefined;
  role?: "admin" | "student";
  next?: string;
}) {
  const verifiedFactors = factors.filter(
    (factor) => factor.status === "verified",
  );
  const requiresVerification = aal === "aal1" && verifiedFactors.length > 0;
  const visibleFactors = requiresVerification ? verifiedFactors : factors;
  const back = role === "admin" && aal === "aal1" ? "/seleccionar-organizacion" : next;
  const destination = <input type="hidden" name="next" value={next} />;
  const message =
    notice &&
    Object.hasOwn(notices, notice) &&
    (notice !== "verified" || aal === "aal2")
      ? notices[notice]
      : undefined;
  return (
    <div className={campus.page}>
      <CampusHeader>
        <span>Seguridad de la cuenta</span>
      </CampusHeader>
      <main
        id="main-content"
        className={styles.layout}
        data-access-state="mfa"
        data-assurance-level={aal}
      >
        <div className={styles.content}>
          <header className={styles.heading}>
            <ShieldCheck aria-hidden="true" />
            <p className={ui.eyebrow}>SEGURIDAD DE LA CUENTA</p>
            <h1>Verificación en dos pasos</h1>
            <p>
              {role === "admin"
                ? "La verificación en dos pasos es obligatoria para acceder al panel administrativo."
                : "Puedes configurar un autenticador. Una vez confirmado, necesitarás su código cada vez que inicies sesión."}
            </p>
          </header>
          {message && (
            <p role="status" className={ui.notice}>
              {message}
            </p>
          )}
          {aal === "aal2" ? (
            <p className={ui.notice} role="status">
              Tu sesión tiene la verificación en dos pasos completada.
            </p>
          ) : requiresVerification ? (
            <p className={ui.notice}>Verifica tu código TOTP para continuar.</p>
          ) : null}
          {factors.length === 0 ? (
            <section className={ui.panel} aria-labelledby="mfa-setup-title">
              <h2 id="mfa-setup-title">
                Configurar una aplicación autenticadora
              </h2>
              <p>
                Se mostrará un QR de configuración después de iniciar este paso.
                Escanéalo únicamente con una aplicación autenticadora bajo tu
                control.
              </p>
              <form action="/auth/mfa/enroll" method="post">
                {destination}
                <button type="submit" className={ui.primaryLink}>
                  Configurar TOTP
                </button>
              </form>
            </section>
          ) : (
            <section aria-labelledby="mfa-factors-title">
              <h2 id="mfa-factors-title">Aplicaciones autenticadoras</h2>
              <ul className={styles.factors}>
                {visibleFactors.map((factor, index) => (
                  <li
                    className={ui.panel}
                    key={factor.id}
                    data-factor-status={factor.status}
                  >
                    <h3>Aplicación autenticadora {index + 1}</h3>
                    <p className={styles.status}>
                      {factor.status === "verified"
                        ? "Configuración confirmada"
                        : "Configuración pendiente"}
                    </p>
                    {factor.status === "unverified" && (
                      <p>
                        Si ya escaneaste el QR, continúa con la verificación. Si
                        no guardaste el QR, cancela esta configuración pendiente
                        y vuelve a comenzar.
                      </p>
                    )}
                    <form action="/auth/mfa/challenge" method="post">
                      {destination}
                      <input type="hidden" name="factor_id" value={factor.id} />
                      <button type="submit" className={ui.primaryLink}>
                        {factor.status === "verified"
                          ? "Verificar código TOTP"
                          : "Verificar configuración"}
                      </button>
                    </form>
                    {factor.status === "unverified" && (
                      <form action="/auth/mfa/cancel" method="post">
                        {destination}
                        <input
                          type="hidden"
                          name="factor_id"
                          value={factor.id}
                        />
                        <button type="submit" className={ui.secondaryLink}>
                          Cancelar configuración pendiente
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <nav className={ui.row} aria-label="Navegación de seguridad">
            {!requiresVerification && (
              <Link href={back} className={ui.secondaryLink}>
                {back.endsWith("/dashboard/perfil")
                  ? "Volver a Mi perfil"
                  : back === "/seleccionar-organizacion"
                    ? "Volver a mis organizaciones"
                    : "Continuar"}
              </Link>
            )}
            <LogoutForm />
          </nav>
        </div>
      </main>
    </div>
  );
}
