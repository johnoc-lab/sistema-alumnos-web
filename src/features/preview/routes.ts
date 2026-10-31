export const organizationSlugs = ["impulso", "incubadora"] as const;
export type OrganizationSlug = (typeof organizationSlugs)[number];
export const sections = [
  "dashboard",
  "dashboard/cursos",
  "dashboard/calendario",
  "dashboard/perfil",
  "admin",
  "admin/alumnos",
  "admin/cursos",
  "admin/clases",
  "admin/avisos",
  "admin/materiales",
  "admin/calendario",
  "admin/certificados",
] as const;
export type Section = (typeof sections)[number];
export interface PreviewRoute {
  organizationSlug: OrganizationSlug;
  section: Section;
  courseId: string | null;
}
export function isOrganizationSlug(value: string): value is OrganizationSlug {
  return organizationSlugs.some((slug) => slug === value);
}
export function parsePreviewRoute(
  segments: readonly string[],
): PreviewRoute | null {
  const [prefix, slug, ...rest] = segments;
  if (prefix !== "o" || !slug || !isOrganizationSlug(slug)) return null;
  const path = rest.join("/");
  const section = sections.find((item) => item === path);
  if (section) return { organizationSlug: slug, section, courseId: null };
  const [area, courses, courseId, ...extra] = rest;
  if (
    area === "dashboard" &&
    courses === "cursos" &&
    courseId &&
    /^[a-z0-9-]+$/.test(courseId) &&
    !extra.length
  ) {
    return { organizationSlug: slug, section: "dashboard/cursos", courseId };
  }
  return null;
}
export function previewHref(slug: OrganizationSlug, section: Section): string {
  return "/demo/o/" + slug + "/" + section;
}
