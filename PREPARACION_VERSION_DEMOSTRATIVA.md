# Preparación de la versión demostrativa

Fecha: **6 de noviembre de 2026**. Rama: **feature/supabase-auth**. Alcance: demo académica para 10–50 usuarios, sin cambios de arquitectura, dependencias nuevas ni servicios de pago.

## 1. Funciones integradas

Se revisó el recorrido existente **taller → matrícula → material por enlace → aviso → consulta del alumno**. Las páginas utilizan el cliente Supabase de la sesión, las tablas actuales y las RPC de actualización con control de versión. No utilizan fixtures como respaldo de operaciones reales.

Se corrigió una inconsistencia: al abrir **Ver matrículas** desde un taller, el formulario ahora preselecciona ese mismo taller, únicamente si está presente entre los datos autorizados. Se conservan la validación del servidor, RLS, la organización derivada de la sesión y las restricciones contra duplicados.

El Panel mantiene admin + **aal2** para lectura/operaciones administrativas; el alumno conserva acceso según matrícula. No se modificaron los handlers académicos, SQL, RLS, MFA ni las seis migraciones.

**Evidencia comunicada por el usuario:** login real del alumno, Dashboard, denegación del Panel al alumno, registro/verificación TOTP con Google Authenticator y acceso administrativo posterior. No se atribuye a Codex una comprobación independiente de esos ensayos. Las nuevas escrituras académicas siguen pendientes de prueba Cloud.

## 2. Acabado visual y archivos

- **academic-page.tsx / academic.module.css / shell.tsx:** tablas de alumnos y matrículas, edición desplegable conservando formularios POST/versiones, navegación con iconos y aria-current, formularios móviles en una columna, tablas con desplazamiento interno, estados vacíos, indicadores del Dashboard y cuatro pasos de inicio para administración.
- **organization-access.tsx** y página **seleccionar-organizacion:** tarjetas reales por membresía, rol visible, estado sin asignación y acceso a MFA. Se reutilizan estilos de selección existentes; la demo conserva su componente.
- **login-screen.tsx / auth-form.tsx / login.module.css:** identidad visual Sistema Alumnos, etiqueta Identificador institucional, login como acción principal, enlace secundario a /demo, avisos y cierre de sesión con estilo uniforme.
- **app/layout.tsx:** título/descripción actualizados; continúa sin indexación.
- **.env.example:** comentarios de preparación Preview; sin credenciales ni activación.
- Pruebas: **academic-integration.test.ts**, **organization-access.test.ts**, ampliaciones de **academic-ui.test.ts / auth-security.test.ts**, y **scripts/check-academic-routes.mjs**.

Se revisaron visualmente login, selección de organización, matrícula móvil y Dashboard de escritorio. Los componentes académicos se mostraron con datos sintéticos en una ruta creada **solo en una copia temporal**, nunca en src del proyecto. No se enviaron formularios ni se abrió una sesión Cloud. La tabla móvil mantiene su desplazamiento dentro del contenedor, sin ensanchar la página.

Los cambios previos del diagnóstico MFA permanecen en el árbol de trabajo; no forman parte de una nueva reimplementación MFA.

## 3. Verificaciones

| Comprobación | Resultado / alcance |
|---|---|
| Aplicación: npm test -- --maxWorkers=2 | **371/371**, 18 archivos |
| Integración nueva incluida arriba | Formulario → parseo → mutateAcademic/loadAcademic → PostgreSQL real desechable → render de contenido del alumno |
| npm run db:test:academic | **10/10** recorridos SQL |
| npm run db:test | **83/83** comprobaciones SQL de seguridad/integridad |
| npm run db:test:preflight | **13/13**, reconstrucción y permisos sin seed |
| npm run db:types:check | Tipos reproducibles de 14 tablas / 13 RPC |
| HTTP de producción local | **93** solicitudes: 23 Auth, 55 rutas/demo, 15 académicas |
| Lint / typecheck | Aprobados |
| Build de producción | Next.js 16.4.3 **--webpack**, aprobado en copia temporal limpia, sin .env.local |
| Seguridad HTTPS | Origen Preview exacto; otros Preview/Origin null y encabezados Host falsificados no sustituyen Origin |

