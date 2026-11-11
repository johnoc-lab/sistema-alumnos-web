# Roles y permisos

La rama `feature/roles-permisos` reutiliza `organization_memberships`. El rol de base `admin` habilita el flujo MFA para el personal. `staff_rank` y `allowed_modules` determinan el acceso académico de cada membresía. El alumno conserva su espacio y la lectura de recursos autorizados por sus matrículas.

## Gestión del personal

- El administrador principal accede a todos los módulos y a **Administradores** después de verificar MFA. En esa sección puede incorporar asignaciones pendientes, editar permisos y suspender o reactivar membresías. La cuenta propia queda protegida en la aplicación y en PostgreSQL.
- El administrador limitado, el profesor y secretaría necesitan MFA y solo pueden usar los módulos seleccionados en la organización. Matrículas y Asistencia reciben únicamente los datos de los selectores que necesitan.
- Las asignaciones institucionales se preparan por UUID Auth en un canal administrativo separado. Se reutilizan el perfil global y la solicitud de activación de la organización. Cada perfil conserva una membresía por organización.
- Solo otro principal con MFA verificado puede asignar ese rango desde el panel. Una organización activa debe conservar al menos un principal con perfil activo y cuenta vinculada. PostgreSQL serializa cambios concurrentes sobre esa condición.
- Certificados permite asignar `certificates.recommend` a profesores y `certificates.approve` a administradores limitados como permisos separados. Son permisos reservados. Antes de abrir la recomendación se debe verificar una asignación explícita profesor–taller, la matrícula del alumno y que quien aprueba sea independiente de quien recomienda.

## Migración y compatibilidad

`20261111120000_staff_permissions.sql` añade las dos columnas, protege el último principal y aplica el permiso por módulo a las políticas y RPC existentes. Las políticas de Storage siguen usando sus guardas y consultan los nuevos permisos al decidir el acceso. La huella SHA-256 de la migración local es `f79d13dd4cfedf9112f781948ab9d61bfb8af3f484615fe388253423ed630c68`.

La consulta de solo lectura del 11 de noviembre de 2026 confirmó PostgreSQL 17.11, nueve migraciones aplicadas y una sola organización activa en `sistema-alumnos-dev` (`rnxgrunnrdlgjsbsrjev`). En `qa-sistema-alumnos-01` se comprobó la cuenta vigente `u-000002@cuentas.sistema-alumnos.invalid`, UUID Auth `6cabd8d2-55d0-401c-b4f6-a20040215134`, con membresía activa `6e4260d4-b596-4158-8663-91b73a382f7a`. El cambio inicial se limita a esa asignación verificada. Si aparece otra organización activa o el vínculo QA ya no coincide, la migración aborta y se debe revisar la designación inicial.

Con autorización posterior, comprobar el historial y el plan pendiente, aplicar la migración y verificar el rango QA antes de publicar la rama. El orden importa porque la aplicación consulta las nuevas columnas. La alteración de membresías toma un bloqueo de tabla durante la transacción. Revisar cualquier herramienta que todavía use `org_admin` con la semántica anterior o que cree un `admin` sin `staff_rank`. La migración deja las demás membresías administrativas existentes como limitadas y sin módulos.

## Prueba QA posterior

