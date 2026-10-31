import { CalendarDays } from "lucide-react";
import { PageHeading, Badge } from "@/components/ui/primitives";
import styles from "./calendar-placeholder.module.css";
export function CalendarPlaceholder({ admin = false }: { admin?: boolean }) {
  return (
    <>
      <PageHeading
        eyebrow={admin ? "AGENDA · ADMINISTRACIÓN" : "MI AGENDA"}
        title={admin ? "Calendario" : "Mi calendario"}
        description="Un solo lugar para encontrar cada próximo encuentro."
      />
      <section
        className={styles.panel}
        aria-label="Estructura de calendario sin datos conectados"
      >
        <div className={styles.top}>
          <CalendarDays size={20} />
          <span>Vista semanal · America/Lima</span>
          <Badge tone="amber">Sin conexión</Badge>
        </div>
        <div className={styles.grid} aria-hidden="true">
          {["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"].map((day) => (
            <div key={day} className={styles.day}>
              {day}
            </div>
          ))}
        </div>
        <div className={styles.empty}>
          <strong>Tu agenda todavía no está conectada</strong>La estructura está
          lista. No hay eventos reales ni edición habilitada.
        </div>
      </section>
      <p className={styles.note}>
        La futura agenda unificará las dos fuentes heredadas. Esta vista no
        representa una importación ni determina los asistentes de una sesión.
      </p>
    </>
  );
}
