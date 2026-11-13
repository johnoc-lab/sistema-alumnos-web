"use client";

import { useState } from "react";
import {
  assignableStaffRanks,
  staffModuleKeys,
  staffModules,
  staffRanks,
  type StaffPermission,
  type StaffRank,
} from "@/lib/authorization/staff";
import academic from "@/features/academic/academic.module.css";
import css from "./staff.module.css";

export function StaffPermissionFields({
  initialRank = "administrator",
  initialModules = [],
  registering = false,
}: {
  initialRank?: StaffRank;
  initialModules?: readonly StaffPermission[];
  registering?: boolean;
}) {
  const [rank, setRank] = useState(initialRank);
  const [certificates, setCertificates] = useState(
    initialModules.includes("certificates"),
  );
  return (
    <>
      <label className={academic.field}>
        Rango
        <select
          name="rank"
          value={rank}
          onChange={(event) => setRank(event.target.value as StaffRank)}
        >
          {assignableStaffRanks
            .filter((key) => !registering || key !== "principal")
            .map((key) => (
              <option key={key} value={key}>
                {staffRanks[key]}
              </option>
            ))}
        </select>
      </label>
      {rank === "principal" ? (
        <p>Tendrá acceso a todos los módulos después de verificar MFA.</p>
      ) : (
        <fieldset className={css.permissions}>
          <legend>Módulos autorizados</legend>
          {staffModuleKeys
            .filter((key) => !registering || key !== "certificates")
            .map((key) => (
              <label className={css.checkbox} key={key}>
                {key === "certificates" ? (
                  <input
                    type="checkbox"
                    name="module"
                    value={key}
                    checked={certificates}
                    onChange={(event) => setCertificates(event.target.checked)}
                  />
                ) : (
                  <input
                    type="checkbox"
                    name="module"
                    value={key}
                    defaultChecked={initialModules.includes(key)}
                  />
                )}
                {staffModules[key].label}
              </label>
            ))}
        </fieldset>
      )}
      {!registering &&
        certificates &&
        (rank === "teacher" || rank === "administrator") && (
          <fieldset className={css.permissions}>
            <legend>Permiso para el futuro módulo de Certificados</legend>
            {rank === "teacher" ? (
              <label key="recommend" className={css.checkbox}>
                <input
                  type="checkbox"
                  name="module"
                  value="certificates.recommend"
                  defaultChecked={initialModules.includes(
                    "certificates.recommend",
                  )}
                />
                Recomendar certificados
              </label>
            ) : (
              <label key="approve" className={css.checkbox}>
                <input
                  type="checkbox"
                  name="module"
                  value="certificates.approve"
                  defaultChecked={initialModules.includes(
                    "certificates.approve",
                  )}
                />
                Aprobar recomendaciones
              </label>
            )}
          </fieldset>
        )}
    </>
  );
}
