"use client";
import { useId, type RefObject } from "react";
import { X } from "lucide-react";
import { Badge } from "./primitives";
import styles from "./management.module.css";
export interface PreviewField {
  label: string;
  value: string;
  multiline?: boolean;
}
export function PreviewDialog({
  dialogRef,
  title,
  fields,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  title: string;
  fields: readonly PreviewField[];
}) {
  const id = useId();
  return (
    <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={id}>
      <header className={styles.dialogHeader}>
        <h2 id={id}>{title}</h2>
        <form method="dialog">
          <button
            className={styles.close}
            aria-label="Cerrar formulario de ejemplo"
          >
            <X size={20} />
          </button>
        </form>
      </header>
      <div className={styles.dialogBody}>
        <Badge tone="amber">Formulario de ejemplo · Solo lectura</Badge>
        <p className={styles.dialogDescription}>
          Este formulario demuestra los campos previstos. No permite guardar,
          invitar, matricular ni modificar información.
        </p>
        <fieldset className={styles.fields} disabled>
          {fields.map((field, index) => (
            <label key={field.label} htmlFor={id + "-" + index}>
              {field.label}
              {field.multiline ? (
                <textarea
                  id={id + "-" + index}
                  rows={3}
                  value={field.value}
                  readOnly
                />
              ) : (
                <input
                  id={id + "-" + index}
                  value={field.value}
                  placeholder="Campo por completar en una fase posterior"
                  readOnly
                />
              )}
            </label>
          ))}
        </fieldset>
        <div className={styles.dialogFooter}>
          <span>Sin conexión · Sin envío de datos</span>
          <button className={styles.disabledAction} type="button" disabled>
            Guardar no disponible
          </button>
        </div>
      </div>
    </dialog>
  );
}
