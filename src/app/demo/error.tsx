"use client";
import Link from "next/link";
import styles from "@/components/ui/ui.module.css";
export default function PreviewError({ reset }: { reset: () => void }) {
  return (
    <main id="main-content" className={styles.centered}>
      <span className={styles.eyebrow}>DEMOSTRACIÓN</span>
      <h1>No se pudo mostrar esta vista</h1>
      <p>No se ha guardado ni modificado información.</p>
      <div className={styles.row}>
        <button className={styles.primaryLink} onClick={reset}>
          Intentar de nuevo
        </button>
        <Link className={styles.secondaryLink} href="/demo">
          Elegir otro espacio
        </Link>
      </div>
    </main>
  );
}
