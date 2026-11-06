# Fase 5B — Paso 4: MFA TOTP local

Fecha de cierre: **4 de noviembre de 2026**, America/Lima.
Proyecto: SistemaAlumnos-Web. Rama: feature/supabase-auth.

**Resultado:** interfaz y handlers MFA implementados localmente. La suite completa aprobó **210/210 pruebas**, en 11 archivos; lint, typecheck y build finalizaron correctamente. Se añadieron 76 comprobaciones: 69 de MFA/UI/proof, tres de integración con resolución de identidad y cookies SSR y cuatro del proxy.

No se ejecutó enrollment, challenge o verify contra Supabase Cloud. No se crearon/modificaron usuarios o factores reales ni se adjudicaron roles a la cuenta existente. No hubo SQL remoto, seed, migraciones nuevas, cambios en .env.local, Vercel, GitHub o Apps Script, commit, push o deploy.

## 1. Referencias y alcance

Se revisaron:

- [FASE_5A_AUTENTICACION.md](FASE_5A_AUTENTICACION.md).
- [FASE_5B_PLAN_GRATUITO.md](FASE_5B_PLAN_GRATUITO.md).
- [FASE_5B_PASO2_APROVISIONAMIENTO.md](FASE_5B_PASO2_APROVISIONAMIENTO.md).
- [FASE_5B_PASO3_GUION_QA.md](FASE_5B_PASO3_GUION_QA.md).

Las restricciones SQL de Admin y el guard de autorización se conservaron. MFA eleva la garantía de la identidad; no crea un perfil, membresía o rol. Un Admin de una organización no recibe permisos en otra por completar TOTP.

La cuenta que anteriormente inició sesión sin organizaciones seguirá sin acceso a esta configuración mientras no exista un perfil activo y una membresía administrativa válida. Este paso no ejecuta el aprovisionamiento QA.

## 2. Archivos y rutas implementadas

| Archivo                                                                                                                                    | Responsabilidad                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| [mfa/page.tsx](src/app/auth/mfa/page.tsx)                                                                                                  | Página dinámica GET /auth/mfa, sin mutaciones de factores al abrirla.                                                               |
| [mfa-overview.tsx](src/features/auth/components/mfa-overview.tsx) y [CSS](src/features/auth/components/mfa.module.css)                     | Estado de la sesión y factores propios; formularios nativos POST; avisos limitados a una lista permitida.                           |
| [enroll/route.ts](src/app/auth/mfa/enroll/route.ts)                                                                                        | POST /auth/mfa/enroll: alta explícita del TOTP propio. GET devuelve 405.                                                            |
| [challenge/route.ts](src/app/auth/mfa/challenge/route.ts)                                                                                  | POST /auth/mfa/challenge: solicitud para un factor propio. GET devuelve 405.                                                        |
| [verify/route.ts](src/app/auth/mfa/verify/route.ts)                                                                                        | POST /auth/mfa/verify: verifica el código y exige claims frescos aal2. GET devuelve 405.                                            |
| [mfa.server.ts](src/lib/auth/mfa.server.ts)                                                                                                | Candidatura administrativa sin exigir previamente aal2, listado de factores y tratamiento seguro del QR.                            |
| [mfa-handlers.server.ts](src/lib/auth/mfa-handlers.server.ts)                                                                              | Validación de POST, flujo SDK, proof, respuestas y comprobaciones posteriores.                                                      |
| [mfa-proof.server.ts](src/lib/auth/mfa-proof.server.ts)                                                                                    | Prueba firmada independiente, con propósito mfa-totp y plazo limitado.                                                              |
| [mfa-html.ts](src/lib/auth/mfa-html.ts)                                                                                                    | HTML privado de configuración y código, sin scripts ni recursos externos.                                                           |
| [session.server.ts](src/lib/auth/session.server.ts)                                                                                        | Nuevo readSessionForClient para resolver identidad con un cliente concreto, sin reutilizar un resultado cacheado anterior a verify. |
| [proxy.ts](src/proxy.ts)                                                                                                                   | Mantiene renovación de GET /auth/mfa; los POST MFA esperan el control Origin del handler.                                           |
| [handlers.server.ts](src/lib/auth/handlers.server.ts)                                                                                      | Login/logout limpian el proof MFA transitorio al cambiar/cerrar sesión.                                                             |
| [Selector](<src/app/(workspace)/seleccionar-organizacion/page.tsx>) y [ProtectedModule](src/features/auth/components/protected-module.tsx) | Enlaces a seguridad para Admin y ante denegación por MFA. La denegación administrativa se conserva.                                 |
| [auth-mfa.test.ts](tests/auth-mfa.test.ts)                                                                                                 | Pruebas simuladas de MFA, QR, UI, proof y autorización.                                                                             |
| [auth-mfa-integration.test.ts](tests/auth-mfa-integration.test.ts)                                                                         | Composición con resolución real de perfil/membresías y adaptador SSR; proveedor simulado.                                           |
| [auth-proxy.test.ts](tests/auth-proxy.test.ts)                                                                                             | Regresiones del orden CSRF/proxy y renovación de GET.                                                                               |

