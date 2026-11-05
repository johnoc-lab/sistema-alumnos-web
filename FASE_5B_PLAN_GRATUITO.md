# Fase 5B — Autenticación con presupuesto cero

Fecha de revisión: 2 de noviembre de 2026. Proyecto: SistemaAlumnos-Web, rama feature/supabase-auth. Supabase de desarrollo: sistema-alumnos-dev, Project Ref rnxgrunnrdlgjsbsrjev.

**Decisión:** preparar primero login con contraseña y MFA TOTP, sin depender del envío de correo. La recuperación e invitación públicas deben seguir desactivadas hasta disponer de un flujo compatible y probado. No se necesita contratar un servicio para realizar una primera prueba controlada de login.

Este entregable es exclusivamente auditoría y planificación. No se modificó código funcional, no se activó Auth, no se enviaron correos y no se crearon usuarios/registros remotos. No se ejecutaron seeds, migraciones, cambios de permisos, configuración de pago, push o despliegues. Los cambios propuestos abajo no están implementados por este documento.

## 1. Estado comprobado

- Rama actual: feature/supabase-auth; se preservaron los cambios locales anteriores.
- .env.local existe, está ignorado y no figura entre los archivos versionados.
- SUPABASE_AUTH_ENABLED=false se mantiene.
- La URL pública coincide con el proyecto autorizado; existe una clave con prefijo publishable y el secreto de flujo cumple la longitud mínima. No se imprimieron ni copiaron sus valores. No se validó la clave mediante una autenticación.
- APP_ORIGIN es http://127.0.0.1:3000.
- config diff se ejecutó únicamente en lectura. No encontró diferencias respecto de los valores locales false para registro público y anónimo ni respecto del Site URL local.
- Cloud mantiene confirmación de email y TOTP enroll/verify habilitados.
- Redirect URLs reales: http://127.0.0.1:3000/auth/callback y http://127.0.0.1:3000/auth/confirm.
- Data API expone public y graphql_public; private no está expuesto.

Esto actualiza la observación histórica de fase 5A: los ajustes manuales que el usuario realizó después ya no dejan el registro abierto. No se cambió la configuración de Cloud en esta revisión.

No se comprobó el plan de facturación desde una cuenta de pagos: se toma Supabase Free y el presupuesto S/ 0 como contexto y límite del usuario. No se accedió a Vercel para modificarlo ni se contrataron recursos.

## 2. Condiciones reales del correo gratuito

La documentación oficial confirma que, desde el 3 de junio de 2026, los proyectos Free nuevos con el proveedor de correo predeterminado no pueden personalizar sus plantillas. Hay excepciones para proyectos antiguos o con SMTP propio; no basar este proyecto nuevo en esas excepciones. [Cambio oficial de plantillas](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier).

