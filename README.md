# SistemaAlumnos-Web

Aplicación Next.js + TypeScript. La fase 5A prepara Supabase Auth SSR bajo activación explícita; por defecto permanece cerrado. La demo pública es independiente y CRUD académico sigue deshabilitado. Consulte [FASE_5A_AUTENTICACION.md](FASE_5A_AUTENTICACION.md) antes de configurar variables: Cloud todavía tiene signup habilitado y requiere ajustes manuales.

## Requisitos

- Node.js 26.10.0, versión usada en la verificación y fijada en .nvmrc. El manifiesto también admite Node 24.x; esa rama no se probó en este equipo.
- npm 11 o superior; verificado con npm 11.19.1.
- Windows, macOS o Linux. No se necesita cuenta ni credencial de Supabase para ejecutar esta fase.

## Ejecutar en Windows PowerShell

```powershell
Set-Location -LiteralPath 'C:\Users\Delfi\Desktop\SistemaAlumnos-Web'
npm ci --ignore-scripts
npm run dev
```

Abrir [login local](http://127.0.0.1:3000/login). Los scripts se enlazan a loopback y desactivan la telemetría de Next.js. No uses una IP de red pública para esta demostración.

La instalación descarga dependencias del registro npm. No conecta servicios de Supabase, Vercel o GitHub. .env.example contiene únicamente nombres vacíos; no es necesario crear .env.local. Para activar Auth se requieren todas las variables y SUPABASE_AUTH_ENABLED=true, después de corregir la configuración manual de Cloud. Los repositorios académicos permanecen deshabilitados.

## Pantallas para revisar

| Dirección local                      | Qué muestra                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| /login                               | Login SSR; cerrado sin configuración. Requiere activación explícita de Auth. |
| /demo                                | Selector público de dos organizaciones ficticias.                            |
| /demo/o/impulso/dashboard            | Dashboard de alumno de ejemplo.                                              |
| /demo/o/impulso/dashboard/cursos     | Catálogo con búsqueda, tarjetas y detalles navegables ficticios.             |
| /demo/o/impulso/dashboard/calendario | Estructura de agenda, sin eventos conectados.                                |
| /demo/o/impulso/dashboard/perfil     | Perfil ficticio, sin sesión.                                                 |
| /demo/o/impulso/admin                | Resumen administrativo de ejemplo.                                           |
| /demo/o/impulso/admin/alumnos        | Tabla, búsqueda, filtros y fichas/formulario de solo lectura.                |
| /demo/o/impulso/admin/cursos         | Tabla, filtros de publicados/borradores y ficha/formulario de solo lectura.  |
| /demo/o/impulso/admin/clases         | Estructura con estado vacío.                                                 |
| /demo/o/impulso/admin/avisos         | Estructura con estado vacío.                                                 |
| /demo/o/impulso/admin/materiales     | Estructura con estado vacío.                                                 |
| /demo/o/impulso/admin/calendario     | Agenda inicial sin edición.                                                  |
| /demo/o/impulso/admin/certificados   | Estado vacío; no genera ni emite certificados.                               |

Se puede sustituir impulso por incubadora para explorar el segundo conjunto de datos. Los dominios de contacto de fixtures terminan en example.test.

Las rutas reales /seleccionar-organizacion y /o/[organizationSlug]/... aplican verificaciones SSR y RLS; sin configuración muestran acceso cerrado. No renderizan fixtures ni conceden permisos, incluso con parámetros como ?demo=true&role=admin. Los datos de /demo no son una fuente de respaldo de los repositorios reales. Las etiquetas Admin/Alumno en demo describen diseños, no roles autenticados.

## Comandos de calidad

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
npm run format:check
```

npm run check ejecuta lint, TypeScript, tests, pruebas SQL embebidas, verificación de tipos de base y build en orden. Next build no ejecuta ESLint automáticamente; por eso se verifica de forma separada.

Para servir la compilación local:

```powershell
npm run build
npm run start
```

En otra terminal, con el servidor local activo:

```powershell
npm run check:routes
```

La prueba HTTP admite únicamente localhost/127.0.0.1 y comprueba rutas de demo, guardias cerradas, cabeceras y páginas desconocidas. CHECK_BASE_URL permite elegir otro puerto de loopback si se necesita.

## Organización del código

- src/app: rutas App Router, login, rutas reales cerradas y sección demo independiente.
- src/components: layout responsive, navegación, estados, badges y diálogo accesible nativo.
- src/features: dominios dashboard, admin, students, courses, calendar, organizations, materials, auth y preview.
- src/features/preview: fixtures y parser de rutas; nunca crea una identidad ni un contexto autorizado.
- src/lib/auth y authorization: lector SSR getUser/getClaims y autorización por perfil, tenant, membresía, rol y MFA.
- src/lib/supabase: clientes SSR/navegador tipados; inicialización solo con configuración válida.
- src/lib/data: contratos y adaptadores que retornan unavailable; sin mutaciones.
- src/styles: globales mínimos. Los estilos de pantallas/componentes usan CSS Modules.
- tests: autorización, aislamiento de fixtures, renderizado seguro de texto y adaptadores sin conexión.
- docs/SEGURIDAD_Y_RLS.md: fronteras actuales y condiciones antes de integrar datos reales.

No se han generado tipos de una base inexistente, migraciones SQL, seeds con PII, cuentas o claves. No hay backend adicional. Los paquetes Supabase se incluyen fijados para la integración posterior, pero sus factories lanzan un error explícito.

## Próxima fase

Implementar y probar Auth SSR real, membresías y RLS en entorno local/de prueba según PLAN_MIGRACION.md y MODELO_BASE_DATOS.md del proyecto de planificación. Cambiar adaptadores solo tras contar con permisos, esquema y tests positivos/negativos. No convertir el demo en una autenticación simulada ni confiar en dominios de correo. Revisar CSP/caché, activación de usuarios, callbacks, MFA y Storage antes de cualquier dato real o despliegue.

Las referencias visuales se reinterpretaron en React; no se copiaron controladores, credenciales ni configuraciones de Apps Script. El proyecto antiguo y los documentos de fases anteriores permanecen intactos.

## Informe de esta entrega

Ver [FASE_3_IMPLEMENTACION.md](FASE_3_IMPLEMENTACION.md) para versiones, evidencia, pruebas y próximos pasos.

Si ya está activo el servidor de revisión en 3000, Next puede elegir 3001 al iniciar otro servidor; revisa la dirección de la terminal.

## Base de datos local — Fase 4

Se implementaron migraciones PostgreSQL, RLS, seed sintético y pruebas sin conectar la demo a datos reales. Consulte [FASE_4_BASE_DATOS.md](FASE_4_BASE_DATOS.md) para tablas, comandos, evidencia y pendientes. Docker no está disponible en el equipo de verificación: 83 pruebas embebidas aprobadas; Supabase nativo y concurrencia simultánea pendientes.

Comandos sin servicios externos: npm run db:test y npm run db:types:check. npm run db:doctor comprueba CLI/Docker. No ejecutar seeds ni resets sobre datos reales.

## Preparación de Supabase Cloud — fase 4B

Consultar [FASE_4B_SUPABASE_CLOUD.md](FASE_4B_SUPABASE_CLOUD.md) para login, link, preflight de solo lectura y dry-run preparado. Ningún servicio remoto se conecta automáticamente. npm run db:test:preflight reconstruye y revisa cada migración sin usar seed. Las pruebas históricas de fixtures requieren autorización aparte antes de ejecutarlas en Cloud.

## Auth — Fase 5A

Implementado en feature/supabase-auth. [Informe y configuración manual](FASE_5A_AUTENTICACION.md). Pruebas adicionales: npm run check:auth-routes, con servidor local y Auth sin configurar. No se crearon cuentas ni se desplegó esta rama.