No se añadieron dependencias o variables de entorno. Se usan @supabase/supabase-js 2.118.0 y @supabase/ssr 0.12.7 instalados. Las páginas académicas y sus repositorios continúan sin CRUD integrado.

## 3. Funcionamiento

### 3.1. Acceso inicial con aal1

La página y cada POST comprueban:

1. Configuración Auth válida.
2. Usuario y claims verificados por el SDK, con identidad coherente.
3. Perfil activo y vínculo Auth correspondiente.
4. Membresía admin activa en una organización activa.

No se usa el guard del Panel Admin como entrada a configuración: ese guard ya exige aal2 y bloquearía el primer enrollment. La excepción permite únicamente configurar/verificar el factor propio.

Una sesión ausente redirige al login desde la página; los POST responden 401. Un alumno, perfil bloqueado, falta de perfil/membresía o ausencia de organización administrativa vigente recibe denegación sin iniciar operaciones MFA. Fallos de configuración o servicio producen respuestas genéricas.

### 3.2. Enrollment

GET /auth/mfa solo consulta y muestra opciones. El botón Configurar TOTP envía POST /auth/mfa/enroll.

El servidor revalida la candidatura y consulta listFactors().data.all. Se utiliza all porque la colección totp del SDK contiene únicamente factores verificados y omitiría los pendientes. Si ya existe algún TOTP, se dirige al flujo de verificación; no crea otro automáticamente.

El SDK enroll recibe factorType=totp. Su respuesta se trata únicamente en servidor:

- El QR se entrega como imagen data URI en el HTML privado de ese POST.
- Se normaliza el formato SVG conocido de Supabase/SVGo: encabezado XML 1.0, comentario del generador, namespace xlink sin uso y estilos black/white de sus rectángulos.
- Se bloquean DTD, scripts, elementos activos, eventos, estilos no admitidos y referencias externas. No se inserta SVG con innerHTML.
- El SVG permitido se convierte a base64 y se presenta mediante img.
- La semilla no se copia en texto, cookies, URLs o formularios. El QR contiene la configuración sensible necesaria y solo se entrega al titular autenticado.