Las pruebas comprobaron denegación a student y admin aal1, acceso de admin aal2, aislamiento entre organizaciones, matrícula única, rechazo de versiones obsoletas, publicación de material/aviso y pérdida de acceso tras pausar la matrícula.

La primera suite completa con concurrencia predeterminada tuvo **un timeout de Chromium** al ejecutarse junto con builds y pruebas SQL. La suite completa se repitió con dos workers y terminó satisfactoriamente; no se aumentaron timeouts ni se relajaron controles para hacerla pasar.

**Límites:** la integración nueva usa un transporte de pruebas hacia PostgreSQL embebido, no el servidor PostgREST. Auth/claims de las pruebas son sintéticos; las suites SQL reconstruyen las seis migraciones y fixtures únicamente en memoria (PostgreSQL embebido 18.6, distinto de Cloud 17.11). HTTP y build se ejecutaron con Auth apagado **solo en esos procesos**, sin copiar ni modificar .env.local. No acreditan login, cookies HTTPS, escrituras o TOTP reales en Vercel/Cloud.

## 4. Pendientes reales

1. Autorizar y realizar el primer recorrido mutante QA en Cloud. Todavía no se ha probado contra su PostgREST, permisos efectivos y configuración de servicio.
2. Elegir la URL Preview real y autorizar por separado configuración/publicación. No se consultó ni modificó la configuración Vercel de la cuenta.
3. Comprobar login, cookies Secure, redirecciones, renovación de sesión y MFA en ese dominio HTTPS.
4. Carga de PDF, recuperación administrativa, cuentas nuevas, clases y certificados quedan fuera de esta demo mínima. Los materiales por enlace no dependen de esas mejoras.

## 5. Preparación Vercel Preview

Propuesta para revisión posterior, **no ejecutada**:

