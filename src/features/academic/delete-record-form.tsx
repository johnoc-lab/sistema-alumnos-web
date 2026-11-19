"use client";

import type { FormEvent } from "react";
import { Trash2 } from "lucide-react";
import css from "./academic.module.css";

export function DeleteRecordForm({
  slug,
  kind,
  id,
  version,
  title,
  label,
}: {
  slug: string;
  kind: "delete-announcement" | "delete-material";
  id: string;
  version: number;
  title: string;
  label: string;
}) {
  function confirmDelete(event: FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        "¿Eliminar " +
          label.toLowerCase() +
          " «" +
          title +
          "»? Esta acción no se puede deshacer.",
      )
    )
      event.preventDefault();
  }

  return (
    <form
      className={css.deleteForm}
      action={"/o/" + encodeURIComponent(slug) + "/acciones"}
      method="post"
      onSubmit={confirmDelete}
    >
      <input type="hidden" name="action" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <button
        className={css.deleteButton}
        type="submit"
        aria-label={"Eliminar " + label.toLowerCase() + ": " + title}
      >
        <Trash2 size={16} aria-hidden="true" />
        Eliminar {label.toLowerCase()}
      </button>
    </form>
  );
}
