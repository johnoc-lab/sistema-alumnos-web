# Rediseño institucional del Dashboard

Fecha: **6 de noviembre de 2026**. Rama: **feature/supabase-auth**. Alcance: presentación y experiencia de usuario, conservando la arquitectura, rutas y operaciones existentes.

## Resumen

Se implementó un campus de identidad propia: fondo claro, encabezado azul profundo, acentos verde petróleo y tarjetas blancas. La navegación superior sustituye a la lateral en los espacios académicos reales. En móvil permite desplazamiento horizontal dentro de la navegación, sin ensanchar la página.

Las referencias universitarias se utilizaron para jerarquía, espaciado, tarjetas de cursos y agrupación de recursos. No se copiaron logotipos, fotografías, textos ni recursos exclusivos de Universidad Continental. Los patrones de los talleres están hechos con CSS del proyecto.

## Pantallas modificadas

| Pantalla | Resultado |
|---|---|
| /login | Distribución compacta, formulario como acción principal, mensajes conservados y demo secundaria. A **1366 × 768**, incluso con mensaje de credenciales inválidas y aviso de Auth deshabilitado, la página completa cabe sin scroll vertical. |
| /seleccionar-organizacion | Tarjetas con identidad de la organización, rol, accesos disponibles, estado sin asignación y enlace MFA administrativo. |
| /auth/mfa | Tarjeta de seguridad, estados pendiente/confirmado, botones y navegación coherentes con el campus. |
| Enrollment y challenge MFA | HTML privado con el mismo lenguaje visual, QR adaptable, campo de seis dígitos legible y regreso a seguridad/organizaciones. |
| Mi espacio | Bienvenida, cantidades provenientes de los datos consultados, recursos académicos, talleres y secciones de avisos/agenda. |
| Mis talleres | Cuadrícula de tarjetas con patrones propios, título, descripción, categoría, avance y enlace al detalle/materiales. Si falta el avance se muestra “Avance por registrar”; un cero real sigue mostrando 0%. |
| Administración | Navegación uniforme, formularios compactos, tablas de alumnos/matrículas, estados, confirmaciones, errores y edición desplegable conservados. |
| Materiales, avisos, calendario y perfil | Superficies claras, tarjetas, tipografía, espaciado y enlaces consistentes. |
| Acceso denegado y módulos pendientes | Adaptados al tema institucional, manteniendo sus estados y guardas. |

Las búsquedas y filtros administrativos existentes siguen disponibles. No se añadieron filtros, contenidos o acciones que el backend no soporte.

## Componentes reutilizables

- **src/components/institutional/identity.tsx**: CampusBrand, CampusHeader y OrganizationIdentity. Este último selecciona únicamente presentación; no decide permisos ni utiliza el dominio del correo.
- **src/components/institutional/campus.module.css**: variables y estilos compartidos del tema claro, acotados a las páginas reales.
- **src/features/academic/course-tile.tsx**: tarjeta de taller con progreso y navegación.
- **src/features/organizations/components/organization-access.module.css**: estilos del selector real separados del selector de la demo.

Se actualizaron los componentes y CSS de login, MFA, shell y vistas académicas; **src/lib/auth/mfa-html.ts** cambió exclusivamente su envoltura visual y estilos. **tests/institutional-ui.test.ts** añade nueve pruebas de presentación, identidad, progreso y conservación del contrato HTML de MFA.

El tema oscuro original permanece disponible en /demo; no se convirtió la demo en respaldo de datos reales ni se eliminó.

## Identidad y logotipos