El formato se contrastó con el [enrollment de Supabase Auth](https://github.com/supabase/auth/blob/master/internal/api/mfa.go), [SVGo](https://github.com/ajstarks/svgo/blob/master/svg.go) y [goqrsvg](https://github.com/aaronarduino/goqrsvg/blob/master/goqrsvg.go). Los fixtures reproducen su estructura; no se solicitó ni escaneó un QR real.

Tras escanear, el usuario continúa al challenge. El QR no se persiste para recuperarlo con un GET. Si se pierde antes de guardarlo, la interfaz informa que debe revisarse el factor pendiente con el encargado. No hay borrado automático ni endpoint de unenrollment en este paso.

### 3.3. Challenge

POST /auth/mfa/challenge exige que factor_id aparezca en el listado de factores propios y sea TOTP, pendiente o verificado. Un UUID ajeno no provoca una llamada challenge.

El SDK crea el challenge. La aplicación firma una prueba independiente con:

- Propósito mfa-totp.
- Identidad Auth, sesión previa y perfil.
- Organización cuya membresía administrativa permitió el flujo.
- UUID del factor y challenge.
- Vencimiento: el menor entre expires_at del proveedor y cinco minutos.

La cookie sa-mfa-challenge es HttpOnly, SameSite=Lax, Path=/auth/mfa y Secure cuando APP_ORIGIN usa HTTPS. No contiene QR, semilla, código TOTP, access token o refresh token. Su MAC tiene un contexto distinto al de recuperación, aunque reutiliza el secreto privado ya configurado.

La respuesta presenta el formulario de seis dígitos, sin reflejar códigos anteriores.

### 3.4. Verificación y sesión resultante

Antes de verify se vuelven a comprobar candidatura, factor propio, firma, plazo y coincidencia de usuario/sesión/perfil/organización/factor/challenge. No se acepta un indicador MFA del navegador.

La prueba local se limpia al intentar la verificación. El SDK se invoca con un cliente SSR escribible. Después de una respuesta sin error se vuelven a consultar getUser/getClaims del mismo cliente y la pertenencia vigente:

- Identidad consistente, email confirmado y usuario no anónimo.
- Claim firmado/verificado aal2 y sesión válida.
- Perfil activo y misma organización administrativa aprobada.

Si el proveedor no entrega aal2, cambia la identidad o se revoca el perfil/membresía durante el flujo, no se muestra éxito administrativo. Se admite que el proveedor renueve session_id después de verify; la vinculación exigida al proof corresponde a la sesión previa.

El éxito devuelve 303 a /seleccionar-organizacion. El Panel Admin vuelve a aplicar su guard al recibir la nueva solicitud. No se cambia su requisito aal2 ni el de las RPC. La persistencia de cookies sigue el adaptador SSR existente y el evento MFA_CHALLENGE_VERIFIED soportado por la versión instalada; los tests simulan esa escritura, no una sesión Cloud.

Códigos incorrectos o expirados redirigen con un aviso genérico y requieren un nuevo challenge, no un nuevo enrollment. Errores de formato devuelven 400; Origin o factor ajeno, 403; configuración/servicio no disponible, 503. No se reflejan errores internos del proveedor.

## 4. Controles de seguridad

| Control             | Aplicación                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CSRF                | sameOriginPost intacto: POST, Origin exacto y Fetch Metadata permitido. Rechaza ausente/null/origen externo.                                                                         |
| Orden del proxy     | No inicializa SDK ni renueva sesión antes del handler en enroll/challenge/verify. GET conserva su renovación habitual.                                                               |
| Datos de formulario | URL-encoded, cuerpo limitado por el lector existente; UUID y código de seis dígitos validados.                                                                                       |
| Factores propios    | listFactors de la sesión actual; factor_type totp; sin aceptar propiedad o rol desde el formulario.                                                                                  |
| Proof               | HMAC separado, plazo acotado y vinculación a identidad/sesión/perfil/organización/factor/challenge.                                                                                  |
| Claims posteriores  | getUser/getClaims nuevos tras verify y nueva consulta de pertenencia; no se reutiliza el estado aal1 cacheado.                                                                       |
| Caché               | Respuestas privadas no-store, sin caché compartida; página force-dynamic y revalidate=0.                                                                                             |
| Cookies             | Proof HttpOnly separado; cliente SSR escribible para la sesión del proveedor; limpieza del proof en login/logout. No se afirma que todas las cookies estándar del SDK sean HttpOnly. |
| QR y HTML           | Imagen base64, datos escapados, sin scripts, recursos de QR externos, seed en texto o SVG activo.                                                                                    |
| CSP y origen        | CSP existente con nonce, img data permitido, frame-ancestors none y form-action self; Referrer-Policy strict-origin conserva Origin en formularios nativos.                          |
| Errores y logging   | Respuestas genéricas; sin logs de códigos, semillas, QR, cookies o tokens.                                                                                                           |
| Roles/RLS           | No se modificaron el guard de autorización ni SQL. Aal2 no convierte un alumno en Admin.                                                                                             |
| Independencia       | Los tres flags de recuperación/invitaciones conservan su comportamiento; /demo sigue fuera de Auth.                                                                                  |

## 5. Pruebas y resultados

| Comprobación ejecutada       | Resultado                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| npm run test                 | **210/210 pruebas**, 11 archivos; ninguna omitida en esta ejecución.                                  |
| Casos nuevos MFA/UI/proof    | **69** con SDK simulado.                                                                              |
| Integración adicional        | **3** con resolución de perfil/membresía y adaptador SSR reales de la aplicación, proveedor simulado. |
| Regresiones nuevas del proxy | **4**.                                                                                                |
| npm run lint                 | Aprobado sin advertencias.                                                                            |
| npm run typecheck            | Aprobado.                                                                                             |
| npm run build                | Aprobado; incluye /auth/mfa y sus tres handlers.                                                      |
| HTTP local del build         | **8 comprobaciones aprobadas**, descritas abajo.                                                      |

La cobertura nueva incluye usuario sin sesión, alumno incluso con aal2, falta/bloqueo de perfil, ausencia de membresía, organización suspendida, Admin aal1 y aal2; enrollment, factores pendientes/verificados, duplicados, challenge, firma/bindings, código inválido/expirado, factor ajeno, SID o identidad distinta, SDK caído, revocación antes/durante verify y claims que continúan aal1.

También se probaron avisos de UI manipulados, SVG malicioso y formato SVGo compatible, expiración del proof, separación de recuperación, CSRF, caché, cookie Secure/HttpOnly, escritura de sesión y admisión de session_id renovado. Las pruebas de demo y permisos previas siguen aprobadas.

Las tres pruebas compuestas verifican especialmente que el adaptador escribible propague cookies del SDK simulado, que la resolución real deniegue un alumno con aal2 y que un perfil bloqueado durante verify siga sin acceso aunque Auth devuelva aal2.

Las ocho comprobaciones HTTP utilizaron el build en un proceso temporal sobre 127.0.0.1:3113 con SUPABASE_AUTH_ENABLED=false **solo en ese proceso**:

- GET /auth/mfa: 200 con acceso sin configurar, sin formulario de enrollment.
- GET de los tres handlers: 405.
- POST de los tres handlers: 503 por configuración desactivada.
- GET /demo/o/incubadora/dashboard: 200 y no-referrer.

Las rutas Auth conservaron no-store y strict-origin; no se emitieron cookies de sesión. El servidor temporal se cerró. No se modificó .env.local ni se usaron cookies/credenciales del navegador del usuario. La prueba HTTP no acredita MFA real.

No se ejecutó npm run check, porque incluye la suite histórica de base con seed. Las 36 pruebas SQL de Paso 3 son evidencia anterior y no se repitieron aquí.

Se compararon las huellas de 150 archivos protegidos, incluida .env.local sin mostrar sus valores: no hubo cambios inesperados. Las cinco migraciones conservan los SHA-256 aprobados de Fase 4C. El guard de autorización, el control Origin, la resolución de identidad, los fixtures de demo y los artefactos QA anteriores permanecen intactos. Los archivos modificados de este paso se enumeran en la sección 2.

## 6. Limitaciones de las simulaciones

1. No se validaron JWT emitidos por Cloud, códigos TOTP reales, escaneo, entrega efectiva del QR o persistencia de una sesión real entre solicitudes. La compatibilidad SVG se probó con fixtures contrastados con fuentes, no con una respuesta del proyecto.
2. listFactors seguido de enroll no es una transacción atómica ante dos POST simultáneos. El proveedor controla sus límites y errores; no se promete idempotencia distribuida del enrollment.
3. Si el proveedor crea el factor pero falla la respuesta, el QR no es admisible o se pierde antes de guardarlo, puede quedar un factor pendiente. No se elimina ni reemplaza automáticamente; requiere revisión autorizada.
4. El proof es stateless. Borrar su cookie no constituye un registro global de consumo o revocación. El consumo de un challenge y los límites de intentos corresponden al proveedor y siguen pendientes de comprobar realmente.
5. No se implementó rate limiting distribuido, recuperación de factor perdido, códigos de respaldo o gestión de varios dispositivos. No se deben afirmar esas capacidades.
6. El estado aal2 es global de la identidad, pero la pertenencia sigue siendo por organización. No se probaron permisos positivos reales de alumnos/Admin, CRUD ni aislamiento positivo con dos organizaciones Cloud.
7. La restricción de que solo candidatos Admin usan esta interfaz no convierte MFA en un asignador de roles. Un factor configurado por otra vía del proveedor tampoco concede un rol SQL.

Estas limitaciones no rebajan las verificaciones existentes. La [guía oficial TOTP](https://supabase.com/docs/guides/auth/auth-mfa/totp) describe el enrollment y challenge del proveedor; la prueba real debe confirmar su comportamiento en el proyecto concreto.

## 7. Requisitos para una prueba real posterior

Antes de cualquier operación sobre factores reales se requiere una autorización acotada que identifique:

- Proyecto rnxgrunnrdlgjsbsrjev y una cuenta sintética concreta por UUID, con titular autorizado y control legítimo de la identidad.
- Perfil activo, organización QA activa y membresía admin aprobada. El aprovisionamiento Cloud y el uso de la cuenta existente como Admin no están autorizados por este paso.
- Scope de un enrollment TOTP y sus challenges/verificaciones. Acordar custodia del dispositivo y actuación ante un factor pendiente o pérdida; no aprobar su eliminación implícitamente.
- Configuración local válida y proveedor TOTP habilitado, sin rebajar confirmación, RLS o MFA. No se necesita SMTP para estas operaciones.
- Resultado esperado: Admin aal1 denegado y, solo después de verificar el código y recibir claims aal2, Panel Admin permitido como módulo protegido. CRUD continúa sin integrar.

Cualquier usuario/fila necesaria se autoriza mediante el procedimiento QA anterior, sin seed. Las pruebas de alumno u otra organización requieren sus propias identidades y alcance, no convertir temporalmente el mismo perfil de rol para evitar controles.

## 8. Procedimiento manual posterior

**No ejecutado todavía:**

1. Confirmar autorizaciones, destino, estado de la cuenta/perfil/membresía y configuración. Reiniciar Next local si corresponde sin compartir valores privados.
2. Abrir http://127.0.0.1:3000/login e iniciar sesión personalmente con la cuenta QA administrativa aprobada.
3. Comprobar que Admin requiere MFA mientras la sesión permanezca aal1. Abrir Configurar/verificar MFA desde el selector o la denegación.
4. En /auth/mfa, comprobar que solo se muestran los factores propios. Si no hay TOTP, pulsar Configurar TOTP una sola vez.
5. Escanear el QR con el autenticador personal. No compartir capturas, HTML, HAR, cookies, QR o códigos. El contenido del QR es sensible aunque no se muestre una semilla textual.
6. Continuar para generar un challenge e introducir el código actual. Con código incorrecto o vencido debe volver un mensaje genérico; generar otro challenge sin crear otro factor. No ejecutar pruebas de agotamiento de intentos.
7. Con código correcto, comprobar 303 al selector y la nueva sesión verificada. Entrar a Admin QA y comprobar el módulo protegido; no interpretar el placeholder como CRUD implementado.
8. Confirmar persistencia del nivel en una nueva solicitud, caducidad/challenge vencido y que no haya mezcla entre organizaciones. Registrar solo resultados, etiquetas/UUID de prueba y estados; sin material de autenticación.
9. Si se autorizó una cuenta de alumno, comprobar su denegación en /auth/mfa y Admin sin crearle factores para esa prueba.
10. Probar logout y nuevo login: no reusar el proof anterior; si el proveedor exige otro challenge, verificar el factor existente sin reenrollment.
11. Si falta el QR, el proveedor falla o el factor queda pendiente, detenerse y documentar el estado mínimo. No borrar factores, resetear contraseñas o cambiar roles sin nueva autorización.

No se cambia aquí la configuración real ni se ejecuta el procedimiento manual. Los resultados de cada paso deberán registrarse como observados por el titular o por una prueba independiente, sin confundirlos con las simulaciones actuales.

Estado final: MFA TOTP preparado localmente con guardas, UI y handlers; pruebas y compilación aprobadas; Panel/RPC continúan exigiendo aal2; factores y usuarios Cloud sin operaciones reales en esta fase.
