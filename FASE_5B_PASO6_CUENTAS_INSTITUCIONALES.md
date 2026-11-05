# Fase 5B — Paso 6: cuentas institucionales sin buzón

Fecha: **4 de noviembre de 2026**, America/Lima. Proyecto: SistemaAlumnos-Web. Rama: **feature/supabase-auth**. Destino previsto: sistema-alumnos-dev, Project Ref rnxgrunnrdlgjsbsrjev, organización de infraestructura johnoc-lab. Presupuesto: S/ 0.

**Conclusión:** el modelo institucional es compatible con las capacidades administrativas de Supabase Auth. La confirmación técnica del proveedor debe distinguirse de la verificación institucional de una persona y de la titularidad de un buzón. No se recomienda eliminar las comprobaciones actuales de confirmación, MFA o pertenencia.

Se propone un namespace reservado sin correo entregable, verificación institucional explícita y bloqueo de los flujos de correo también en el proveedor. Las identidades QA no deben recibir permisos conservando sus direcciones actuales bajo correo.com. **Se recomienda conservar sus UUID solo si se corrigen sus identificadores y se cierran las condiciones de seguridad de este informe.**

Este paso comprende análisis, documentación y **12 comprobaciones desechables locales aprobadas**. El único archivo nuevo es este informe. No se consultó ni escribió Supabase Cloud; su estado se toma del usuario y de las lecturas históricas del Paso 5. No se ejecutó el adaptador QA, seed, envío de mensajes o cambio de usuarios/factores. No se leyó .env.local ni se cambiaron código, migraciones o infraestructura. No hubo commit, push o deploy.

## 1. Decisión actual y alcance de la evidencia

Se revisaron los informes de los Pasos 2, 3, 4 y 5, las cinco migraciones, los guiones local/Cloud, su preparador y las guardas Auth/MFA de Next.js.

Los pasos anteriores asumían un contacto cuyo buzón debía comprobarse. La decisión aprobada sustituye esa premisa para cuentas institucionales sin buzón. **No corresponde buscar ni inventar una prueba de titularidad de john@correo.com o prueba@correo.com.** El usuario aclaró que solo eran identificadores de prueba y que no controla esos buzones.

Desaparece la obligación funcional de tener buzón; permanecen la adjudicación por UUID, el control de credenciales, la verificación institucional y la aprobación de roles. Los informes anteriores conservan su valor histórico; su manifiesto y adaptador v1 no quedan aprobados por esta decisión.

| Concepto                   | Qué acredita                                                                                                                                                | Qué no acredita                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Creación administrativa    | Un operador autorizado creó/habilitó una cuenta y existe un UUID Auth.                                                                                      | Persona usuaria, control de contraseña o buzón.                                    |
| Control de credenciales    | El destinatario aprobado pudo autenticarse; un Admin deberá verificar TOTP para obtener aal2.                                                               | Identidad de la persona, rol o pertenencia a todas las organizaciones.             |
| Verificación institucional | Un responsable cotejó a la persona con un registro institucional/procedimiento presencial y adjudicó el UUID, registrando método, fecha y evidencia mínima. | Recepción de correo. Tampoco concede automáticamente una membresía.                |
| Titularidad de buzón       | Se demostró control de un canal de correo real mediante un proceso específico.                                                                              | Permisos académicos. En cuentas sin buzón es **no aplicable**, nunca “verificado”. |

Para QA basta documentar la **asignación de una cuenta sintética a un probador autorizado**. No afirmar que se verificó a una persona real llamada John o Prueba ni recoger documentos de una persona ficticia. Responsable y probador pueden coincidir en un ensayo controlado, dejando constancia.

Los logins anteriores son éxitos comunicados por el usuario. Sin fecha y referencia acreditadas no se convertirán en una verificación institucional fechada o en observación independiente de Codex.

## 2. Auditoría del contrato actual

