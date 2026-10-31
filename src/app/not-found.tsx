import Link from "next/link";
import styles from "@/components/ui/ui.module.css";
export default function NotFound() {
  return (
    <main id="main-content" className={styles.centered}>
      <span className={styles.eyebrow}>404 · RUTA NO DISPONIBLE</span>
      <h1>No encontramos esta página</h1>
      <p>Comprueba la dirección o vuelve al inicio.</p>
      <Link className={styles.primaryLink} href="/login">
        Volver al acceso
      </Link>
    </main>
  );
}
