# Fase 5A — Supabase Auth y Next.js

Fecha: 2 de noviembre de 2026. Rama: **feature/supabase-auth**.

La integración está implementada localmente y permanece **desactivada por defecto**. No se crearon usuarios, perfiles ni membresías, no se enviaron correos de recuperación y no se desplegó. Las cinco migraciones aplicadas se conservan intactas.

**Pendiente antes de activar:** la lectura real de configuración mostró auth.enable_signup=true y ninguna URL adicional de redirección. Se deben corregir manualmente esos ajustes de Cloud. No se modificó su configuración de forma automática.

## 1. Alcance y estado de Git

Se revisaron FASE_4C_MIGRACIONES_CLOUD.md y MODELO_BASE_DATOS.md. Se creó feature/supabase-auth desde main antes de editar código funcional.

El directorio ya contenía cambios sin commit y archivos no versionados de las fases anteriores. Se conservaron al cambiar de rama; no se hizo stash, reset, commit, push o despliegue. No atribuir todo el diff contra main exclusivamente a fase 5A.

No se añadieron dependencias: se usan @supabase/ssr 0.12.7 y @supabase/supabase-js 2.118.0 ya instaladas.

## 2. Archivos y responsabilidades

| Archivos                              | Cambio                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| src/lib/supabase/config.ts            | Validación de configuración, origen y proyecto permitido; activación privada explícita.                |
| src/lib/supabase/server.ts            | Cliente tipado por solicitud con cookies SSR y fetch sin caché.                                        |
| src/lib/supabase/browser.ts           | Cliente de navegador preparado; no lo usan los formularios actuales.                                   |
| src/lib/supabase/integration-state.ts | Estado cerrado de repositorios académicos; error de configuración.                                     |
| src/proxy.ts                          | Renovación/verificación con getClaims, propagación de cookies y headers, nonce CSP y no-store.         |
| src/lib/auth/resolve.ts               | Resolución comprobable de identidad/perfil/membresías/organizaciones.                                  |
| src/lib/auth/session.server.ts        | Adaptador real getUser/getClaims y consultas con RLS, cacheado solo durante el render de la solicitud. |
| src/lib/auth/access.server.ts         | Autorización del slug y rol requerido usando únicamente contexto verificado.                           |
| src/lib/auth/security.ts              | Origen de POST, lectura limitada del cuerpo y destinos permitidos.                                     |
| src/lib/auth/recovery.server.ts       | Prueba HMAC de 10 minutos ligada a usuario/sesión para cambio de contraseña.                           |
| src/lib/auth/handlers.server.ts       | Login, logout, recuperación, verificación de enlace, cambio de contraseña y callback PKCE.             |
| src/lib/auth/csp.ts                   | CSP de Auth con nonce por solicitud.                                                                   |
| src/features/auth/components/         | Formularios, mensajes genéricos y módulos reales protegidos sin fixtures.                              |
| src/app/auth/                         | Rutas nuevas de Auth; las operaciones son POST salvo el callback PKCE.                                 |
| src/app/(auth)/login                  | Login dinámico y destino interno controlado.                                                           |
| src/app/(workspace)/                  | Selector de organizaciones y guard en cada página real de alumno/Admin.                                |
| next.config.ts                        | Headers de caché y preparación del origen Supabase en CSP.                                             |
| .env.example                          | Nombres públicos/privados vacíos; flag desactivado.                                                    |
| tests/auth-\*.test.ts                 | Pruebas simuladas de resolución, políticas, handlers y proxy.                                          |
| tests/integration-disabled.test.ts    | Verificación actualizada de configuración ausente y repositorios académicos cerrados.                  |
| scripts/check-auth-routes.mjs         | HTTP local reproducible sin configuración ni credenciales.                                             |
| package.json                          | Comando check:auth-routes; sin cambios de versiones de dependencias.                                   |

Las páginas de demo, fixtures y su parser no se modificaron. Tampoco se modificaron migraciones, schemas, grants, políticas o datos remotos.

## 3. Configuración real revisada

Se utilizó config diff de la CLI en modo de lectura y solo se mostraron campos públicos seleccionados. No se imprimieron las partes enmascaradas ni claves.

