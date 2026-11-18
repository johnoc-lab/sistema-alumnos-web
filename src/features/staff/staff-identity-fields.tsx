"use client";

import { useState } from "react";
import academic from "@/features/academic/academic.module.css";
import {
  resolveStaffIdentifier,
  staffUsernameMaxLength,
  staffUsernamePattern,
  suggestStaffUsername,
} from "./identifier";

export function StaffIdentityFields() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [editedUsername, setEditedUsername] = useState<string | null>(null);
  const username = editedUsername ?? suggestStaffUsername(firstName, lastName);
  const identifier = resolveStaffIdentifier(username);

  return (
    <>
      <label className={academic.field}>
        Nombre
        <input
          name="first_name"
          autoComplete="off"
          required
          maxLength={100}
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
        />
      </label>
      <label className={academic.field}>
        Apellidos
        <input
          name="last_name"
          autoComplete="off"
          required
          maxLength={100}
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
        />
      </label>
      <label className={academic.field}>
        Usuario de acceso
        <input
          name="identifier"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={staffUsernameMaxLength}
          pattern={staffUsernamePattern}
          title="Usa únicamente letras y números."
          aria-describedby="staff-identifier-help"
          value={username}
          onChange={(event) => setEditedUsername(event.target.value)}
        />
      </label>
      <p id="staff-identifier-help" className={academic.hint}>
        Puedes editar la sugerencia. Usa únicamente letras y números.
      </p>
      {identifier && (
        <p className={academic.hint}>
          Identificador institucional: <code>{identifier}</code>
        </p>
      )}
    </>
  );
}
