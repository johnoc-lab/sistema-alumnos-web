import Link from "next/link";
import {
  Orbit,
  ArrowRight,
  LockKeyhole,
  BookOpen,
  Building2,
  Eye,
} from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import styles from "./login.module.css";
export function LoginScreen() {
  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <div className={styles.brand}>
          <Orbit size={31} color="var(--accent)" strokeWidth={1.4} />
          <div>
            <strong>Impulso Cero</strong>
            <span>ESPACIO DE APRENDIZAJE</span>
          </div>
        </div>
        <Badge tone="amber">Acceso en preparación</Badge>
      </header>
      <main id="main-content" className={styles.main}>
        <section className={styles.intro}>
          <div className={styles.orbit} aria-hidden="true">
            <Orbit size={102} strokeWidth={1} />
          </div>
          <h1>
            Tu próximo paso,
            <br />
            <span>en un solo lugar.</span>
          </h1>
          <p>
            Tus talleres, materiales y agenda. Un espacio para aprender con
            dirección y seguir construyendo.
          </p>
          <div className={styles.steps}>
            <span>
              <BookOpen size={16} />
              Aprende
            </span>
            <span>
              <Building2 size={16} />
              Conecta
            </span>
            <span>
              <Orbit size={16} />
              Avanza
            </span>
          </div>
        </section>
        <section className={styles.card} aria-labelledby="login-title">
          <Badge tone="cyan">Nueva plataforma · Fase 3</Badge>
          <h2 id="login-title">Bienvenido a tu espacio</h2>
          <p className={styles.description}>
            El ingreso real estará disponible al integrar Supabase Auth.
          </p>
          <fieldset
            className={styles.fields}
            disabled
            aria-label="Formulario de acceso aún no habilitado"
          >
            <label htmlFor="email">
              Correo electrónico
              <input
                id="email"
                type="email"
                placeholder="tu@correo.com"
                autoComplete="username"
              />
            </label>
            <label htmlFor="password">
              Contraseña
              <input
                id="password"
                type="password"
                placeholder="Tu contraseña"
                autoComplete="current-password"
              />
            </label>
          </fieldset>
          <button className={styles.submit} disabled type="button">
            <LockKeyhole size={15} />
            Ingreso no habilitado
          </button>
          <p className={styles.note}>
            No introduzcas credenciales reales.
            <br />
            Este formulario no autentica ni envía información.
          </p>
          <div className={styles.divider}>REVISA LAS INTERFACES</div>
          <Link className={styles.preview} href="/demo">
            <Eye size={17} />
            Abrir demostración
            <ArrowRight size={16} />
          </Link>
          <p className={styles.note}>
            Navegación pública con datos ficticios.
            <br />
            No crea una sesión ni concede permisos.
          </p>
          <p className={styles.footer}>Sin conexión a servicios externos</p>
        </section>
      </main>
    </div>
  );
}
