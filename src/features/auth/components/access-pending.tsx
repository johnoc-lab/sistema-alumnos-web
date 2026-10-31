import Link from "next/link";
import { LockKeyhole, ArrowRight, Orbit } from "lucide-react";
import { readSession } from "@/lib/auth/session.server";
import styles from "@/components/ui/ui.module.css";
export async function AccessPending({
  previewPath = "/demo",
}: {
  previewPath?: string;
}) {
  const session = await readSession();
  return (
    <main
      id="main-content"
      data-access-state={session.status}
      className={styles.centered}
    >
      <Orbit size={32} color="var(--accent)" aria-hidden="true" />
      <span className={styles.eyebrow}>SISTEMA DE ALUMNOS · ACCESO REAL</span>
      <div className={styles.iconBox}>
        <LockKeyhole size={24} />
      </div>
      <h1>El acceso aún no está habilitado</h1>
      <p>
        La autenticación y la validación de membresías están pendientes de
        integración. Esta ruta no muestra datos ni concede permisos.
      </p>
      <div className={styles.row}>
        <Link className={styles.secondaryLink} href="/login">
          Volver al login
        </Link>
        <Link className={styles.primaryLink} href={previewPath}>
          Ver interfaz de demostración <ArrowRight size={16} />
        </Link>
      </div>
      <span className={styles.label}>SUPABASE NO CONECTADO</span>
    </main>
  );
}
