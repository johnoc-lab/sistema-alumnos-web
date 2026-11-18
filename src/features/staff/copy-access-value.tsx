"use client";

import { useState } from "react";
import ui from "@/components/ui/ui.module.css";
import styles from "./staff.module.css";

export function CopyAccessValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const [message, setMessage] = useState("");

  async function copy() {
    setMessage("");
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Copiado.");
    } catch {
      setMessage("Selecciona el texto para copiarlo manualmente.");
    }
  }

  return (
    <div className={styles.accessValue}>
      <h3>{label}</h3>
      <code>{value}</code>
      <button type="button" className={ui.secondaryLink} onClick={copy}>
        Copiar {label.toLowerCase()}
      </button>
      <span role="status">{message}</span>
    </div>
  );
}
