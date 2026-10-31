import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import styles from "./ui.module.css";
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "amber" | "purple" | "cyan";
}) {
  return <span className={styles.badge + " " + styles[tone]}>{children}</span>;
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.heading}>
      <div>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function EmptyFeature({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <section className={styles.empty}>
      <div className={styles.iconBox}>
        <Icon size={24} strokeWidth={1.5} />
      </div>
      <Badge tone="amber">Estructura inicial</Badge>
      <h2>{title}</h2>
      <p>{description}</p>
      <span className={styles.label}>
        SIN CONEXIÓN · SIN OPERACIONES REALES
      </span>
    </section>
  );
}
