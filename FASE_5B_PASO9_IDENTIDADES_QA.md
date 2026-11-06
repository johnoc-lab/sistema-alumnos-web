# Fase 5B — Paso 9: preparación de identidades QA

Fecha: **4 de noviembre de 2026**, America/Lima. Proyecto: SistemaAlumnos-Web. Rama comprobada: **feature/supabase-auth**. Proyecto previsto para cualquier actuación futura: **sistema-alumnos-dev**, organización johnoc-lab, Ref **rnxgrunnrdlgjsbsrjev**.

**Recomendación para este estado del proyecto:** sustituir las dos identidades QA por dos cuentas institucionales nuevas y dejar las anteriores sin perfiles, membresías o permisos académicos. Es una propuesta, no una autorización ni una operación realizada. Depende de comprobar primero que las cuentas antiguas continúan sin vínculos académicos.

Conservar los UUID mediante cambio administrativo también es válido, pero obliga a cerrar con más cuidado las sesiones y enlaces anteriores del mismo sujeto. Antes del primer aprovisionamiento, y sin datos académicos vinculados según los antecedentes, la sustitución reduce esa dependencia y no requiere un módulo nuevo.

**Alcance ejecutado ahora:** análisis de documentación, código local y fuentes oficiales; solo se creó este informe. No se consultó Cloud, ejecutó SQL/migraciones, modificó usuarios/UUID, leyó .env.local o secretos, implementó módulos ni cambió configuración, MFA, RLS o demo. No hubo commit, push o deploy.

## 1. Evidencia nueva y límites

El usuario comunicó una prueba manual satisfactoria en Supabase Cloud:

| Elemento               | Dato comunicado                                                                |
| ---------------------- | ------------------------------------------------------------------------------ |
| Identificador ensayado | u-000003@cuentas.sistema-alumnos.invalid                                       |
| Auth UUID              | 6d8c8f78-1d3b-43b5-8eb0-638e9d0cd8fa                                           |
| Resultado              | Creación y autenticación satisfactorias                                        |
| Cierre                 | El usuario cerró sesión, detuvo Next.js y restauró SUPABASE_AUTH_ENABLED=false |

Se registra como **evidencia manual comunicada por el usuario**, no como prueba automatizada o comprobación independiente del navegador por Codex. No se inventa la hora del ensayo ni se afirma que se inspeccionaron sesiones, logs o configuración Cloud.

Esta evidencia resuelve la incertidumbre básica del Paso 7 para el identificador y ensayo informados: el namespace se utilizó realmente para crear y autenticar una cuenta en el proyecto indicado por el usuario. No demuestra por sí sola cero envíos, bloqueo de recuperación/OTP, logout global, expiración de todos los tokens, permisos académicos, MFA o CRUD. Tampoco acredita el método exacto de confirmación administrativa, que deberá registrarse en una futura operación.

Se revisaron FASE_5B_PASO6_CUENTAS_INSTITUCIONALES.md y FASE_5B_PASO7_VALIDACION_IDENTIFICADORES.md. Se preservan como informes históricos; no se reescribe su resultado anterior ni se interpreta este ensayo como permiso para ejecutar el manifiesto/adaptador v1.

Identidades que permanecen intactas:

| Uso actual                         | Identificador                            | Auth UUID                            |
| ---------------------------------- | ---------------------------------------- | ------------------------------------ |
| Alumno QA anterior                 | john@correo.com                          | db59e5dd-1810-4627-bb45-4c7efc242a8c |
| Admin QA anterior                  | prueba@correo.com                        | 9eeeb988-f329-439d-b4b4-0f54cc1318d7 |
| Piloto de aceptación del namespace | u-000003@cuentas.sistema-alumnos.invalid | 6d8c8f78-1d3b-43b5-8eb0-638e9d0cd8fa |

La cuenta piloto no se reutilizará como alumno/Admin ni se retirará automáticamente. Los antecedentes de ausencia de perfiles/membresías no se refrescaron en Cloud en este paso.

## 2. Comparación de alternativas