| Ajuste Cloud                         | Valor observado                                           |
| ------------------------------------ | --------------------------------------------------------- |
| Proyecto                             | sistema-alumnos-dev / rnxgrunnrdlgjsbsrjev                |
| Data API schemas                     | public y graphql_public                                   |
| private expuesto                     | No                                                        |
| Registro público                     | **Habilitado: requiere desactivación manual**             |
| Confirmación de email                | Habilitada                                                |
| Site URL                             | http://localhost:3000                                     |
| Additional Redirect URLs             | Lista vacía                                               |
| TOTP enroll/verify                   | Habilitados                                               |
| Requisitos adicionales de contraseña | null; la aplicación exige 12–128 caracteres al actualizar |

En el entorno de trabajo no se encontraron las cinco variables de activación ni archivos .env.local/.env.development.local. Por eso las rutas reales permanecen cerradas y los POST Auth devuelven 503 sin inicializar el cliente.

Lecturas posteriores confirmaron cero usuarios Auth, cero perfiles y cero organizaciones. El historial conserva las cinco versiones de fase 4C. Estas lecturas no equivalen a probar un login.

## 4. Variables necesarias y activación manual

| Variable                             | Uso                                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| NEXT_PUBLIC_SUPABASE_URL             | URL pública exacta del proyecto de desarrollo autorizado.                                |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Clave publishable pública moderna; no acepta sb_secret ni claves JWT legacy.             |
| SUPABASE_AUTH_ENABLED                | Privada, debe ser exactamente true para activar Auth; por defecto false.                 |
| APP_ORIGIN                           | Origen completo y exacto, sin path/query/barra final. HTTPS salvo localhost/127.0.0.1.   |
| AUTH_FLOW_SECRET                     | Privada; valor aleatorio de al menos 43 caracteres, para firmar pruebas de recuperación. |

Usar .env.local ignorado por Git, sin copiar valores al chat ni a archivos versionados. Generar el secreto privado con un generador criptográfico o gestor de secretos. No usar ejemplos de tests como valores de despliegue.

El código fija el host de sistema-alumnos-dev para evitar conexión accidental a otro proyecto. No necesita service_role, secret key, contraseña PostgreSQL o PAT de CLI para atender a los usuarios.

Antes de poner SUPABASE_AUTH_ENABLED=true:

1. Deshabilitar Allow new users to sign up en Supabase Auth y verificar que continúe deshabilitado el acceso anónimo. No crear cuentas en esta fase.
2. Elegir un solo origen local; recomendado http://127.0.0.1:3000, que coincide con el servidor enlazado a loopback. Configurarlo también como Site URL. No alternar localhost/127.0.0.1 entre formularios y correos.
3. Añadir a Redirect URLs ese origen con /auth/callback y /auth/confirm, sin comodines amplios.
4. Mantener confirmación de email y TOTP habilitados. No reducir aal2 para abrir Admin.
5. Configurar las plantillas de recuperación e invitación descritas abajo y revisar SMTP/límites antes de enviar correos.
6. Completar las variables locales y reiniciar Next. No modificar Vercel ni habilitar el flag en producción durante esta fase.

La aplicación no ofrece registro ni usa signUp o Auth Admin. Si se activa antes de corregir Cloud, eso no deshabilita por sí mismo el endpoint público de registro de Supabase; el cambio manual es obligatorio.

## 5. Flujos implementados

### Inicio de sesión

GET /login muestra el formulario si hay configuración completa. POST /auth/login exige Origin exacto, formulario URL-encoded y cuerpo máximo de 8 KiB. signInWithPassword recibe email/contraseña solo en servidor; errores se convierten en mensajes genéricos sin reflejar respuesta interna ni contraseña.

El éxito redirige a un destino interno permitido o a /seleccionar-organizacion. El navegador nunca proporciona un rol o tenant autorizado. No se obtiene una membresía automáticamente al autenticar.

### Identidad y sesión

El proxy usa getClaims para renovar/verificar; readSession usa getUser y getClaims, comprueba que sub corresponda al usuario, rechaza Auth anónimo/email sin confirmar y resuelve perfil/membresía mediante PostgreSQL.

