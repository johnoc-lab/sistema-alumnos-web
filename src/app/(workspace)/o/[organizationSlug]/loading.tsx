import styles from "./loading.module.css";

export default function Loading() {
  return (
    <main className={styles.loading} aria-busy="true" aria-label="Cargando sección">
      <div className={styles.heading} />
      <div className={styles.description} />
      <div className={styles.grid}>
        <div className={styles.card} />
        <div className={styles.card} />
        <div className={styles.card} />
      </div>
      <div className={styles.panel} />
    </main>
  );
}