| Capa                                 | Requisito encontrado                                                                                                                          | Consecuencia                                                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Formulario y POST /auth/login        | Campo email, formato básico y signInWithPassword, separado del envío de correos.                                                              | No exige Gmail ni comprueba MX. Conviene explicar “correo de acceso asignado”.                                                              |
| src/lib/auth/resolve.ts              | getUser/getClaims coherentes, no anonimato y email_confirmed_at presente; luego perfil, membresía y organización activos.                     | Comprueba estado técnico, no el método de confirmación o titularidad del buzón.                                                             |
| src/lib/auth/mfa-handlers.server.ts  | Tras verify exige identidad coherente, email_confirmed_at, claims frescos aal2 y pertenencia vigente.                                         | Compatible con confirmación administrativa documentada; conservar la guarda.                                                                |
| Flags de recuperación/invitación     | Cierran handlers/rutas de Next.js antes de sus operaciones desactivadas.                                                                      | No son una configuración del servidor Auth remoto.                                                                                          |
| private.identity_activation_requests | proposed_verified_contact es text NOT NULL; linked requiere auth_user_id, verified_at y linked_at.                                            | No existe columna verified_contact en PostgreSQL: ese nombre pertenece al manifiesto. No hay método/responsable de verificación explícitos. |
| activation_profile_match             | linked exige perfil activo con el mismo Auth UUID.                                                                                            | No comprueba buzón, formato, estado Auth o evidencia institucional. Conservarlo.                                                            |
| Guion/adaptador v1                   | verified_contact obligatorio, formato correo y fecha no futura; Cloud lo compara con Auth.email y exige confirmación/no bloqueo/no anonimato. | Acopla identificador de login y contacto verificado; necesita versión nueva.                                                                |
| Preparador v1                        | Conserva mailbox_ownership pendiente y exige contactos/fechas/hash nulos en preparación.                                                      | No se adapta completando una fecha ficticia o cambiando un booleano.                                                                        |

**Confirmado:** la base no impone titularidad de buzón. El ensayo local aceptó linked con texto sin formato de correo, manteniendo FKs, fechas y vínculo con perfil. Esto describe el contrato de operador; no demuestra que un usuario ordinario pueda escribir activaciones privadas.

supabase/config.toml contiene configuración **local**, incluidas confirmaciones y enrollment TOTP desactivados en ese entorno. No describe necesariamente Cloud ni debe copiarse para “sincronizarlo”. El usuario informó confirmación habilitada en Cloud; no se consultó su configuración actual en este paso.

## 3. Modelo e identificadores recomendados

Mantener **Auth UUID → un perfil global → membresías por organización → matrículas**. El identificador asignado sirve para login; no es contacto personal, factor adicional o criterio de tenant.

Sin asumir dominio propio, se propone aprobar **cuentas.sistema-alumnos.invalid**. Ejemplos ilustrativos: u-000001@cuentas.sistema-alumnos.invalid y u-000002@cuentas.sistema-alumnos.invalid. No se han asignado ni creado.