No se utiliza getSession como prueba de autorización. El SDK verifica la firma/expiración; no se decodifica un JWT del navegador para confiar en él sin verificación. [Clientes SSR oficiales](https://supabase.com/docs/guides/auth/server-side/creating-a-client).

Un error, sesión inválida o vencida no abre contenido. La ausencia de configuración retorna unconfigured; fallos de consultas de negocio retornan unavailable. Las rutas configuradas sin identidad redirigen al login. Las denegaciones de membresía/MFA muestran una página sin contenido académico.

### Cierre de sesión

POST /auth/logout usa signOut con scope local. Borra también los chunks de cookies propios y la prueba de recuperación, incluso si la llamada al proveedor falla. GET no cierra sesión y devuelve 405.

Cerrar cookies locales no debe confundirse con revocar instantáneamente todos los access tokens ya emitidos. Se verifica el usuario de nuevo en solicitudes protegidas y RLS consulta estados vigentes.

### Recuperación e invitación

POST /auth/recover usa resetPasswordForEmail y devuelve el mismo resultado visible para cuentas existentes/desconocidas. No se ejecutó contra cuentas reales.

Plantilla de recuperación que se debe configurar manualmente en Cloud:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery"
  >Recuperar acceso</a
>
```

Plantilla de invitación:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite"
  >Confirmar invitación</a
>
```

GET /auth/confirm muestra una confirmación explícita; no consume el enlace al abrirlo o previsualizarlo. POST /auth/verify acepta únicamente recovery o invite, valida el hash y llama verifyOtp. Una invitación no crea perfil, membresía ni rol.

Tras verificar la identidad, se emite una prueba HMAC ligada a sub y session_id, con duración de 10 minutos y cookie HttpOnly. POST /auth/password vuelve a comprobar usuario/claims, prueba, plazo y contraseña repetida antes de updateUser. Después elimina la prueba y cierra la sesión local.

La prueba es estateless y tiene plazo corto; borrarla en el navegador no constituye un registro de consumo global en servidor. El enlace OTP del proveedor sí tiene su control de uso. No se añadió una tabla para almacenar tokens.

El callback GET /auth/callback permite exchangeCodeForSession con el verificador PKCE de cookies y redirige solo al selector. No convierte un parámetro next/type en autorización para cambiar contraseña. La recuperación debe usar la plantilla token_hash preparada; el callback genérico no otorga la prueba de actualización.

## 6. Organizaciones, rutas y permisos

Se consulta profiles con SELECT id,status, sin leer auth_user_id, que está restringido por columna. RLS resuelve cuál es el perfil propio. Después se consulta organization_memberships por ese profile_id y organizaciones activas por sus IDs.

No hay una consulta con credencial administrativa para enumerar todas las personas. Se usan el cliente por solicitud y la sesión del usuario.

Para cada acceso se exige:

- Cuenta verificada, perfil active.
- Membresía active perteneciente a ese perfil.
- Organización active y coincidencia del slug con una membresía obtenida de PostgreSQL.
- Rol student/admin aprobado por el modelo.
- Para Admin: rol admin y claim verificado aal2.

Cada página real delega en ProtectedModule y vuelve a usar el guard. No se confía solo en el layout o proxy. La regla de dominio se complementa con RLS, no la sustituye.

El selector muestra únicamente las organizaciones autorizadas. Sin perfil/membresía activa presenta instrucciones de contacto y permite logout; no asigna organización por email.

La interfaz de challenge/enrollment MFA todavía está pendiente: un Admin con aal1 recibe denegación y no puede entrar al panel. Su implementación se prepara para fase 5B.

Las rutas reales muestran módulos pendientes después de autorizar, sin datos académicos ficticios. Los adaptadores de cursos/alumnos/calendario/archivos siguen devolviendo unavailable; no se habilitaron CRUD ni Server Actions académicas.

## 7. Cookies, CSRF, CSP, caché y redirecciones

- Clientes SSR nuevos por solicitud; ninguna sesión global compartida.
- Cookie de sesión según @supabase/ssr, Path=/, SameSite=Lax y Secure en HTTPS. La opción estándar permite acceso al cliente de navegador; no se afirma que esas cookies sean HttpOnly.
- Prueba de recuperación separada con HttpOnly, Path=/auth, SameSite=Lax, Secure en HTTPS y Max-Age=600.
- El proxy conserva todas las escrituras de cookies, actualiza la solicitud hacia SSR y aplica los headers de caché entregados por el SDK.
- Auth y rutas reales tienen no-store/private; no ISR ni caché compartida de respuestas con sesión.
- CSP por solicitud con nonce en rutas Auth/reales, propagado a scripts SSR. No permite unsafe-inline para scripts en esas rutas. unsafe-eval solo en desarrollo; estilos mantienen su política inline. La demo conserva su CSP estática.
- POST exige Origin igual a APP_ORIGIN y rechaza cross-site; ausencia/null también se rechazan. No hay logout por GET.
- Redirecciones permitidas solo al selector o paths internos de Dashboard/Admin; se rechazan URLs externas, barras dobles, escapes, queries y CRLF.
- Callback PKCE utiliza el origen fijo configurado, nunca forwarded-host o un origen enviado por formulario.
- Sin logs de passwords, tokens, hashes OTP o respuestas de Auth. Antes de alojar, revisar también que infraestructura/proxy no registren queries sensibles de callbacks.
- Solo se prepara el host Supabase autorizado en connect-src. No se incorporan scripts/CDN externos.

Las opciones de cookie y caché se contrastaron con la [guía avanzada SSR](https://supabase.com/docs/guides/auth/server-side/advanced-guide). No se ejecutaron pruebas contra un CDN real.

## 8. Independencia de la demo

El matcher del proxy excluye /demo y hay además una salida explícita para esa ruta. La demo no consulta ni renueva la sesión y no crea cookies Auth. Sigue usando exclusivamente sus fixtures separados.

No se importaron esos fixtures en el adaptador real, guard o handlers. Completar variables no convierte demo en una identidad ni la utiliza como respaldo ante errores.

La rama local no se desplegó; la demo publicada de Vercel conserva su código anterior.

## 9. Pruebas y resultados

| Comprobación          | Resultado                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------- |
| Vitest                | 75/75 casos aprobados, siete archivos.                                                    |
| TypeScript            | Aprobado.                                                                                 |
| ESLint                | Aprobado.                                                                                 |
| Next build            | Aprobado; incluye proxy y rutas Auth.                                                     |
| check:routes          | 55 rutas locales aprobadas.                                                               |
| check:auth-routes     | 14 solicitudes locales aprobadas sin configuración/credenciales.                          |
| Migraciones aplicadas | Cinco huellas aprobadas conservadas; no se ejecutaron migraciones.                        |
| Apps Script y demo    | Archivos originales/fixtures preservados por SHA-256.                                     |
| Lecturas Cloud        | Configuración revisada; cero cuentas/perfiles/organizaciones, cinco versiones existentes. |

Las pruebas Auth usan mocks del SDK/lectores: sesión válida/inválida/vencida, sub distinto, perfil ausente/bloqueado, ausencia de membresía, organización suspendida, alumno en Admin, Admin sin MFA, acceso cruzado, fallos de datos, logout, recuperación, prueba ligada a sesión, callbacks/redirecciones y configuración ausente. El proxy prueba preservación de cookies/headers, nonce y exclusión de demo.

Las comprobaciones HTTP prueban el servidor compilado **sin Auth activado**: formularios cerrados, POST 503, métodos, redirecciones sin reflejar next y nonce SSR real. No son una prueba de login Cloud.

No se generaron cuentas o tokens válidos para probar firmas, rotación real, envío de correos, MFA o navegación autenticada completa. Esas pruebas requieren autorización posterior.

Comandos que no usan seed:

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
npm run start
# En otra terminal, con Auth sin configurar:
npm run check:routes
npm run check:auth-routes
```

No se ejecutó npm run check, porque conserva la suite histórica de base que usa seed.

## 10. Pendientes y preparación de fase 5B

1. Corregir los ajustes manuales de Cloud y completar variables locales, manteniendo el registro público cerrado.
2. Autorizar por separado cuentas/datos sintéticos para pruebas positivas; no usar el seed local como importador Cloud.
3. Validar login, expiración, renovación, logout, recuperación/invitación de un solo uso y callbacks con navegador y proveedor reales.
4. Implementar enrollment/challenge MFA y probar aal2 sin rebajar el guard.
5. Definir provisionamiento auditado de perfiles/membresías; Auth por sí solo no concede pertenencia.
6. Integrar consultas académicas/RPC por módulo con la sesión del usuario, pruebas RLS y control de versiones; CRUD sigue cerrado hasta autorización.
7. Revisar límites del proveedor, SMTP, recuperación, CAPTCHA/rate limiting de entrada y monitorización antes de abrir tráfico público. No se atribuye rate limiting distribuido a un proceso Next local.
8. Revisar CDN/cookies/redirecciones y configuración de origen antes de modificar Vercel o desplegar, en otra fase autorizada.

No se implementó el login unificado externo de Impulso/Incubadora ni se modificó su relación de organizaciones.
