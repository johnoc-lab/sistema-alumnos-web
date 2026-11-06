import type { Metadata } from "next";
import "@/styles/globals.css";
export const metadata: Metadata = {
  title: {
    default: "Sistema Alumnos · Espacio de aprendizaje",
    template: "%s · Sistema Alumnos",
  },
  description:
    "Espacio académico de talleres, materiales y actividades para alumnos y administradores.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <a className="skip-link" href="#main-content">
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
