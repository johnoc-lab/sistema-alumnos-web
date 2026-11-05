import Link from "next/link";
import styles from "@/components/ui/ui.module.css";
export function AccessPending({
  state = "unconfigured",
  message = "Configura el acceso real para continuar.",
}: {
  state?: string;
  message?: string;
}) {
  return (
    <main
      id="main-content"
      data-access-state={state}
      className={styles.centered}
    >
      <h1>Acceso no disponible</h1>
      <p>{message}</p>
      <Link href="/login">Volver al login</Link>
      <Link href="/demo">Ver demostración pública</Link>
    </main>
  );
}