- Framework **Next.js**, raíz **SistemaAlumnos-Web**, instalación **npm ci**, salida automática .next.
- Runtime **Node.js 26.x**, alineado con .nvmrc y la validación local. Está admitido actualmente por Vercel; verificar la versión efectiva en el build remoto. [Versiones Node.js](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).
- Para reproducir el build verificado, Build Command: **node node_modules/next/dist/bin/next build --webpack**. No se afirma validación del build predeterminado Turbopack ni del runtime remoto.
- Variables acotadas a **Preview y esta rama QA**, sin habilitar Production. Los valores se introducen en Vercel, nunca en Git. [Alcance de variables Preview](https://vercel.com/docs/environment-variables).

| Variable | Configuración futura |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | URL del proyecto de desarrollo rnxgrunnrdlgjsbsrjev, ya fijada por el código |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Clave publicable de ese proyecto; nunca service_role ni secret key |
| SUPABASE_AUTH_ENABLED | false inicialmente; true solo al autorizar el ensayo Preview |
| APP_ORIGIN | Origen HTTPS **exacto** del alias Preview elegido, sin barra final |
| AUTH_FLOW_SECRET | Valor privado aleatorio de al menos 43 caracteres, generado y custodiado fuera del repositorio |
| AUTH_EMAIL_RECOVERY_ENABLED | false |
| AUTH_TOKEN_HASH_RECOVERY_ENABLED | false |
| AUTH_INVITATION_ACCEPT_ENABLED | false |
| MFA_ENROLL_DIAGNOSTICS | Omitir; las trazas temporales tampoco se activan en NODE_ENV=production |

Usar un **único alias Preview estable** y navegar siempre por él. El código no convierte VERCEL_URL/Host en una lista automática de orígenes permitidos. Otro dominio de deployment puede abrir el login, pero su POST se rechazará si no coincide con APP_ORIGIN; esto conserva CSRF. No añadir comodines.

SSR ya crea el cliente por solicitud, renueva cookies mediante el proxy y conserva no-store. Con APP_ORIGIN HTTPS las cookies se marcan Secure y mantienen SameSite=Lax/path=/. No configurar caché compartida para /auth, /o o selección de organización. [Guía SSR y caché de Supabase](https://supabase.com/docs/guides/auth/server-side/advanced-guide).

Login con contraseña y TOTP no realizan un retorno OAuth/email: no requieren activar esos flujos ni cambiar Site URL para este recorrido. Si se habilita un callback en otra revisión, registrar su URL exacta en Supabase y conservar las URLs locales necesarias, sin comodines generales. [URLs de redirección](https://supabase.com/docs/guides/auth/redirect-urls).

Mantener S/ 0 exige no activar add-ons ni pruebas de pago y respetar los límites/elegibilidad de Hobby: uso personal no comercial, cuya adecuación debe confirmar el responsable antes de alojar un servicio institucional. No se garantiza coste ni elegibilidad de una cuenta no inspeccionada. [Plan Hobby](https://vercel.com/docs/plans/hobby). Evaluar la protección gratuita **Vercel Authentication** disponible en la cuenta para Preview; no sustituye Supabase Auth/RLS/MFA. No contratar Password Protection. [Protección de deployments](https://vercel.com/docs/deployment-protection).

## 6. Primer ensayo QA posterior a autorización

Estas instrucciones implican escrituras Cloud realizadas por el operador y **todavía no se ejecutaron**. Definir antes si se prueba localmente contra Cloud o en Preview, el nombre/slug del taller y los contenidos sintéticos autorizados.

1. Administrador **u-000002@cuentas.sistema-alumnos.invalid**: entrar por /login, seleccionar **QA Sistema Alumnos** y verificar el factor TOTP ya registrado si la sesión está en aal1. **No volver a registrar ni cancelar su factor.**
2. En **Talleres**, crear **Taller demo QA**, slug único como **qa-demo-20261106**, estado **Publicado**, categoría QA y descripción sintética. Confirmar “Cambios guardados”.
3. Abrir **Ver matrículas** del taller. Debe quedar preseleccionado. Seleccionar el alumno QA existente y guardar una sola vez; confirmar fila activa. Una repetición debe informar duplicado y conservar la matrícula.
4. En **Materiales**, elegir ese taller, título **Guía demo QA**, tipo **Enlace externo** y estado **Publicado**. Usar un enlace HTTPS autorizado de Docs/Drive/YouTube/Vimeo/Meet/Zoom, sin permisos abiertos automáticamente ni información real.
5. En **Avisos**, elegir el mismo taller y publicar un mensaje sintético. Confirmar el guardado y la fecha.
6. Cerrar sesión o usar otro perfil de navegador. Entrar como **u-000001@cuentas.sistema-alumnos.invalid**, abrir Dashboard → Mis talleres → taller. Comprobar descripción, avance, material y aviso. La entrada directa a /o/qa-sistema-alumnos-01/admin debe seguir denegada.
7. Registrar qué operaciones llegaron a Cloud y su resultado, sin QR, códigos, tokens, cookies ni contraseñas. Ante un error, detenerse; no ejecutar SQL correctivo ni desactivar RLS/MFA.

No probar aislamiento con cuentas ajenas ni crear otra organización sin autorización: ese caso está cubierto localmente, no acreditado manualmente en Cloud.

## 7. Sustitución gradual de la demo pública

La raíz **/** ya redirige a **/login**. Se destacó el login real y se mantiene **/demo** como demostración pública independiente, con datos ficticios y sin sesión. No se eliminó ni se utilizó como respaldo ante errores de acceso real.

Después de aprobar las escrituras QA y confirmar el recorrido en Preview, presentar el enlace autenticado como entrada principal. Mantener /demo como referencia opcional hasta otra decisión expresa. No promover a producción ni eliminar la demo en esta fase.

**Cierre:** sin consultas/escrituras Cloud desde estas herramientas, modificaciones Auth/MFA, cambios de .env.local o de las seis migraciones, ajustes Vercel/GitHub/Apps Script, commit, push, merge ni deploy. Los servidores auxiliares se utilizan solo en loopback y se cierran al finalizar. No se detuvo el servidor habitual del usuario.