.invalid y sus subdominios son nombres reservados que no deben resolver en DNS público. Permiten evitar direcciones adjudicables a terceros sin comprar dominio/buzones. Se usarían como identificadores internos, sin mensajería ni pretensión de ser contactos reales. [RFC 6761, sección 6.4](https://www.rfc-editor.org/rfc/rfc6761.html#section-6.4).

Política propuesta:

- ASCII, minúsculas, sin espacios y hasta 254 caracteres, conforme al handler actual. Normalización única del identificador; no normalizar contraseñas.
- Código interno estable, no reciclable y sin DNI, teléfono, nacimiento o nombre completo. No es secreto: conservar límites de intentos, errores genéricos y MFA.
- Namespace global: una persona no recibe otra cuenta por entrar a Incubadora. No deducir organización o rol del identificador.
- No usar dominios ajenos, nombres institucionales supuestos bajo TLD comerciales o correos personales no controlados. La falta actual de MX no acredita control ni evita cambios futuros.
- organization_memberships.contact_email puede permanecer NULL. No copiar el identificador no entregable como contacto de negocio.
- Cambios de identificador solo por procedimiento administrativo aprobado. No habilitar edición libre de email, fusión por email o proveedores sociales para resolver esta necesidad.

**Pendiente de validación específica:** el código upstream consultado de Supabase valida formato y normaliza el email; esa función no consulta MX. Respalda la propuesta, pero no prueba que la versión/configuración Cloud acepte el namespace. Validarlo en Auth aislado o en un piloto remoto expresamente autorizado; si falla, detenerse y revisar, sin recurrir a un dominio ajeno. [Validador de Supabase Auth](https://github.com/supabase/auth/blob/master/internal/api/mail.go).

### Una identidad en ambas organizaciones

| Misma identidad y perfil     | Impulso                             | Incubadora                                    |
| ---------------------------- | ----------------------------------- | --------------------------------------------- |
| Membresía aprobada           | admin/active                        | student/active                                |
| Sesión aal1                  | Panel/RPC administrativas denegados | Acceso de alumno según membresía y matrículas |
| Sesión aal2 tras TOTP propio | Administración dentro de Impulso    | Continúa siendo alumno de Incubadora          |

El esquema ya lo admite: profiles.auth_user_id es UNIQUE y existe UNIQUE(organization_id,profile_id) en membresías. Suspender una membresía afecta esa organización; bloquear perfil/identidad afecta a ambas. El TOTP/aal2 es de la identidad, sin conceder un rol global.

El guion QA rechaza identidades ya vinculadas para proteger el **alta inicial**. Esa guarda no limita el modelo a una organización. Añadir otra membresía necesitará una operación distinta con reutilización explícita del perfil por UUID; no quitar genéricamente la guarda de colisiones del lote inicial.

## 4. Supabase Auth sin SMTP y controles del proveedor

El alta administrativa admite email_confirm=true. La propuesta es utilizarla exclusivamente desde un canal privado de operador para cuentas institucionales aprobadas, conservando Confirm Email habilitado y registro público/anónimo deshabilitados. Ese estado significará **confirmación administrativa del identificador**, no recepción de mensajes ni propiedad de buzón. No escribir auth.users por SQL ni exponer claves administrativas en Next.js o navegador. [createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [configuración general](https://supabase.com/docs/guides/auth/general-configuration).

No hace falta quitar email_confirmed_at de resolveSession o MFA. El acceso académico seguirá requiriendo estados y vínculos aprobados. El rol ordinario Auth será authenticated; admin académico se asigna en membresía, nunca como rol del token o metadata editable por el usuario.

Los consumidores futuros de Impulso/Incubadora tampoco deberán interpretar un eventual claim email_verified del proveedor como prueba de buzón para estas cuentas. La autorización y la adjudicación institucional se resolverán por UUID, perfil y membresía; cualquier intercambio futuro deberá documentar esta semántica. No se implementa SSO ni se cambian claims en este paso.

### La interfaz cerrada no desactiva la API Auth

Conservar AUTH_EMAIL_RECOVERY_ENABLED, AUTH_TOKEN_HASH_RECOVERY_ENABLED y AUTH_INVITATION_ACCEPT_ENABLED en false, sin activar Auth automáticamente. La API del proveedor puede recibir recuperación directamente fuera de Next.js. CORS, CSRF de la aplicación, botones ocultos o registro público deshabilitado no prueban el bloqueo de esa operación. No se intentó enviar la solicitud. [Recuperación en Supabase Auth](https://github.com/supabase/auth/blob/master/internal/api/recover.go).

Se recomienda desarrollar/revisar posteriormente un **Send Email Hook de denegación**, preferiblemente una función PostgreSQL pequeña sin dependencias externas. La documentación incluye Send Email en Free y admite hooks SQL con permisos limitados para supabase_auth_admin. No requiere SMTP o un servicio de pago; disponibilidad y configuración efectiva en este proyecto quedan pendientes. [Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks).

Contrato propuesto, todavía sin implementar:

1. Rechazar recuperación, magic link/OTP, invitación, reautenticación por correo y cambio de email para este modelo; nunca reenviar o registrar tokens del payload. No responder éxito genérico que aparente un envío. Rechazar tipos de autenticación desconocidos.
2. Probar contra Auth aislado la propagación del rechazo y ausencia de fallback a SMTP, además de los handlers Next.js.
3. Revisar notificaciones de seguridad por contraseña/email/MFA. Un bloqueo indiscriminado podría abortar operaciones legítimas si el proveedor las integra en ellas. Deshabilitar o tratar explícitamente su no envío según política revisada, sin afectar enrollment/verify TOTP. No prometer éxito sin esa prueba.
4. Mantener Confirm Email y Secure Email Change habilitados como defensa adicional. El cambio seguro requiere confirmación en dirección actual y nueva cuando está habilitado. No apagar el proveedor email/password para intentar desactivar solo recuperación. [Send Email Hook y cambio seguro](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook).
5. Preferir función sin lecturas de tablas, sin SECURITY DEFINER y con EXECUTE solo para supabase_auth_admin; sin permisos generales sobre private. Revisar/versionar la función en migración nueva y autorizar por separado el enlace del hook en Cloud.

.invalid evita un destinatario público válido, pero **no demuestra que un endpoint esté apagado o que nunca se intente un envío**. El hook tampoco existe todavía. No utilizar las restricciones transitorias del correo gratuito como barrera de seguridad, ni presentar un proxy Next.js como bloqueo de una API Auth pública.

## 5. Cambios de esquema frente a configuración/lógica

El login institucional es técnicamente posible sin cambiar las cinco migraciones. Para representarlo inequívocamente se recomienda una evolución pequeña mediante **migración nueva**, antes del primer lote.

Extender private.identity_activation_requests, sin duplicar el directorio de usuarios:

| Campo propuesto                      | Semántica                                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| verification_kind                    | institutional_assignment, mailbox_control o legacy_unspecified; nunca inferirlo de email_confirmed_at.          |
| login_identifier                     | Identificador asignado normalizado, separado de contactos y cotejado con Auth UUID/email por el adaptador.      |
| verified_by_ref                      | Responsable institucional/operador comprobable; sin fingir una membresía previa durante bootstrap.              |
| verification_evidence_ref            | Referencia privada a comprobación de persona/asignación QA, sin credenciales o documentos personales completos. |
| verified_at, existente               | Fecha real del método declarado; institucional significa adjudicación de persona/cuenta, nunca prueba de buzón. |
| proposed_verified_contact, existente | Permitir NULL mediante migración y exigirlo NULL en modalidad sin buzón; reglas específicas para contacto real. |
| mailbox_verified_at                  | NULL en institucional; fecha real solo si existe una prueba específica de buzón.                                |

Para verified/linked institucional se exigirán identificador, responsable, evidencia y verified_at reales, con contacto/mailbox_verified_at nulos. Conservar PK/FKs, idempotency_key, perfil activo/UUID coincidente para linked, linked_at obligatorio y cronología válida. El adaptador mantendrá las comprobaciones de estado Auth.

Actualizar el validador de activación para rechazar nuevas transiciones verificadas/enlazadas sin método/evidencia. No basta relajar NOT NULL. Filas históricas no se convertirán automáticamente en institucionales o buzones verificados: legacy_unspecified preserva historia, pero no sirve para nuevas vinculaciones aprobadas. Revisar compatibilidad y datos reales antes de aplicar.

No se recomienda rellenar proposed_verified_contact con correo ficticio y declarar en una nota que ahora significa otra cosa. Aunque el SQL lo permita, conserva la ambigüedad del adaptador v1.

| Cambio                                                                          | Intervención futura necesaria                                            |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Crear/habilitar cuenta y confirmar administrativamente                          | Auth Admin API/Dashboard autorizado; no SQL directo sobre Auth           |
| Corregir identificadores QA y gestionar sesiones                                | Operación administrativa separada del lote académico                     |
| Confirm Email, Secure Email Change, proveedores/notificaciones, enlace del hook | Configuración Auth autorizada posteriormente                             |
| Método, evidencia, contacto nullable por modalidad y trigger                    | Migración nueva de aplicación, sin editar las cinco aplicadas            |
| Función SQL del hook y grants mínimos                                           | Migración nueva revisada, sin grants amplios                             |
| Textos, manifiesto v2, preparador/adaptador/postcheck y pruebas                 | Desarrollo local posterior                                               |
| Un perfil en ambas organizaciones                                               | Ya soportado; segunda membresía requiere operación aprobada              |
| Recuperación administrativa persistente                                         | Revisión posterior; posiblemente nueva tabla/RPC, no implementarla ahora |

Conservar las políticas RLS, org_admin/aal2, aislamiento, grants académicos, protección del último administrador y las cinco migraciones. No crear triggers sobre tablas administradas Auth ni cambiar propietarios.

## 6. Manifiesto y adaptador v2

Preservar approval.pending.json v1 como evidencia, sin completarlo, ejecutarlo o marcar buzones ficticios verificados. Preparar después una versión v2 que distinga:

- account_model=institutional_managed_no_mailbox y versión de política de identificadores.
- Auth UUID, login_identifier y rol académico explícitos; UUID de perfil, organización y membresía independientes.
- identity_check con método, responsable, referencia y fecha real. Para QA: asignación sintética a probador autorizado.
- login_control con fuente/resultado, responsable y fecha acreditada. Mantener los logins anteriores como reported_by_user, sin inventar otra observación.
- mailbox con estado not_applicable, contacto y fecha de titularidad nulos.
- Confirmación técnica Auth con método administrativo documentado o método todavía desconocido; no reutilizar email_confirmed_at como verificación personal.
- Operador/aprobación, contrato de esquema, destino externo, SHA del SQL y hash canónico final del payload.

Vincular las referencias de evidencia a la aprobación, no solo a un texto modificable fuera del envelope. Auditoría guardará hashes/referencias, sin volcar el manifiesto ni secretos; conservar no_secret_keys.

Se recomienda una nueva operación v2 con trazabilidad a la pendiente anterior. UUID de recursos nunca escritos podrán conservarse tras comprobar su ausencia y aprobarlo; no regenerarlos para eludir colisiones. Si se sustituyen UUID Auth se revisa toda adjudicación. Los roles elegidos por el usuario permanecen explícitos.

El nuevo adaptador exigirá v2/contrato nuevo, comparará Auth.email con login_identifier y verificará evidencia institucional/ausencia de contacto. Conservará estado Auth, confirmación técnica, SERIALIZABLE, row_version/CAS, orden, triggers, auditoría e idempotencia. Actualizar el postcheck sin presentarlo como prueba de sesión/MFA.

No basta renombrar verified_contact en una sustitución de cadenas del generador. Regenerar/revisar firmas de filas según el esquema nuevo. Las limitaciones PG18.6 frente a Cloud 17.11 y la revisión del canal del Paso 5 siguen pendientes.

## 7. Impacto y recomendación sobre las cuentas QA

| Cuenta actual     | Auth UUID                            | Rol elegido, sin asignar aún |
| ----------------- | ------------------------------------ | ---------------------------- |
| john@correo.com   | db59e5dd-1810-4627-bb45-4c7efc242a8c | student                      |
| prueba@correo.com | 9eeeb988-f329-439d-b4b4-0f54cc1318d7 | admin                        |

**No aprovisionarlas sin corregir sus identificadores.** Un destinatario real o futuro del dominio ajeno podría recibir recuperación/OTP si el proveedor lo permitiera. Es un riesgo potencial condicionado; no se observó envío o intrusión.

**Recomendación:** conservar los UUID mediante corrección administrativa del identificador y nueva validación antes de perfiles/membresías. Evita duplicar identidades y mantiene la selección de roles. Requiere autorización de operaciones Auth, distinta del permiso SQL.

Condiciones:

1. Aprobar/validar namespace y revisar el bloqueo de correo antes del cambio, incluyendo notificaciones a la dirección antigua.
2. Acreditar origen, custodia y probador de cada cuenta. Revisar estado, identidades vinculadas y factores por datos mínimos; no asumir ausencia de factores porque no se probaron.
3. Cambiar identificador mediante API/Dashboard de operador, manteniendo UUID. Cualquier confirmación administrativa/rotación de contraseña tendrá alcance aprobado; no escribir tablas Auth o fingir un buzón.
4. Revisar enlaces pendientes y revocar las sesiones de renovación anteriores. No asumir que cambiar email/contraseña invalida automáticamente todos los artefactos de la versión Cloud.
5. Resolver JWT antiguos **antes de conceder acceso académico**. El cierre de sesión no garantiza inutilizar inmediatamente un JWT emitido. Si se conserva UUID, esperar la ventana máxima acreditada de validez previa tras revocación o verificar un control efectivo de revocación; no asumir un plazo por defecto. [Sesiones de Supabase](https://supabase.com/docs/guides/auth/sessions).
6. Repetir login manual autorizado con identificador corregido y registrar resultado. No eliminar TOTP ni bajar aal2. Revalidar vínculos/colisiones y emitir manifiesto v2.

**Sustituirlas por identidades nuevas** si no se acredita origen/control, existen identidades/factores inesperados o no puede cerrarse verificablemente la exposición de sesiones/enlaces. Los UUID antiguos no se vincularán. Creación de sustitutas y eventual bloqueo/retirada de las anteriores requieren permiso específico, sin borrado automático. Los nuevos UUID necesitarían adjudicación explícita conservando los roles elegidos.

No se eligieron identificadores finales ni se alteraron cuentas, contraseñas, confirmaciones, factores o manifiesto privado en este paso.

## 8. Diseño futuro de alta y recuperación

### Alta sencilla para 10–50 personas

1. Un responsable verifica a la persona y solicita acceso; operador central aprueba UUID/identificador y roles por organización. Bootstrap inicial documentado como operación de infraestructura autorizada, sin inventar Admin académico previo.
2. Alta por Dashboard o herramienta privada de TI: contraseña individual fuerte, sin hashes antiguos, claves compartidas o listas en Sheets/Git. Confirmación administrativa individual con referencia; registro público/anónimo y correo cerrados.
3. Establecimiento/entrega por canal privado al destinatario, registrando entrega sin guardar secreto. No llamar “de un solo uso” o con caducidad a una contraseña sin mecanismo que lo imponga. Un cambio autenticado de contraseña necesita revisión propia, sin habilitar los formularios de recuperación existentes para reutilizarlos.
4. Prueba de credenciales y manifiesto revisado por UUID/evidencia; luego autorización del lote SQL institucional. Organización inicialmente suspendida y orden de administrador válido conservados.
5. Perfil/membresía activos para acceso académico. Admin aal1 puede configurar TOTP propio en /auth/mfa; Panel/RPC denegados hasta claims reales aal2. El operador no enrola factores para otros usuarios.
6. Segunda organización mediante membresía aprobada del perfil existente, sin recrear Auth o fusionar por email.

Auth Admin API y PostgreSQL **no comparten una transacción atómica**. Si se crea Auth y falla el lote SQL, la identidad queda sin vínculo/acceso académico; registrar y revisar manualmente, sin borrar usuarios o adoptar perfiles para “compensar”.

### Recuperación administrativa: solo diseño

Flujo futuro: caso de solicitud → comprobación institucional → cotejo de UUID/alcance → autorización central → cambio por API administrativa → revocación/revisión de sesiones → entrega privada → verificación y auditoría de resultado. No implementar endpoint, botón o RPC ahora.

La credencial es **global**. Un Admin de Impulso no recibe por su membresía facultad para restablecer la identidad de una persona con acceso a Incubadora. Requiere responsable central del ciclo de vida de esa identidad; el panel de una organización solo podría solicitarlo. Tener aal2 tampoco otorga por sí solo autoridad Auth global.

Recuperar contraseña no cambia roles/membresías ni elimina TOTP. Pérdida de factor requiere procedimiento separado con revisión reforzada/responsable alterno; nunca acceso al Panel con aal1 como emergencia. Designar un responsable institucional para el caso de pérdida de acceso del encargado de TI.

Auditar intención, autorización y resultados parciales sin contraseñas, códigos o tokens. Si Auth tiene éxito y falla la auditoría posterior, no afirmar que un ROLLBACK SQL revirtió la contraseña: registrar el caso pendiente y conciliar.

## 9. Pruebas realizadas, límites y riesgos

Se creó **PGlite 18.6 en memoria** con copias de las cinco migraciones y sustitutos Auth/Storage. No se usaron seed, adaptador QA o red. Las anclas Auth fueron UUID aleatorios distintos de los reales, sin contraseñas, usuarios Supabase o sesiones. Se revirtió la transacción de datos y se cerró el motor.

| Comprobación ejecutada                                                             | Resultado                                                                             |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Cinco migraciones y tablas de negocio vacías, sin seed/adaptador                   | Aprobada                                                                              |
| linked con contacto sin formato correo                                             | Aceptado: confirma la semántica SQL limitada                                          |
| Enlace con email_confirmed_at NULL en Auth sustituto                               | Aceptado por SQL: comprobación hoy en adaptador/servidor                              |
| Contacto NULL                                                                      | Rechazado, 23502                                                                      |
| linked sin verified_at                                                             | Rechazado, 23514                                                                      |
| Auth UUID diferente al del perfil                                                  | Rechazado, 23514                                                                      |
| Perfil pending al enlazar                                                          | Rechazado, 23514                                                                      |
| Duplicar perfil/membresía en la misma organización                                 | Rechazado, 23505                                                                      |
| Mismo perfil admin en QA A/student en QA B, ambas activas con administrador válido | Aprobada                                                                              |
| authenticated con claims simulados aal1                                            | Solo dos membresías propias, sin ampliación administrativa                            |
| Claims simulados aal2                                                              | Acceso administrativo en QA A, sin acceso administrativo a la membresía ajena de QA B |
| INSERT académico en QA B como student aunque aal2                                  | Rechazado, 42501                                                                      |

**12/12 aprobadas.** Claims locales simulados no acreditan firmas JWT, sesiones, login o MFA reales. No prueban el adaptador v2 —inexistente— ni PostgreSQL 17 nativo. Tests/build de Next.js y 22+41 pruebas del Paso 5 son antecedentes; no se repitieron porque no se cambió código funcional.

| Riesgo o incertidumbre                              | Clasificación y control                                                                               |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Buzón ajeno y recuperación hacia tercero            | Potencial alto; corregir identificadores antes de permisos y revisar bloqueo en proveedor             |
| Flags Next.js confundidos con bloqueo global        | Alcance confirmado en código; revisar endpoints Auth y hook, sin enviar correos aquí                  |
| Confundir confirmación/credenciales/persona/buzón   | Ambigüedad confirmada; contrato institucional v2 y evidencia por separado                             |
| Recuperación global desde un Admin orgánico         | Riesgo de diseño alto; operador central con mandato sobre la identidad                                |
| JWT anteriores conservando UUID                     | Pendiente de cierre; revocación/expiración acreditadas antes de acceso                                |
| Cambios de contrato o hook que rompan MFA           | Pendiente de pruebas locales y revisión; conservar aal2 y verificar notificaciones                    |
| Namespace o hook rechazados por Cloud/configuración | Compatibilidad por validar; no afirmar aprobación remota                                              |
| Persona sin buzón ni recuperación implementada      | Limitación funcional: soporte institucional manual planificado; no prometer autoservicio o eludir MFA |

Pruebas futuras: namespace ante Auth aislado; alta administrativa sin envío; recuperación/OTP/cambio de email directos y no fallback del hook; notificaciones y MFA; migración con filas legacy y modalidad institucional; evidencia incompleta/falsa; idempotencia/rollback/auditoría v2; sesiones normales en dos organizaciones; JWT previos a corrección de identificador. Recuperación administrativa y pérdida TOTP se probarán solo cuando se revisen/implementen.

## 10. Impacto en archivos y plan mínimo

| Área/archivo                                                                     | Cambio futuro propuesto, no ejecutado                                                                             |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| supabase/migrations/nueva_migracion.sql, nombre por definir                      | Campos/reglas/validador institucional; función de hook y grants mínimos revisados. No editar las cinco aplicadas. |
| supabase/config.toml                                                             | Entorno local para pruebas Auth/hook, sin trasladar defaults a Cloud                                              |
| supabase/qa/approval.template.json y artefactos v1                               | Conservar historia y preparar plantilla v2 separada                                                               |
| scripts/database/prepare-qa-cloud.mjs y supabase/qa/cloud/provision-qa-cloud.sql | Contrato versionado, generación, guardas y hashes nuevos                                                          |
| supabase/qa/cloud/state-readonly.sql y postcheck-qa-cloud.sql                    | Método, identificador y referencias mínimos; sin secretos                                                         |
| Tests de aprovisionamiento/preparador y Auth/MFA                                 | Casos institucionales, rechazo de v1/incompletos, mantener aislamiento/aal2                                       |
| src/features/auth/components/auth-form.tsx y textos                              | Explicar identificador sin buzón, manteniendo type=email, POST y CSRF                                             |
| src/lib/auth/resolve.ts y mfa-handlers.server.ts                                 | Documentar confirmación técnica y regresiones, sin quitar verificaciones SDK/MFA                                  |
| src/types/database.generated.ts                                                  | Regenerar solo si cambia superficie pública tipada; no exponer private para obtener tipos                         |
| Documentación de modelo/autenticación/aprovisionamiento                          | Referenciar la decisión nueva, preservando resultados históricos                                                  |

No modificar las políticas RLS, authorization/access.ts o la demo para resolver este cambio. No introducir claves administrativas en Next.js.

La política institucional y los roles QA ya están aprobados. Quedan estas decisiones/alcances operativos para autorización posterior:

- Namespace final, método/responsable de adjudicación y tratamiento de las identidades existentes.
- Desarrollo local de migración/contrato v2 y hook; después, autorización separada para DDL y configuración Auth remotos.
- Corrección de cuentas/sesiones y cualquier contraseña/confirmación/factor: alcance Auth explícito, nunca implícito en permiso SQL.
- Aprovisionamiento v2 con envelope/hash/SQL cerrados: una organización QA, dos perfiles, dos membresías y dos activaciones, más auditoría.
- Enrollment/challenge reales y recuperación administrativa: revisiones posteriores independientes; ninguna reducción de aal2.

**Siguiente paso mínimo:** aprobar la especificación v2 y el tratamiento propuesto de QA; después, bajo nueva instrucción, implementar/probar solo localmente la pequeña migración institucional, propuesta de hook y adaptador v2, sin seed/usuarios reales y con validación PG17 nativa cuando esté disponible. Revisar resultados y canal; separar autorización de esquema/configuración, corrección de cuentas y DML académico. Repetir las lecturas de destino/historial/colisiones inmediatamente antes de cada futura operación.

Corregir y probar las identidades y cerrar las sesiones anteriores **antes** de solicitar el lote académico. No añadir aún panel de altas, SSO, importación o recuperación administrativa para resolver el primer QA de 10–50 usuarios.

**Cierre:** la titularidad de buzón deja de ser requisito para este modelo; debe sustituirse por adjudicación institucional y control de acceso explícitos. Las cuentas QA permanecen sin perfiles/membresías según el usuario y el Paso 5, sin nueva verificación Cloud en esta fase. Ningún cambio remoto queda autorizado por este análisis. Se detiene el trabajo al terminar la documentación.
