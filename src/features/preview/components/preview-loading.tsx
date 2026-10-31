import styles from "@/components/ui/ui.module.css";
export default function Loading() {
  return (
    <main id="main-content" className={styles.centered} aria-busy="true">
      <span className={styles.eyebrow}>DEMOSTRACIÓN</span>
      <p>Cargando la interfaz de ejemplo...</p>
    </main>
  );
}
