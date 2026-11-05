import Link from "next/link";
import styles from "@/components/ui/ui.module.css";
export function AuthFeatureUnavailable() {
  return (
    <main id="main-content" className={styles.centered}>
      <h1>Opción no disponible</h1>
      <p>Esta función de acceso no está habilitada en este entorno.</p>
      <Link href="/login">Volver al login</Link>
    </main>
  );
}