| Criterio                     | A. Cambiar email conservando UUID                                                            | B. Crear dos sustitutas institucionales                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Operación principal          | Dos actualizaciones administrativas por UUID                                                 | Dos altas administrativas; UUID nuevos asignados por Auth                                                        |
| Cuentas existentes           | Se conserva su continuidad y se retira su email ajeno                                        | Se dejan intactas, sin vincularlas al sistema académico                                                          |
| Sesiones JWT antiguas        | Conservan el mismo sub; podrían adquirir acceso si después se vincula ese UUID               | Tienen sub antiguos y no corresponden a los perfiles que se crearían para los nuevos UUID                        |
| Refresh y enlaces anteriores | Se deben verificar revocación, invalidación y ventanas de validez antes de permisos          | No sirven como credenciales de los nuevos sujetos; el retiro de cuentas antiguas sigue siendo una tarea distinta |
| Credenciales                 | Puede conservarse la contraseña si el alcance no la cambia y su custodia es fiable           | Dos contraseñas individuales nuevas, entregadas privadamente                                                     |
| MFA                          | Los factores pertenecen al mismo UUID; no deben alterarse                                    | No copiar factores. El nuevo Admin necesitará su propio TOTP posteriormente                                      |
| Manifiesto QA                | Mantiene UUID Auth, pero igualmente debe corregir la semántica de verificación institucional | Necesita nueva adjudicación por UUID, que ya debe revisarse en el contrato futuro                                |
| Coste operativo              | Menos identidades, pero mayor comprobación de continuidad y tokens                           | Dos identidades más y registro de retiro pendiente, sin otro servicio o infraestructura                          |
| Mejor caso de uso            | Existen datos/vínculos que conviene conservar y se puede acreditar el cierre de tokens       | Todavía no hay vínculos académicos y se quiere evitar heredar sesiones de identificadores ajenos                 |

**Se recomienda B para estas dos cuentas de ensayo**, condicionado a confirmar ausencia de vínculos. El Paso 6 priorizaba A si podían cerrarse verificablemente sus condiciones; aquí se elige B porque no hay una continuidad académica que preservar según la información disponible y el manifiesto futuro aún necesita revisión. No se presume que las cuentas hayan sido comprometidas.

No crear sustitutas si la comprobación previa descubre perfiles, membresías, factores/identidades inesperados o un estado distinto al documentado: detenerse y revisar el alcance. No migrar vínculos, borrar datos o adoptar una cuenta existente por coincidencia de email.

En el escenario informado se pasaría de tres identidades Auth a cinco: dos sustitutas para preparar QA, dos anteriores sin permisos académicos y un piloto neutral. No se propone un servicio de pago. Antes de cualquier alta deberá confirmarse que se mantiene el plan gratuito y no se activa una función facturable.

**Sin membresías no significa Auth deshabilitado.** Una cuenta antigua podría seguir autenticándose, pero no deberá tener un perfil vinculado ni permisos académicos. Bloquearla o retirarla es otra operación Auth que necesita alcance/aprobación propios; no está incluida implícitamente en esta propuesta.

## 3. Sesiones, JWT y métodos administrativos

### Por qué parar Next.js o cambiar un email no basta

SUPABASE_AUTH_ENABLED=false y detener la aplicación cierran su uso desde ese entorno, pero no revocan sesiones del proveedor. Un logout de un dispositivo tampoco se asumirá global sin conocer su alcance.