El SMTP predeterminado solo envía a direcciones de miembros autorizados del equipo del proyecto. El límite documentado es actualmente **2 mensajes por hora por proyecto**, puede cambiar y el servicio no ofrece SLA de entrega. No sirve como correo general para alumnos. [Restricciones de SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

No añadir alumnos al equipo de Supabase para que reciban correos: ese equipo controla infraestructura y es distinto de las membresías académicas. No enviar a direcciones aleatorias o ajenas y no gastar la cuota comprobando si una cuenta existe.

Login con contraseña de una cuenta ya confirmada y MFA TOTP no necesitan enviar un correo en cada acceso. No se apagarán confirmación de email, RLS o MFA para evitar los límites de envío.

## 3. Auditoría de recuperación e invitación de fase 5A

### Archivos revisados

- src/lib/auth/handlers.server.ts: recover, confirm, password y callback.
- src/lib/auth/recovery.server.ts: firma HMAC y vinculación a usuario/sesión.
- src/app/auth/confirm/page.tsx y auth/actualizar-password/page.tsx.
- src/features/auth/components/auth-form.tsx: formularios y enlace de recuperación.
- Clientes SSR/navegador, proxy, resolución de sesión y guard administrativo.
- SDK instalado: @supabase/auth-js, especialmente GoTrueClient y GoTrueAdminApi.
- Tablas de perfiles/membresías/activación e integridad del último administrador.

### Hallazgos confirmados por el código

1. POST /auth/recover llama resetPasswordForEmail con retorno a /auth/callback.
2. La plantilla personalizada diseñada en 5A esperaba entregar token_hash a /auth/confirm.
3. El callback actual intercambia un code PKCE y siempre lleva al selector. No emite sa-credential-update.
4. /auth/password exige esa prueba HMAC ligada a sub, session_id y vencimiento; una sesión de recuperación por sí sola no basta.
5. El cliente de navegador tiene detectSessionInUrl=false. El servidor no puede leer fragmentos #access_token de una URL.
6. GET /auth/confirm no consume el enlace; POST /auth/verify acepta token_hash recovery/invite. No hay un endpoint de envío de invitaciones administrativas en la aplicación.
7. El mensaje de recuperación es deliberadamente uniforme. Ver “si la cuenta admite recuperación...” no demuestra que se haya enviado ni entregado el correo.
8. No existen flags separados para email y aceptación de invitaciones: activar el flag global hoy también habilitaría el POST de recuperación.

### Qué ocurre con las plantillas predeterminadas

**Recuperación:** al iniciarla mediante PKCE desde el mismo navegador, el enlace predeterminado puede terminar en un code que el callback sabe intercambiar. Pero la implementación actual no completa el cambio de contraseña porque falta su prueba HMAC. En otro navegador/dispositivo puede faltar el verificador y fallar antes. No está validada de extremo a extremo y debe quedar desactivada.

**Invitación:** inviteUserByEmail no soporta PKCE según el SDK instalado. El enlace predeterminado puede entregar la sesión en fragmentos, que el callback de servidor actual no procesa. Por ello no habilitar invitaciones por correo ni asumir que cambiar Redirect URLs resuelve el problema.

Las limitaciones de [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow) y los [retornos predeterminados de correo](https://supabase.com/docs/guides/auth/auth-email-templates) requieren distinguir ambos casos. No se debe generalizar que todo enlace predeterminado es incompatible con SSR: la recuperación PKCE es adaptable; la invitación actual necesita otro diseño.

**Corregir solo el destino a /auth/actualizar-password no funciona:** el endpoint seguirá exigiendo la prueba. No eliminar esa exigencia ni confiar en un type=recovery enviado en la URL para hacer pasar el flujo.

## 4. Matriz de disponibilidad

| Flujo                                  | Con el código actual y flag global false                | Decisión para presupuesto cero                                                                          |
| -------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Demo /demo                             | Disponible e independiente                              | Mantener intacta.                                                                                       |
| Login con contraseña                   | Implementado, desactivado; sin cuenta no puede probarse | Primera prueba después de autorización y preparación local.                                             |
| Logout local                           | Implementado, sin sesión real en esta auditoría         | Probar junto al primer login.                                                                           |
| Perfil/membresía/tenant y guard aal2   | Implementados; RLS permanece                            | No modificar ni usar service_role para consultas normales.                                              |
| Recuperación por correo predeterminado | Incompleta de extremo a extremo                         | Desactivada hasta adaptar PKCE y probar envío autorizado.                                               |
| Confirmación recovery por token_hash   | Implementada para un hash válido                        | Posible uso manual controlado sin SMTP, previa autorización y pruebas; no es recuperación pública.      |
| Invitación predeterminada              | No integrada al retorno por fragmentos                  | Desactivada.                                                                                            |
| Plantillas personalizadas de 5A        | No disponibles con este proveedor Free nuevo            | No son requisito para la primera prueba; no intentar editarlas por otra API para eludir la restricción. |
| Enrollment/challenge TOTP              | Gate aal2 existe; interfaz todavía no                   | Preparar e implementar localmente antes de una prueba positiva de Admin.                                |
| Alta/vinculación de identidades        | Sin automatismo público                                 | Solo operador autorizado, separado del login.                                                           |
| CRUD académico                         | No habilitado                                           | No abrir en esta etapa.                                                                                 |

## 5. Cambios locales necesarios antes de activar Auth

### P0 — Separar operaciones de correo del login

Propuesta de flags privados, con valores iniciales false:

- AUTH_EMAIL_RECOVERY_ENABLED: permite únicamente solicitar correo mediante /auth/recover.
- AUTH_TOKEN_HASH_RECOVERY_ENABLED: permite el circuito manual recovery de /auth/confirm y /auth/verify.
- AUTH_INVITATION_ACCEPT_ENABLED: permite aceptar invitaciones cuando exista una vía aprobada.
- SUPABASE_AUTH_ENABLED: sigue controlando la integración general.

Comprobarlos en servidor antes de llamar al SDK y reflejarlos en la UI. Ocultar un enlace no bloquea un POST directo. Una operación desactivada debe responder de forma genérica sin enviar correo ni consumir la cuota de SMTP.

Para la primera prueba de login con contraseña: global true solo tras autorización local; los tres flags de correo/aceptación continúan false. No hay que tocar migraciones ni Data API para añadir estos controles.

### P1 — Adaptar recuperación predeterminada, si se decide probarla

Preparar en una tarea posterior:

1. Mantener la respuesta uniforme y crear un estado de inicio de recuperación firmado y HttpOnly, corto, con propósito propio.
2. Vincularlo al verificador PKCE realmente emitido y a la identidad destinataria esperada, sin guardar el verificador en claro en registros.
3. En el callback, comprobar el estado de inicio, intercambiar el code, verificar getUser/getClaims y correspondencia del destinatario/sesión.
4. Solo entonces emitir la prueba sa-credential-update y abrir la página de contraseña.
5. Consumir/limpiar el estado y la prueba; un código genérico, un parámetro URL o un evento del navegador no otorga esta capacidad.
6. Probar caducidad, falta de cookies, pestañas concurrentes, dispositivo distinto, enlace ya usado y navegación por escáner de correo.

El SDK devuelve redirectType, pero lo obtiene del almacenamiento local del verificador; no es por sí solo un claim firmado de Auth. No usarlo como única prueba de que se autorizó recuperación.

Esta adaptación no elimina la restricción de destinatarios ni convierte el SMTP predeterminado en un servicio masivo.

### P1 — Invitaciones

No incorporar un lector genérico de fragmentos ni aceptar tokens de URL para “hacer funcionar” las invitaciones sin analizar login CSRF, vinculación y confirmación del usuario. Mantenerlas cerradas. La alternativa inicial es crear cuentas administrativamente y vincularlas mediante UUID, sin enviar invitación.

### P1 — MFA local

Añadir las páginas/POST indicados en la sección 9. Solo después se autorizarán operaciones reales de enrollment sobre las cuentas de prueba.

## 6. Primera cuenta sintética sin enviar correo

### Procedimiento administrativo recomendado

La primera prueba será con **una única cuenta QA_AUTH_ONLY**, sin perfil, organización ni membresía. Su resultado esperado es autenticarse y ver acceso académico denegado. No se asigna ni siquiera student por defecto.

El operador y probador inicial pueden ser la misma persona. Usar un buzón o alias de pruebas que ya controle y cuya titularidad pueda comprobar; el nombre/datos de negocio serán sintéticos. No hace falta comprar dominio o correo.

Propuesta para aprobación posterior:

1. Aprobar por escrito proyecto, etiqueta de prueba, responsable, dirección controlada, plazo de uso y cantidad máxima de una cuenta.
2. Elegir una contraseña larga, aleatoria y exclusiva en un gestor local; no enviarla por email, chat o comandos. El operador/probador único la introduce privadamente.
3. Usar Dashboard administrativo o auth.admin.createUser desde una herramienta local aislada, con clave administrativa solo en memoria/entorno privado; nunca desde Next.js ni un endpoint web.
4. La confirmación administrativa individual solo se permite **tras verificar el control del buzón** y registrar esa verificación. email_confirm=true es una capacidad de operador, no una comprobación automática de propiedad. No marcar como verificadas direcciones inventadas solo para saltarse el correo.
5. Mantener Confirm Email habilitado globalmente. createUser no envía correo de confirmación por sí mismo; no confundirlo con inviteUserByEmail.
6. Registrar únicamente el UUID Auth retornado y la referencia de autorización. No imprimir el objeto completo: puede incluir datos que no se necesitan para la bitácora.
7. Confirmar que no se crearon profiles, organization_memberships u organizaciones automáticamente.
8. Si el buzón no está verificado o el proveedor rechaza la dirección, detenerse; no deshabilitar validación o confirmación para continuar.

Este mecanismo administrativo está documentado por [createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser). Su uso real no está autorizado por este plan. Un correo ficticio no enrutable sirve para mocks/local, pero no demuestra control de un buzón en Cloud.

No se preparan contraseñas comunes, cuentas compartidas o un script que inserte directamente en auth.users. Si se separan operador y probador, preferir el establecimiento individual de contraseña descrito abajo, sin que ambos conserven una contraseña permanente.

### Alternativa manual sin SMTP: enlace de recuperación controlado

Tras otra autorización, un operador puede generar un enlace recovery para una cuenta existente y verificada, sin pedir al proveedor que lo envíe. generateLink genera material para entregar por otro canal; no es lo mismo que mandar un email. [Referencia](https://supabase.com/docs/reference/javascript/auth-admin-generatelink).

Para reutilizar el circuito 5A, el procedimiento local deberá verificar el Auth UUID/destinatario aprobado, obtener properties.hashed_token y construir exclusivamente el enlace de origen fijo /auth/confirm?token_hash=...&type=recovery. El tipo y propiedad existen en el SDK instalado.

No entregar ciegamente properties.action_link: el enlace predeterminado puede volver a un retorno por fragmentos incompatible con el servidor actual.

Controles obligatorios:

- Solo recovery de una cuenta conocida; no signup, invite o magiclink, que pueden crear cuentas.
- Acceso mediante herramienta de operador, sin endpoint público de “generar mi enlace”.
- Enlace como credencial portadora: no logs, Git, capturas compartidas ni conversación pública.
- Entrega privada al titular ya verificado mediante un canal existente autorizado; no transmite una contraseña.
- Origen local explícito y vigente. Un enlace a 127.0.0.1 se abre en el equipo del destinatario, no en el servidor del operador.
- Hash válido, un solo uso del proveedor, prueba ligada a sesión y caducidad local. No se promete revocación global de una prueba estateless solo por borrar una cookie.
- Habilitar únicamente el flag token_hash para esa prueba; recuperación por correo e invitaciones permanecen false.
- No eliminar MFA para completar una recuperación.

Es sostenible para un laboratorio pequeño, con trabajo humano. No reemplaza recuperación autoservicio para todos los alumnos ni demuestra una vía de correo gratuito escalable.

## 7. Vinculación segura Auth → perfil → membresía

### Fuente de autoridad

El login solo prueba identidad. La pertenencia se adjudica por un operador con una autorización separada, no por dominio de email, user_metadata, etiqueta QA, URL, primer login o igualdad aproximada de nombres.

Preparar un manifiesto sin secretos:

| Campo                          | Regla                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------ |
| approval_id / operation_id     | UUID de operación e idempotencia.                                              |
| project_ref                    | El Ref autorizado, comprobado antes de cada etapa.                             |
| auth_user_id                   | UUID obtenido de Auth Admin y verificado de nuevo por ID.                      |
| profile_id                     | Persona adjudicada explícitamente; no fusionar por correo.                     |
| organization_id                | Organización aprobada.                                                         |
| membership_id                  | Relación específica.                                                           |
| role                           | Valor explícito student/admin; si falta, abortar en vez de adoptar un default. |
| decisión / responsable / fecha | Evidencia de quién aprobó el vínculo y el rol.                                 |
| estado / vencimiento de prueba | Control operativo, sin passwords, tokens o QR.                                 |

Para Admin se requiere una aprobación de rol explícita; no es consecuencia de crear una cuenta Auth o verificar TOTP.

### Transacción de aplicación futura

Después de aprobar registros concretos:

1. Verificar Auth por UUID y control de identidad/buzón; no aceptar una coincidencia de email como prueba suficiente.
2. Bloquear las filas pertinentes, comprobar versiones/vínculos existentes e impedir que un perfil ya vinculado se reasigne silenciosamente.
3. Crear/revisar profile y membresías con estado pendiente/invitado, UUID y FKs del tenant correcto.
4. Usar private.identity_activation_requests con idempotency_key y contacto adjudicado, verified_at y auth_user_id. No guarda enlaces o códigos.
5. En una transacción controlada vincular profiles.auth_user_id, activar el perfil/membresía aprobados y marcar linked cuando las referencias sean coherentes.
6. Registrar auditoría con referencia de operación. Los triggers registran cambios, pero no se debe asumir que identifican por sí solos a un operador externo sin perfil; conservar la aprobación y responsable en la bitácora de control.
7. Releer con JWT ordinario del usuario y RLS para confirmar el alcance. La sesión de dueño/service_role no prueba aislamiento.

Auth Admin y la transacción SQL no forman una única transacción distribuida. Si el alta Auth funciona pero falla el vínculo, dejar el caso pendiente y sin acceso académico; registrar el UUID y detenerse. Reintentar por operation_id/UUID, sin crear otra persona, fusionar por correo, ejecutar seed o aplicar repair/reset.

No existe aún una RPC pública autorizada de provisionamiento. La operación inicial puede ser de operador y DML revisado sobre las tablas existentes; no se expone service_role a Next. Si después se propone una función nueva, requerirá una migración nueva y autorización, nunca editar las cinco aplicadas.

### Bootstrap de organizaciones

El modelo exige al menos un Admin activo con perfil activo y Auth vinculado por cada organización activa. **No puede activarse una organización solo con un alumno.**

Preparación correcta: organización suspended, perfiles/membresías aprobados, Admin explícito y coherente, activación final de la organización dentro de la transacción. Los constraints diferidos validan el estado al confirmar. No se deshabilitan triggers para resolver el bootstrap.

Un perfil puede tener membresías en ambas organizaciones; cada rol se aprueba por separado. MFA aumenta la garantía de la identidad, no convierte student de Incubadora en Admin por ser Admin de Impulso.

## 8. Plan de cuentas y pruebas por etapas

Ninguna cuenta o registro de esta tabla se crea ahora.

| Etapa | Conjunto máximo propuesto                                     | Validación                                                           |
| ----- | ------------------------------------------------------------- | -------------------------------------------------------------------- |
| A     | 1 Auth QA_AUTH_ONLY, sin perfil                               | Login/logout y denegación sin perfil. Sin SQL de negocio.            |
| B     | 2 Admin y 2 alumnos, distribuidos entre dos organizaciones QA | Bootstrap válido, permisos de alumno y separación de organizaciones. |
| C     | Un perfil con dos membresías aprobadas, si se autoriza        | Selector y roles distintos por tenant sin inferencias por dominio.   |

Las organizaciones de B deben distinguirse claramente como QA. No adjudicar datos históricos de Impulso/Incubadora sin decisión explícita. No usar el seed para llenar el proyecto.

Pruebas requeridas antes de ampliar el piloto:

- Sin sesión, sesión inválida/vencida, Auth sin perfil, perfil bloqueado o sin membresía.
- Alumno de A: Dashboard A permitido; Admin A y Dashboard/Admin B denegados.
- Admin A con aal1: acceso administrativo denegado hasta MFA; candidato legítimo puede configurar su factor.
- Admin A con aal2: Admin A permitido; Admin B sigue denegado.
- Organización/membresía suspendida: denegación inmediata al releer y en RLS.
- Factor ajeno, código erróneo/vencido, challenge ajeno, reintento y caducidad: sin elevación.
- Logout: cookies propias eliminadas; no acceso por navegación atrás/caché.
- Rutas de recuperación/invitación desactivadas: ningún envío aunque se invoque el POST directamente.
- Callback sin estado de recuperación, con next externo o marcadores manipulados: no prueba de contraseña.
- /demo con y sin cookies: sin SDK Auth, consultas o renovación de sesión.

Las páginas académicas actuales son placeholders protegidos: entrar en ellas no demuestra matrícula ni acceso a un curso. Las pruebas por curso/material/evento necesitarán datos concretos autorizados y consultas de negocio posteriores.

## 9. Estrategia MFA TOTP sin correo ni SMS

Supabase documenta TOTP sin coste de API adicional. Se utilizará una app autenticadora existente en un dispositivo del titular; no se contrata SMS ni se compra hardware. [TOTP oficial](https://supabase.com/docs/guides/auth/auth-mfa/totp).

### Evitar un bloqueo circular

La página de seguridad debe aceptar al candidato en aal1 **solo si** getUser/getClaims, perfil activo, organización y membresía admin activos están verificados. No debe exigir org_admin(…) como entrada, porque ese predicado ya exige aal2 y bloquearía el primer enrollment.

Esta excepción permite configurar el propio factor, no entrar al panel ni ejecutar sus RPC. El guard de Admin y RLS continúan exigiendo aal2.

### Rutas propuestas, no implementadas todavía

| Ruta                      | Contrato                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| GET /auth/mfa             | Sesión verificada; decide si falta enrollment o challenge. No muta al abrirse/prefetch.                 |
| POST /auth/mfa/enroll     | Origin estricto; revalida candidato; lista factores propios y evita duplicar uno ya verificado.         |
| POST /auth/mfa/challenge  | Valida que factorId pertenezca al usuario, sea TOTP y tenga estado adecuado.                            |
| POST /auth/mfa/verify     | Verifica challenge/código del usuario y sesión actuales; no acepta un rol del cliente.                  |
| Cancelar factor pendiente | Solo propio no verificado y con confirmación explícita. No borrar factores verificados automáticamente. |

Secuencia: listFactors → enroll si hace falta → mostrar QR al titular → challenge/verify o challengeAndVerify → persistir cookies del SDK → redirección 303 → nueva petición con getClaims/getUser y aal2.

Nunca elevar aal en memoria o user_metadata. No confiar en un booleano “MFA completado” del navegador. El nuevo JWT debe demostrar el nivel.

QR/semilla se muestran exclusivamente al titular para su autenticador, sin servicios externos de QR, analytics, logs, Git o almacenamiento permanente de la app. Usar imagen data URI/CSP adecuada; no insertar SVG remoto sin tratar. Las respuestas son privadas y no-store.

Si se usa estado firmado de challenge: propósito distinto de recuperación, UID, session_id, factorId, challengeId, nonce y caducidad acotada a la del proveedor. No reutilizar sa-credential-update como prueba MFA.

Si se pierde el dispositivo, no eliminar MFA desde un formulario público ni degradar Admin a aal1. Preparar recuperación de operador con prueba de identidad y aprobación; mantener un sustituto administrativo autorizado. No afirmar que existan códigos de respaldo sin implementarlos.

## 10. Alternativas sostenibles con S/ 0

| Opción                              | Ventaja                                                          | Límite / decisión                                                                                                                                  |
| ----------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contraseña + TOTP y alta controlada | Sin correo en cada login; adecuada para pruebas y piloto pequeño | Provisionamiento/recuperación requieren trabajo humano y control de identidad.                                                                     |
| SMTP predeterminado                 | Sin alta de servicio adicional                                   | Solo pruebas puntuales a miembros ya autorizados; cuota pequeña y no SLA.                                                                          |
| Enlace manual de operador           | No depende de entrega SMTP                                       | Credencial sensible, alta intervención y alcance pequeño; requiere autorización aparte.                                                            |
| SMTP institucional ya disponible    | Puede permitir plantillas sin gasto incremental                  | Solo si ya existe, su titular lo autoriza y cuotas/términos lo admiten. No se asume disponible.                                                    |
| Proveedor SMTP con cuota gratis     | Posibilidad futura                                               | Revisar requisitos de dominio, tarjeta, límites y sobrecostes antes de considerar; no contratar/configurar ahora ni prometer gratuidad permanente. |
| Supabase local con Mailpit          | Permite probar correos sin envío real                            | Requiere Docker/hardware ya disponibles; en fases previas Docker no estaba disponible. No instalarlo automáticamente.                              |

No contratar dominio, SMTP, SMS, add-ons o upgrades para desbloquear esta fase. Revisar cuotas y parar el piloto si excede el nivel gratuito; no pagar automáticamente para reanudarlo.

Supabase Free publica límites de uso y pausa por inactividad; no prometer disponibilidad ilimitada de un sistema productivo por S/ 0. [Plan Free](https://supabase.com/pricing).

Para un eventual despliegue, Vercel Hobby tiene condiciones de uso personal no comercial. Validar que el uso del sistema sea elegible; este documento no presupone esa elegibilidad ni cambia hosting. Si no lo es, detener la ampliación y revisar opciones gratuitas autorizadas antes de publicar. [Condiciones Hobby](https://vercel.com/docs/plans/hobby).

La ruta sostenible inicial es laboratorio/piloto controlado. Recuperación pública masiva por email no se declara resuelta con el SMTP predeterminado.

## 11. Pasos concretos para la primera prueba de login

**Todavía no ejecutar.** Se requieren la preparación local P0 y una autorización posterior acotada.

1. Aprobar implementar los flags de la sección 5 y sus pruebas sin red. Mantener global false durante ese desarrollo.
2. Verificar que las cinco huellas de migraciones siguen iguales y private no está expuesto. No aplicar SQL nuevo.
3. Aprobar una cuenta QA_AUTH_ONLY y el procedimiento administrativo de la sección 6, incluido el control de buzón. No aprobar perfiles/membresías implícitamente.
4. El operador crea esa única cuenta sin correo y guarda su UUID, sin insertar auth.users por SQL ni imprimir password/clave administrativa.
5. Comprobar que no hay perfil o membresía para ella y que no se han adjudicado roles.
6. Tras autorización expresa, activar Auth **solo localmente**. Correo, invitaciones y recuperación token_hash quedan false para esta primera prueba.
7. Reiniciar Next y abrir http://127.0.0.1:3000/login, fuera de la demo, usando el navegador del probador autorizado.
8. Introducir la contraseña única desde el gestor; no pegarla aquí ni registrarla en capturas.
9. Esperar autenticación correcta y selector sin acceso académico por ausencia de perfil/membresía. Dashboard/Admin de ambos slugs deben seguir cerrados.
10. Hacer logout, comprobar cookies y repetir navegación a rutas reales: requiere login. Probar también credenciales erróneas sin exponer detalles internos.
11. Registrar solo UUID/etiqueta, hora, rutas y resultados; no tokens/cookies/password.
12. Volver el flag local a false y reiniciar al acabar el ensayo. La cuenta queda identificada para revisión; no eliminarla o modificarla automáticamente sin alcance aprobado.

Solo después se solicita la etapa B, con DML exacto de perfiles, organizaciones y membresías y la interfaz MFA ya implementada. La primera prueba de Admin incluye denegación en aal1 y éxito en aal2.

## 12. Qué se verificó y qué no

Realizado: lectura del código y SDK instalados, modelo y constraints; consulta pública de documentación oficial; config diff remoto de solo lectura; inspección de presencia/forma de variables sin mostrar secretos; revisión de exclusión Git.

No realizado: prueba de entrega de correo, generateLink, createUser, signup, login real, cambio de password, enrollment o challenge remoto, aprovisionamiento SQL, seeds, migraciones o despliegue. No se ejecutó una nueva suite de pruebas por un cambio exclusivamente documental; los 75 casos de 5A siguen siendo evidencia histórica simulada.

Este plan no corrige todavía el código de recuperación ni implementa MFA. Los cambios locales P0/P1 deben validarse antes de habilitarlos, y cualquier operación remota requiere la autorización posterior indicada.
