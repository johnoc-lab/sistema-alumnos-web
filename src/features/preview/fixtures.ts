import type { OrganizationSlug } from "./routes";
export interface PreviewOrganization {
  slug: OrganizationSlug;
  name: string;
  shortName: string;
  description: string;
  initials: string;
  tone: "cyan" | "purple";
}
export const previewOrganizations: readonly PreviewOrganization[] = [
  {
    slug: "impulso",
    name: "Impulso Cero",
    shortName: "Impulso",
    description: "Aprendizaje que se convierte en acción.",
    initials: "IC",
    tone: "cyan",
  },
  {
    slug: "incubadora",
    name: "Incubadora",
    shortName: "Incubadora",
    description: "Un espacio para construir nuevas ideas.",
    initials: "IN",
    tone: "purple",
  },
];
export interface PreviewCourse {
  id: string;
  organizationSlug: OrganizationSlug;
  title: string;
  description: string;
  category: string;
  lessons: number;
  hours: number;
  students: number;
  progress: number;
  status: "published" | "draft";
  tone: "cyan" | "purple" | "green";
  teacher: string;
}
export interface PreviewStudent {
  id: string;
  organizationSlug: OrganizationSlug;
  name: string;
  email: string;
  status: "active" | "suspended" | "invited";
  courses: number;
  joined: string;
  initials: string;
}
export const previewCourses: readonly PreviewCourse[] = [
  {
    id: "estrategia-emprendedora",
    organizationSlug: "impulso",
    title: "Estrategia para emprender",
    description:
      "Dale dirección a tu idea y construye un modelo de negocio con propósito.",
    category: "EMPRENDIMIENTO",
    lessons: 8,
    hours: 12,
    students: 24,
    progress: 38,
    status: "published",
    tone: "cyan",
    teacher: "Sofía Ríos",
  },
  {
    id: "finanzas-negocio",
    organizationSlug: "impulso",
    title: "Finanzas para tu negocio",
    description:
      "Entiende tus números y toma decisiones con más claridad y confianza.",
    category: "FINANZAS",
    lessons: 6,
    hours: 9,
    students: 18,
    progress: 16,
    status: "published",
    tone: "purple",
    teacher: "Mateo Vidal",
  },
  {
    id: "comunicacion",
    organizationSlug: "impulso",
    title: "Comunicación que conecta",
    description:
      "Aprende a contar tu propuesta y conectar con las personas correctas.",
    category: "HABILIDADES",
    lessons: 5,
    hours: 8,
    students: 12,
    progress: 0,
    status: "published",
    tone: "green",
    teacher: "Elena Luna",
  },
  {
    id: "marca-personal",
    organizationSlug: "impulso",
    title: "Construye tu marca personal",
    description: "Encuentra tu voz y diseña una identidad coherente.",
    category: "ESTRATEGIA",
    lessons: 4,
    hours: 6,
    students: 0,
    progress: 0,
    status: "draft",
    tone: "purple",
    teacher: "Sofía Ríos",
  },
  {
    id: "validacion-ideas",
    organizationSlug: "incubadora",
    title: "De la idea al primer prototipo",
    description:
      "Explora un problema real y convierte tu hipótesis en algo que puedas probar.",
    category: "INNOVACIÓN",
    lessons: 6,
    hours: 10,
    students: 16,
    progress: 25,
    status: "published",
    tone: "purple",
    teacher: "Diego Alba",
  },
  {
    id: "clientes",
    organizationSlug: "incubadora",
    title: "Conoce a tus primeros clientes",
    description: "Escucha, experimenta y descubre qué necesita tu mercado.",
    category: "VALIDACIÓN",
    lessons: 5,
    hours: 8,
    students: 10,
    progress: 0,
    status: "published",
    tone: "cyan",
    teacher: "Valeria Sol",
  },
  {
    id: "pitch",
    organizationSlug: "incubadora",
    title: "Tu primer pitch",
    description: "Presenta tu solución en una historia clara y concreta.",
    category: "COMUNICACIÓN",
    lessons: 4,
    hours: 6,
    students: 0,
    progress: 0,
    status: "draft",
    tone: "green",
    teacher: "Diego Alba",
  },
];
export const previewStudents: readonly PreviewStudent[] = [
  {
    id: "demo-i-1",
    organizationSlug: "impulso",
    name: "Lucía Torres",
    email: "lucia@example.test",
    status: "active",
    courses: 3,
    joined: "12 oct 2026",
    initials: "LT",
  },
  {
    id: "demo-i-2",
    organizationSlug: "impulso",
    name: "Andrés Medina",
    email: "andres@example.test",
    status: "active",
    courses: 2,
    joined: "14 oct 2026",
    initials: "AM",
  },
  {
    id: "demo-i-3",
    organizationSlug: "impulso",
    name: "Camila Vega",
    email: "camila@example.test",
    status: "invited",
    courses: 1,
    joined: "20 oct 2026",
    initials: "CV",
  },
  {
    id: "demo-i-4",
    organizationSlug: "impulso",
    name: "Diego Campos",
    email: "diego@example.test",
    status: "suspended",
    courses: 2,
    joined: "22 oct 2026",
    initials: "DC",
  },
  {
    id: "demo-n-1",
    organizationSlug: "incubadora",
    name: "Valentina Pérez",
    email: "valentina@example.test",
    status: "active",
    courses: 2,
    joined: "16 oct 2026",
    initials: "VP",
  },
  {
    id: "demo-n-2",
    organizationSlug: "incubadora",
    name: "Gabriel Soto",
    email: "gabriel@example.test",
    status: "invited",
    courses: 1,
    joined: "23 oct 2026",
    initials: "GS",
  },
];
/** Fixtures de presentación. No son usuarios Auth, membresías verificadas ni repositorios. */
export function getPreviewData(slug: OrganizationSlug) {
  const organization = previewOrganizations.find((org) => org.slug === slug);
  if (!organization) throw new Error("Organización de ejemplo desconocida.");
  return {
    organization,
    courses: previewCourses.filter(
      (course) => course.organizationSlug === slug,
    ),
    students: previewStudents.filter(
      (student) => student.organizationSlug === slug,
    ),
    studentName: slug === "impulso" ? "Lucía" : "Valentina",
  };
}