Se encontró en **IndexInfo.html** del Apps Script una referencia pública cuyo contenido se inspeccionó visualmente y corresponde a **Impulso Cero Academy**. Se reutilizó como **public/brands/impulso-cero.png**, PNG de **785 × 318**, servido localmente. El navegador no necesita descargarlo de Google. [Recurso de origen](https://lh3.googleusercontent.com/d/1roMYMBhhVSQ8GRKFoJEbx5VjpqJH57R5).

El catálogo visual reconoce los slugs impulso e impulso-cero. Cualquier otra organización conserva su nombre y una representación neutra. **Incubadora no recibió un logotipo inventado**. Para incorporar su logo futuro bastará con añadir un archivo real y su entrada explícita al catálogo; no requiere modificar Auth, membresías o PostgreSQL.

El recurso también tenía etiquetas de Incubadora en otro HTML antiguo. Se evitó trasladar esa atribución: la imagen visible identifica a Impulso Cero. No se modificó el Apps Script.

## Pruebas y resultados

| Verificación | Resultado |
|---|---|
| npm test -- --maxWorkers=2 | **380/380**, 19 archivos; incluye las nueve pruebas nuevas y la integración académica contra PostgreSQL embebido |
| npm run lint | Aprobado |
| npm run typecheck | Aprobado |
| Build de producción | Next.js 16.4.3 **--webpack**, aprobado en copia temporal limpia |
| HTTP local sobre build | **93** comprobaciones: Auth, rutas/demo y acceso académico cerrado |
| Logo | HTTP 200, tipo PNG y dimensiones comprobadas |
| Revisión de presentación | **22 vistas × 4 resoluciones = 88 combinaciones** |
| Resoluciones | **1440 × 900**, **1366 × 768**, **768 × 1024**, **390 × 844** |
| Renderizado | Sin desbordamientos de página, imágenes rotas ni errores de render detectados |
| Teclado | Región de tabla enfocable; ArrowRight desplazó su contenido, y la edición desplegable se abrió sin enviar el formulario |
| Contraste | Ocho pares principales aprobados: texto, secundario, botón, encabezado, borde de campo, foco y estados pendiente/confirmado |

Las relaciones de contraste comprobadas van de **3.34:1** para bordes a **14.02:1** para texto; textos principales/estados superan 4.5:1. Esto es una comprobación acotada, no una certificación integral de accesibilidad.

Se mantuvieron las pruebas de denegación al alumno, admin aal1, aislamiento organizacional, autorización admin aal2, privacidad del QR y protección contra HTML activo. Las huellas de datos/handlers académicos, validaciones, handlers MFA, validador QR y autorización son idénticas a las del inicio de este trabajo. No hay diferencias en las seis migraciones.

### Alcance real de las pruebas

Las vistas académicas/MFA para inspección visual usaron **datos sintéticos en una copia temporal**. Las rutas auxiliares qa-visual y qa-mfa-html no están en el proyecto ni en el build final. La imagen de enrollment utilizada para revisión no codifica ninguna semilla TOTP real.

Build y HTTP se ejecutaron con Auth deshabilitado solo en sus procesos, sin copiar .env.local. No se enviaron formularios académicos ni se hizo enrollment, challenge, verify o cancelación contra Supabase real.

El usuario comunicó previamente login/MFA satisfactorios en Vercel Preview. Es evidencia aportada por el usuario; **este trabajo no realizó pruebas independientes contra Cloud o Vercel**.

## Problemas encontrados y solución

1. **Espacio vertical excesivo en login:** se redujeron márgenes y rellenos. No se ocultaron campos, botones ni errores; móvil conserva scroll cuando hace falta.
2. **MFA con estilos aislados del resto:** se armonizaron las páginas React y el HTML privado, conservando métodos POST, nombres de campos, escaping y lógica.
3. **Edición de tablas en móvil:** se mantuvo el desplazamiento interno y se añadieron regiones con etiqueta y foco por teclado. Los campos dentro de details cerrados se contrastaron con el árbol accesible; no eran campos visibles recortados.
4. **Identidad gráfica antigua ambigua:** se confirmó visualmente el logo de Impulso y se mantuvo Incubadora neutra.

## Pendientes y revisión local

- Incorporar el logo oficial de Incubadora cuando exista y confirmar el slug visual correspondiente a cada organización.
- Revisar el acabado con las sesiones QA habituales y, cuando se autorice, en un nuevo Preview. Las escrituras académicas Cloud no se revalidaron aquí.
- Carga de PDF, recuperación administrativa, nuevas cuentas, clases y certificados conservan su alcance previo; no se desarrollaron durante el rediseño.
- Para ver los cambios, iniciar o reiniciar **npm run dev** con la configuración local existente. No es necesario cambiar variables para revisar la demo; el acceso real seguirá sujeto a su configuración y guardas actuales.

**Sin cambios remotos, Auth, factores MFA, RLS, CSRF, esquema, datos, .env.local, variables Vercel o GitHub. Sin dependencias nuevas ni servicios de pago. Sin stage, commit, push, merge o deploy.** Se cierran los servidores auxiliares de esta revisión; el servidor habitual del usuario no se detiene.
