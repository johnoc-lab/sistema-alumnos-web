"use client";
import { useState, type ReactNode } from "react";
import css from "./academic.module.css";

export function MaterialSourceFields({
  initial,
  pdfContent,
  linksContent,
}: {
  initial: "pdf" | "links";
  pdfContent: ReactNode;
  linksContent: ReactNode;
}) {
  const [source, setSource] = useState(initial);
  return (
    <div className={css.wide}>
      <label className={css.field}>
        <span>¿Qué vas a publicar?</span>
        <select name="source" value={source} onChange={(event) => setSource(event.currentTarget.value as "pdf" | "links")}>
          <option value="pdf">PDF del taller</option>
          <option value="links">Enlaces de clase</option>
        </select>
      </label>
      {source === "pdf" ? pdfContent : linksContent}
    </div>
  );
}