Los access tokens ya emitidos pueden seguir siendo aceptados hasta su expiración. No asumir una duración por defecto ni proponer funciones de sesión de pago para resolver este ensayo. Conservar el mismo UUID y vincularlo después haría que esos tokens correspondieran al perfil nuevo; por eso A exige revocación de renovación más una ventana de expiración acreditada o un control de revocación efectivo. [Sesiones de Supabase](https://supabase.com/docs/guides/auth/sessions).

El SDK administrativo signOut requiere un **JWT válido de la sesión objetivo** y alcance; no es signOut(UUID). Cualquier uso futuro deberá manejarlo privadamente en memoria, sin solicitar copiar tokens a la conversación o registrarlos. No se debe afirmar que una llamada no realizada revocó algo. [Admin signOut](https://supabase.com/docs/reference/javascript/auth-admin-signout).

En B, los JWT/refresh/enlaces antiguos no son credenciales de las cuentas nuevas. Esto protege la futura vinculación solo si los perfiles se asignan exclusivamente a los nuevos UUID y los antiguos permanecen sin vínculos; no equivale a revocar los artefactos antiguos. No se rotarán claves JWT del proyecto para resolver dos cuentas QA.

### Método correcto si se eligiera A

El método documentado es auth.admin.updateUserById con el UUID exacto y únicamente los atributos aprobados: email institucional y, si procede, email_confirm=true como confirmación administrativa técnica. La API aplica cambios directamente, sin flujo de confirmación por correo. No usar updateUser del alumno, enlaces de cambio de email, invitaciones, recuperación o SQL sobre auth.users. [updateUserById](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid).

El código upstream actual limpia tokens pendientes al reasignar email; **no se comprobó que esa versión esté desplegada en este proyecto**. No prometer limpieza automática en Cloud ni leer hashes/tokens para verificarla. [Handler upstream de actualización](https://github.com/supabase/auth/blob/master/internal/api/admin.go).

A requeriría: revisar notificaciones antes del cambio; confirmar origen/custodia/factores; actualizar una cuenta por vez; verificar email/UUID/estado; cerrar sesiones de renovación con un mecanismo soportado; acreditar invalidación o expiración de enlaces de recuperación/confirmación/cambio y JWT previos; realizar login fresco; y mantener sin permisos hasta cerrar esos controles. Si no se puede acreditar, no forzar la continuidad ni conceder acceso. No se cambian contraseñas o factores como efecto lateral.

Esta ruta queda documentada para comparar; **no es la alternativa cuya aprobación se propone**.

## 4. Revisión de configuración necesaria, sin cambios

Estado actual no inspeccionado en Cloud. La siguiente tabla describe **qué debe revisar un operador antes de autorizar**, no resultados confirmados de configuración.

| Control                                                                               | Criterio esperado                                                                                                     |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Email/password                                                                        | Habilitado: apagar el proveedor para impedir correos también impediría el login                                       |
| Registro público y anónimo                                                            | Deshabilitados                                                                                                        |
| Confirm Email                                                                         | Conservar habilitado; confirmación administrativa individual documentada para cuentas institucionales                 |
| Secure Email Change                                                                   | Conservar habilitado; no habilitar cambios libres a un buzón externo                                                  |
| Recuperación/invitación Next.js                                                       | Los tres flags privados en false; no leer ni modificar .env.local en esta fase                                        |
| Recovery, OTP/magic link, invitación, reautenticación y cambio de email del proveedor | Revisar bloqueo efectivo/control soportado, no inferirlo de los flags de la aplicación                                |
| Notificaciones de seguridad                                                           | Revisar cuáles están habilitadas para contraseña/email/factores antes de operaciones que pudieran dispararlas         |
| SMTP y hooks                                                                          | Revisar configuración/mecanismo existente y evitar envíos/fallback inesperados; no contratar SMTP o activar servicios |
| Proveedores/vinculación de identidades                                                | Mantener cerrados los no utilizados y no fusionar por email                                                           |

La confirmación administrativa solo habilita técnicamente el identificador: no acredita buzón ni persona. El cambio seguro de email de usuario puede implicar mensajes a las direcciones actual y nueva; no usarlo para corregir una dirección ajena. Las notificaciones de seguridad se habilitan por configuración del proyecto. [Cambio seguro](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook), [notificaciones](https://supabase.com/docs/guides/auth/auth-email-templates).

Los controles locales encontrados cierran handlers de Next.js, pero no impiden una solicitud directa al servidor Auth. El namespace .invalid tampoco significa que los endpoints estén apagados. La ausencia de SMTP propio no desactiva por sí sola el correo predeterminado. Las limitaciones del correo gratuito no son una garantía permanente.

No se ha acreditado una configuración independiente que bloquee todos esos flujos conservando login. Si no existe un control suficiente, Send Email Hook es un candidato en Free que deberá revisarse/probarse por separado; sustituye el envío SMTP, pero hay que comprobar rechazo real, no fallback y compatibilidad con notificaciones/MFA. No implementarlo automáticamente como parte del cambio de cuentas. [Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks).

Distinguir dos alcances: crear cuentas institucionales sin invitaciones ni correo es una operación administrativa concreta; garantizar bloqueo global del proveedor exige controles verificados adicionales. El ensayo comunicado no resuelve la segunda cuestión. Si se exige esa garantía antes del siguiente paso y no se puede acreditar, detenerse y solicitar otra revisión, sin debilitar confirmación o MFA.

No ejecutar recuperación/OTP/cambio de email “para comprobar” contra buzones ajenos: esas pruebas pueden enviar mensajes o generar estado remoto. Requieren un entorno aislado/capturador o autorización específica; no son comprobaciones de solo lectura.

## 5. Procedimiento recomendado que requerirá aprobación posterior

### Propuesta exacta de sustitución

| Identidad futura propuesta               | Uso QA propuesto        | UUID futuro                             |
| ---------------------------------------- | ----------------------- | --------------------------------------- |
| u-000001@cuentas.sistema-alumnos.invalid | Sustituta del alumno QA | Lo asignará Supabase; no generado ahora |
| u-000002@cuentas.sistema-alumnos.invalid | Sustituta del Admin QA  | Lo asignará Supabase; no generado ahora |

Son propuestas pendientes de comprobar disponibilidad y aprobar. u-000003 y su UUID permanecen reservados al ensayo existente. Si u-000001 o u-000002 ya existen, **detenerse**, sin adoptarlos, fusionarlos o escoger otro número automáticamente.

Los roles de la tabla representan la intención académica, no un atributo que se enviará a Auth. Los nuevos UUID deberán adjudicarse expresamente a esos roles después del alta y antes de cualquier membresía. No se reutilizan las contraseñas de las cuentas anteriores.

### Secuencia futura, no ejecutada

1. **Verificar destino y precondiciones.** Operador central autorizado comprueba Ref rnxgrunnrdlgjsbsrjev, proyecto/organización correctos; estado de las tres identidades conocidas; ausencia de perfiles, membresías, activaciones o referencias académicas de los UUID antiguos; y ausencia de las dos direcciones propuestas. Revisar la configuración de la sección 4 sin envíos. Si hay discrepancia, detenerse.
   Las comprobaciones de vínculos de este preflight requieren un canal de lectura autorizado; no conceden permisos nuevos ni autorizan SQL de escritura o cambios de esquema.

2. **Cerrar la aprobación del alcance.** Registrar responsable, referencia/fecha de autorización, las dos direcciones y la intención student/admin; contraseña y claves fuera del registro. La aprobación no asigna roles académicos y no autoriza SQL.
3. **Alta administrativa de la sustituta de alumno.** Un operador utiliza la API oficial auth.admin.createUser en un contexto privado de TI, fuera de Next.js y navegador. Atributos mínimos: email de la primera fila, contraseña individual manejada privadamente y email_confirm=true. Omitir id, role y metadata de roles: Auth asignará un UUID nuevo y se mantendrá el rol ordinario authenticated. No usar signUp, inviteUserByEmail, generateLink o resetPasswordForEmail. [createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser).
4. **Verificar antes de continuar.** Leer solo UUID, email, confirmación técnica y estado de cuenta; registrar únicamente datos mínimos. El UUID debe ser nuevo y distinto de los tres existentes. No volcar la respuesta Admin completa ni credenciales. Un duplicado/error detiene el procedimiento sin adoptar o borrar usuarios.
5. **Alta administrativa de la sustituta de Admin.** Repetir exactamente el alcance anterior para la segunda fila, con contraseña distinta. No crear un rol Auth admin ni factores MFA.
6. **Prueba normal de cada nueva identidad.** Con cliente oficial de usuario, separado del cliente administrativo y de Next.js, realizar signInWithPassword y getUser; confirmar UUID/email y luego logout global de esas sesiones de prueba con alcance explícito. Credenciales/tokens solo en memoria privada; registrar éxito o error sanitizado, nunca secretos. No modificar el flag local para realizar estas llamadas. Si se desea probar mediante Next.js, esa activación local temporal requiere otro alcance y no está incluida aquí.
7. **Registrar adjudicación y cierre.** Asociar en el registro privado los nuevos UUID a las intenciones student/admin y evidencia institucional QA, con buzón no aplicable. Mantener todos los sujetos sin perfiles/membresías académicos. Registrar las cuentas viejas como “no utilizar para aprovisionamiento” en la documentación de operador, sin cambiar sus atributos Auth. u-000003 tampoco recibe permisos.
8. **Preparar después el lote académico.** Una revisión posterior actualizará el manifiesto/contrato con los UUID nuevos y sus referencias. El adaptador/manifiesto v1 conserva UUID antiguos y no debe ejecutarse. La creación Auth no autoriza ese lote, cambios RLS o MFA. El nuevo Admin solo podrá acceder al Panel después de la vinculación válida y su TOTP real aal2.

No se crea ahora una herramienta, script operativo o módulo para ejecutar la secuencia. Antes de usar una consola administrativa del Dashboard en vez del SDK, el operador deberá confirmar que ofrece exactamente alta con contraseña y confirmación individual sin invitación; no sustituirla por “enviar invitación”.

### Fallo parcial

Las dos altas Auth no son una sola transacción. Si se crea la primera y falla la segunda, registrar el UUID creado y el punto de fallo; detenerse. No borrar, reintentar a ciegas, adoptar otra cuenta o modificar la primera para aparentar rollback. Una repetición deberá empezar por la evidencia y una lectura por UUID/dirección que confirme qué operación ya tuvo éxito.

Este permiso futuro solo comprendería dos altas, sus lecturas de comprobación Auth/vínculos y dos pruebas de login/cierre. No incluye contraseñas de cuentas previas, bloqueos/borrados, confirmaciones de las anteriores, enrolamiento/eliminación de factores, limpieza de la cuenta piloto o correos de recuperación.

## 6. Comprobaciones breves

### Antes de autorizar la ejecución

- [ ] Destino exacto y operador central; política de correo revisada, sin enviar pruebas.
- [ ] Identidades antiguas/piloto identificadas por UUID y estado; ausencia de vínculos académicos confirmada con lectura autorizada.
- [ ] u-000001 y u-000002 disponibles; no se presupone su ausencia.
- [ ] Origen/custodia, responsable QA y alcance de dos altas acordados; sin secretos en evidencia.
- [ ] Registro público/anónimo, recuperación/invitaciones y requisitos de confirmación/MFA conservados.

### Después de una ejecución autorizada

- [ ] Exactamente dos altas atribuibles al lote, UUID nuevos/distintos, emails exactos, confirmación administrativa y rol Auth ordinario.
- [ ] Login/getUser/logout de cada sustituta documentados, sin afirmar revocación instantánea de JWT por el logout.
- [ ] Ningún perfil, membresía, organización QA, rol académico o factor creado por estas operaciones.
- [ ] Tres UUID preexistentes y sus atributos/factores sin modificaciones dentro del alcance.
- [ ] Registro privado de resultados y fallos parciales; nuevos UUID adjudicados para revisión del futuro manifiesto.
- [ ] Sin evidencia de envíos inesperados en el alcance observado; si no se revisaron logs, declararlo pendiente, no afirmar cero envíos.

Verificar ausencia de perfiles o email disponible no autoriza escritura académica ni confirma un buzón. La referencia histórica del Paso 5 no sustituye la comprobación inmediata.

## 7. Alcance de la aprobación pendiente y cierre

La futura aprobación concreta propuesta sería: **crear en rnxgrunnrdlgjsbsrjev exactamente las dos identidades institucionales de la sección 5, confirmarlas administrativamente, verificar sus datos mínimos, probar/cerrar sus sesiones normales y registrar los UUID devueltos, sin asignar permisos académicos ni modificar las tres identidades preexistentes**.

No quedan autorizados: SQL de escritura/migraciones/seed, cambios de configuración Auth, hook/SMTP, usuarios adicionales, transferencia de vínculos, bloqueo/eliminación de cuentas viejas, rotación de contraseñas previas, MFA, claves JWT, .env.local, Next.js, Vercel, GitHub, Apps Script, commit, push o deploy. Cualquier requisito detectado fuera de ese alcance debe resolverse y aprobarse aparte.

**Realizado en este paso:** revisión local y de documentación oficial, incorporación de la evidencia manual comunicada y este procedimiento. No se ejecutaron tests o build porque no se cambió código; no se verificó el estado remoto ni se creó una cuenta. Se conserva presupuesto y alcance de análisis.

**Estado final:** namespace con ensayo Cloud satisfactorio comunicado por el usuario; sustitución de las dos identidades QA recomendada, condicionada al preflight y aprobación posterior. No se ha corregido, creado o retirado ninguna identidad. Se detiene el trabajo al terminar este informe.
