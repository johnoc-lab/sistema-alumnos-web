import { authConfig } from "@/lib/supabase/config";
import { AuthForm, Notice } from "./auth-form";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  FolderOpen,
  CalendarDays,
  Eye,
} from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import {
  CampusHeader,
  OrganizationIdentity,
} from "@/components/institutional/identity";
import campus from "@/components/institutional/campus.module.css";
import styles from "./login.module.css";
export function LoginScreen({
  next,
  notice,
}: {
  next?: string | undefined;
  notice?: string | undefined;
}) {
  return (
    <div className={campus.page + " " + styles.page}>
      <CampusHeader>
        <Badge tone="neutral">
          {authConfig() ? "Acceso institucional" : "Acceso en preparación"}
        </Badge>
      </CampusHeader>
      <main id="main-content" className={styles.main}>
        <section className={styles.intro}>
          <p className={styles.kicker}>APRENDE. CONECTA. AVANZA.</p>
          <h1>
            Tu aprendizaje,
            <br />
            <span>un paso más allá.</span>
          </h1>
          <p>
            Tus talleres, materiales y actividades en un espacio compartido para
            seguir construyendo.
          </p>
          <div className={styles.resources}>
            <span>
              <BookOpen size={21} aria-hidden="true" />
              <strong>Talleres</strong>
              <small>Continúa tu formación</small>
            </span>
            <span>
              <FolderOpen size={21} aria-hidden="true" />
              <strong>Materiales</strong>
              <small>Recursos a tu alcance</small>
            </span>
            <span>
              <CalendarDays size={21} aria-hidden="true" />
              <strong>Agenda</strong>
              <small>Organiza tu aprendizaje</small>
            </span>
          </div>
          <div className={styles.initiatives}>
            <OrganizationIdentity slug="impulso-cero" name="Impulso Cero" />
            <OrganizationIdentity slug="incubadora" name="Incubadora" />
          </div>
        </section>
        <section className={styles.card} aria-labelledby="login-title">
          <span className={styles.kicker}>BIENVENIDO A TU CAMPUS</span>
          <h2 id="login-title">Inicia sesión</h2>
          <p className={styles.description}>
            Usa la cuenta asignada por tu organización.
          </p>
          <Notice code={notice} />
          <AuthForm next={next} />
          <div className={styles.divider}>EXPLORAR SIN CUENTA</div>
          <Link className={styles.preview} href="/demo">
            <Eye size={17} aria-hidden="true" />
            Ver demostración
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <p className={styles.note}>
            La demo usa datos ficticios y no concede acceso académico.
          </p>
        </section>
      </main>
      <footer className={styles.footer}>
        Sistema Alumnos · Un espacio para aprender con propósito.
      </footer>
    </div>
  );
}