1. Después de aplicar la migración autorizada, iniciar la app con `npm run dev` y usar `http://127.0.0.1:3000`, con Auth habilitado para el ensayo y `APP_ORIGIN` igual a esa dirección. Con `u-000002`, comprobar que el panel exige TOTP. Tras verificarlo, abrir **Administradores** y confirmar que la cuenta figura como principal y carece de controles para editar su propia membresía.
2. Con `u-000001`, comprobar que el Dashboard, Horario y Asistencia conservan sus lecturas y que la ruta de Administradores deniega el acceso.
3. Para probar delegación, utilizar otra cuenta institucional QA existente, aprobada expresamente para ese ensayo. Un operador con acceso administrativo a PostgreSQL puede preparar la asignación con `private.prepare_staff_assignment`, pasando el UUID de la organización, el UUID Auth, nombre y apellido de prueba, referencias reales del verificador y la evidencia, y un UUID de idempotencia estable. La función exige una cuenta vigente y confirmada, crea o reutiliza el perfil y deja la membresía invitada sin permisos. Se necesita autorización para esta escritura.
4. Desde **Administradores**, incorporar esa cuenta como secretaría con solo Matrículas. Con su sesión `aal2`, comprobar el acceso al módulo y la denegación de Alumnos, Horario, descarga administrativa de materiales y gestión de personal. Suspender la membresía y comprobar que pierde acceso con la sesión existente. Reactivarla y comprobar que recupera solo Matrículas.

```sql
-- Ejemplo parametrizado para revisión. Ejecutar solo con aprobación del alta.
SELECT private.prepare_staff_assignment(
  $1::uuid, -- organización autorizada
  $2::uuid, -- cuenta Auth autorizada
  $3::text, -- nombre
  $4::text, -- apellido
  $5::text, -- referencia real del verificador
  $6::text, -- referencia de la evidencia
  $7::uuid  -- clave idempotente
);
```

## Archivos

**Nuevos**

- `supabase/migrations/20261111120000_staff_permissions.sql`.
- `src/lib/authorization/staff.ts`.
- `src/features/staff/` con `staff-page.tsx`, `permission-fields.tsx`, `handlers.server.ts` y `staff.module.css`.
- `src/app/(workspace)/o/[organizationSlug]/admin/administradores/` con `page.tsx` y `acciones/route.ts`.
- `tests/database/staff-suite.mjs` y `docs/ROLES_Y_PERMISOS.md`.

**Modificados**

- `src/features/academic/` con `academic-page.tsx`, `data.server.ts`, `handlers.server.ts` y `shell.tsx`.
- `src/features/auth/components/protected-module.tsx` y `src/features/organizations/components/organization-access.tsx`.
- `src/features/schedule/` con `schedule-page.tsx`, `schedule-board.tsx` y `schedule-editor.tsx`, junto con `src/app/(workspace)/o/[organizationSlug]/horario/datos/route.ts`.
- `src/lib/auth/` con `access.server.ts`, `resolve.ts` y `session.server.ts`, además de `src/lib/authorization/access.ts`.
- `src/types/database.generated.ts`, `supabase/seed.sql` para datos sintéticos locales, `package.json` y `scripts/check-routes.mjs`.
- `tests/` con `academic-data.test.ts`, `academic-handlers.test.ts`, `academic-ui.test.ts`, `authorization.test.ts`, `auth-mfa.test.ts`, `auth-mfa-integration.test.ts`, `auth-session.test.ts` y `organization-access.test.ts`.
- `tests/database/` con `concurrency-suite.mjs`, `engine.mjs`, `security-suite.mjs` y `support/embedded-bootstrap.sql`.

## Pruebas locales

- Typecheck, lint y build de producción con Webpack aprobados. Vitest aprobó 401 pruebas con Auth simulado, incluidas las comprobaciones de origen en Chromium.
- PostgreSQL embebido aprobó 83 pruebas de integridad y RLS, 17 de preflight, 10 recorridos académicos, 14 de roles y 12 de Horario. Se verificó que los tipos generados son reproducibles.
- PostgreSQL nativo 17.11 aprobó 88 pruebas en una copia aislada. Dos conexiones concurrentes confirmaron que se conserva el último principal y que una sesión pierde la capacidad de gestionar personal al revocarle el rango.
- El build local respondió a 57 comprobaciones generales, 23 de autenticación y 19 académicas con Auth deshabilitado. Se verificaron las nuevas rutas, sus respuestas privadas y el aislamiento de la demo.
- Quedan pendientes el login, MFA, delegación y descargas de esta versión con Supabase Auth y Storage de Cloud.
