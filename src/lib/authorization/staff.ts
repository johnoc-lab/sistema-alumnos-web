export const staffRanks = {
  principal: "Administrador principal",
  administrator: "Administrador limitado",
  teacher: "Profesor",
  secretary: "Secretaría",
} as const;
export type StaffRank = keyof typeof staffRanks;
export const assignableStaffRanks = [
  "principal",
  "administrator",
  "teacher",
  "secretary",
] as const;

export const staffModules = {
  students: { path: "admin/alumnos", label: "Alumnos" },
  courses: { path: "admin/cursos", label: "Talleres" },
  enrollments: { path: "admin/matriculas", label: "Matrículas" },
  materials: { path: "admin/materiales", label: "Materiales" },
  announcements: { path: "admin/avisos", label: "Avisos" },
  schedule: { path: "admin/horario", label: "Horario" },
  attendance: { path: "admin/asistencia", label: "Asistencia" },
  certificates: { path: "admin/certificados", label: "Certificados" },
} as const;
export type StaffModule = keyof typeof staffModules;
export const certificatePermissions = [
  "certificates.recommend",
  "certificates.approve",
] as const;
export type StaffPermission =
  | StaffModule
  | (typeof certificatePermissions)[number];
export type StaffRequirement = StaffPermission | "staff.manage" | "overview";
export const staffModuleKeys = Object.keys(staffModules) as StaffModule[];

export function isStaffRank(value: unknown): value is StaffRank {
  return typeof value === "string" && Object.hasOwn(staffRanks, value);
}

export function isStaffPermission(value: unknown): value is StaffPermission {
  return (
    typeof value === "string" &&
    (Object.hasOwn(staffModules, value) ||
      value === "certificates.recommend" ||
      value === "certificates.approve")
  );
}

export function validStaffPermissions(
  rank: StaffRank,
  permissions: readonly StaffPermission[],
): boolean {
  return (
    permissions.length === new Set(permissions).size &&
    (rank !== "principal" || permissions.length === 0) &&
    (!permissions.includes("certificates.recommend") ||
      (rank === "teacher" && permissions.includes("certificates"))) &&
    (!permissions.includes("certificates.approve") ||
      (rank === "administrator" && permissions.includes("certificates")))
  );
}

export function hasStaffPermission(
  membership: {
    staffRank: StaffRank | null;
    allowedModules: readonly StaffPermission[];
  },
  requirement: StaffRequirement,
): boolean {
  if (!membership.staffRank) return false;
  if (requirement === "overview") return true;
  if (membership.staffRank === "principal") return true;
  return (
    requirement !== "staff.manage" &&
    membership.allowedModules.includes(requirement)
  );
}

export function staffSectionPermission(
  section: string,
): StaffModule | "staff.manage" | "overview" {
  if (section === "admin") return "overview";
  if (section === "admin/clases") return "courses";
  if (section === "admin/calendario") return "schedule";
  return (
    staffModuleKeys.find((module) => staffModules[module].path === section) ??
    "staff.manage"
  );
}
