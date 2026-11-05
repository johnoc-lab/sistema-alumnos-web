# Fase 5B — Paso 13: evaluación local de Send Email Hook

Fecha: **4 de noviembre de 2026**, America/Lima. Proyecto: SistemaAlumnos-Web; rama feature/supabase-auth. Presupuesto S/ 0; 10–15 alumnos inicialmente, previsión aproximada de 50.

**Resultado:** función PostgreSQL mínima preparada y **29/29 comprobaciones locales aprobadas en PGlite 18.6**, con ESLint sin advertencias. Devuelve un error controlado constante, nunca éxito sin envío. **No se probó un servidor Auth real con el hook ni su configuración Cloud. No se recomienda activarlo todavía.**

No se ejecutaron SQL o migraciones remotas, ni se consultó/configuró Cloud. No se modificaron cuentas, contraseñas, sesiones, MFA, RLS, .env.local, Next.js, demo, Vercel, GitHub o Apps Script. No hubo seed, instalaciones, commit, push o deploy. Las cinco migraciones mantienen sus SHA-256 aprobadas.

## 1. Evidencia y archivos entregados

El usuario comunicó login manual satisfactorio de u-000001 (55d355b9-21d7-46af-8d6d-650a528743eb) y u-000002 (6cabd8d2-55d0-401c-b4f6-a20040215134), todavía sin perfiles/membresías; también observó que el Dashboard permite seleccionar un hook Postgres y que ninguno está configurado. Se registra como información comunicada, sin atribuir verificación independiente o actualización del estado remoto.

| Archivo nuevo                               | Función                                                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| supabase/proposals/send-email-hook-deny.sql | Propuesta DDL separada de las cinco migraciones; no aplicada a Cloud ni registrada como migración                |
| scripts/database/test-send-email-hook.mjs   | Pruebas exclusivamente en PostgreSQL PGlite en memoria, sin argumentos/destinos, CLI, red, env, Auth real o seed |
| FASE_5B_PASO13_SEND_EMAIL_HOOK.md           | Este análisis, límites y procedimiento para revisión futura                                                      |

El SQL se ejecutó únicamente dentro de las pruebas desechables. No se ejecutaron migraciones de aplicación en ese motor: solo roles sustitutos y la propuesta nueva.

## 2. Contrato oficial y alcance

Un hook SQL recibe un argumento JSONB y devuelve JSONB. La denegación documentada es un objeto error con message y http_code; los errores de negocio se propagan a Auth, sin reintento del hook Postgres. Un resultado vacío de éxito no deniega la operación: permitiría que Auth continúe aunque no se haya entregado mensaje. El hook tiene un límite de ejecución corto, documentado como dos segundos para Postgres. [Contrato y errores oficiales](https://supabase.com/docs/guides/auth/auth-hooks).

Send Email está disponible en Free según esa documentación. Con el hook habilitado, este sustituye el envío incorporado; sin hook, el proveedor puede usar SMTP propio o el predeterminado. La ausencia de SMTP propio no desactiva correos. [Comportamiento de envío](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook).

Se inspeccionaron fuentes públicas upstream master, no la versión desplegada del proyecto. La revisión del despachador muestra que los correos de autenticación y las notificaciones habilitadas que pasan por sendEmail llegan al hook. Autorización de destinatarios y límites pueden rechazar antes de invocarlo; eso no es un envío que lo eluda. El camino del hook retorna directamente y no entra después en SMTP en ese código. [Despachador](https://github.com/supabase/auth/blob/master/internal/api/mail.go).

| Familias que el despachador revisado contempla                                        | Política de la propuesta                    |
| ------------------------------------------------------------------------------------- | ------------------------------------------- |
| signup, invite, magiclink, recovery, email_change, reauthentication                   | Error fijo, sin enviar ni aprobar el flujo  |
| password_changed_notification, email_changed_notification, phone_changed_notification | Error fijo si se intenta notificar          |
| identity_linked_notification, identity_unlinked_notification                          | Error fijo                                  |
| mfa_factor_enrolled_notification, mfa_factor_unenrolled_notification                  | Error fijo; no significa deshacer el factor |
| Evento nuevo/desconocido o payload incompleto                                         | Mismo error; nunca se permite por defecto   |

Fuera de la garantía de este hook: SMS/phone MFA, mensajes de proveedores OAuth externos, otros servicios que envíen correos directamente y correos propios de infraestructura/Dashboard. Tampoco intercepta generación administrativa de enlaces sin envío, validación de tokens ya emitidos, uso de contraseñas o sesiones existentes. No revoca JWT/refresh tokens ni convierte esos métodos en operaciones denegadas. Una credencial administrativa sigue siendo privilegiada. [Generación administrativa en Auth](https://github.com/supabase/auth/blob/master/internal/api/mail.go).

No se afirma que toda comunicación externa del producto pase por este hook.

## 3. Diseño SQL mínimo

La propuesta crea un esquema dedicado auth_email_hooks y la función deny_email(event jsonb). Su único resultado es:

```json
{
  "error": {
    "http_code": 403,
    "message": "Email delivery is disabled by institutional policy."
  }
}
```

El código completo se encuentra en supabase/proposals/send-email-hook-deny.sql. No depende de cuentas, dominio, roles académicos o tablas de la aplicación: bloquea toda invocación, incluidas direcciones ajenas y eventos futuros.

Decisiones de seguridad:

- SECURITY INVOKER, función SQL constante e IMMUTABLE, search_path=pg_catalog; sin SQL dinámico, red o lectura/escritura de tablas.
- No inspecciona, devuelve o registra event. No RAISE NOTICE/LOG/EXCEPTION, ni tablas de colas/auditoría con payloads. No almacena tokens, hashes, enlaces, emails o semillas.
- No usa STRICT: SQL NULL también devuelve la denegación, no un NULL susceptible de interpretarse como salida vacía.
- Esquema separado de private y de los esquemas expuestos de la API. No añadirlo a Exposed schemas.
- USAGE de ese esquema y EXECUTE de esa función solo para supabase_auth_admin, además de los privilegios inherentes del propietario/administración. No da CREATE o permisos sobre tablas.
- Revoca privilegios de PUBLIC, anon, authenticated y service_role sobre los objetos nuevos. No modifica sus permisos sobre otros objetos, RLS o roles administrados.
- CREATE sin OR REPLACE ni IF NOT EXISTS: una colisión detiene la propuesta; no se sustituye silenciosamente otra función. DDL dentro de una transacción.

supabase_auth_admin debe existir en Cloud; el SQL no crea ese rol. En pruebas se creó un sustituto local NOLOGIN. El operador futuro necesita capacidad DDL legítima, sin cambiar propietarios administrados. La documentación recomienda permisos selectivos y evitar SECURITY DEFINER para hooks de este tipo. [Seguridad de hooks SQL](https://supabase.com/docs/guides/auth/auth-hooks).

**Error de contrato no es excepción PostgreSQL.** El SELECT SQL retorna normalmente un JSON de error; Auth debe interpretarlo. Esto evita provocar deliberadamente una transacción SQL abortada. Errores de permisos, función ausente, timeout o infraestructura siguen siendo distintos y podrían causar fallos del flujo. La respuesta HTTP efectiva puede estar envuelta por el endpoint Auth; no se promete 403 uniforme sin prueba integral.

La función no filtra secretos en su salida. No se ha acreditado que la configuración de logs del proveedor/DB nunca registre parámetros de invocación: el payload contiene información sensible y su logging debe revisarse sin volcarlo.

## 4. Impacto posible en procesos legítimos

| Proceso                                        | Revisión upstream / riesgo                                                                                                                                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alta administrativa confirmada                 | admin.createUser con email_confirm=true no utiliza el envío de confirmación en el handler revisado. Una invitación es otro flujo y será rechazada. Configuración/hook adicional o versión distinta siguen pendientes.                 |
| Password login                                 | Su camino ordinario no invoca Send Email; no se pretende bloquearlo ni quitar confirmación técnica.                                                                                                                                   |
| Refresh/logout                                 | No envían correo en sus caminos ordinarios; el hook no es una revocación o un guard de sesión.                                                                                                                                        |
| Cambio autenticado de contraseña               | Si exige reautenticación por email, esa parte quedaría bloqueada. La notificación de contraseña, en el código revisado, captura el error y continúa con advertencia. No prometer éxito en otra versión.                               |
| Cambio de email, recuperación/OTP              | El correo es parte del flujo. Un rechazo puede abortarlo; es el efecto previsto.                                                                                                                                                      |
| Enrollment/challenge TOTP                      | No necesita envío email para proporcionar QR o verificar el código. No se cambia aal1/aal2 ni propiedad del factor.                                                                                                                   |
| Primera verificación TOTP / retirada de factor | La notificación puede invocar el hook si está habilitada. El upstream revisado registra su fallo sin abortar la verificación/retirada ya realizada. Confirmarlo en Auth real; no intentar retirar factores para probarlo sin permiso. |

Fuentes por proceso: [alta administrativa](https://github.com/supabase/auth/blob/master/internal/api/admin.go), [login](https://github.com/supabase/auth/blob/master/internal/api/token.go), [refresh](https://github.com/supabase/auth/blob/master/internal/api/token_refresh.go), [cambio de usuario/contraseña](https://github.com/supabase/auth/blob/master/internal/api/user.go), [MFA](https://github.com/supabase/auth/blob/master/internal/api/mfa.go).

Por tanto, **rechazar notificación no siempre rechaza la operación de negocio**. Tampoco devolver éxito sin enviar es equivalente a denegar el correo: esta propuesta jamás devuelve éxito y no oculta esa distinción.

El Paso 6 planteaba como riesgo general que bloquear notificaciones pudiera abortar operaciones legítimas. La inspección actual lo precisa: existen manejos explícitos que toleran esos fallos; persiste la incertidumbre de versión, permisos y transacciones reales. No se transforma esa revisión estática en una prueba positiva de MFA.

No habilitar secure password change/reautenticación basada en email como supuesto refuerzo sin diseñar el cambio de contraseña para cuentas sin buzón. No modificar esa configuración ahora. Notificaciones deshabilitadas no equivalen a deshabilitar recuperación u OTP.

## 5. Pruebas locales y límites

Comandos ejecutados:

```powershell
node scripts/database/test-send-email-hook.mjs
npx eslint scripts/database/test-send-email-hook.mjs --max-warnings=0
node scripts/database/local.mjs doctor
```

Resultados:

| Comprobación                                                        | Resultado                                            |
| ------------------------------------------------------------------- | ---------------------------------------------------- |
| Eventos de autenticación, siete notificaciones y evento desconocido | Denegación constante, sin datos del evento           |
| SQL NULL, JSON null, objeto/array/escalar/estructura incompleta     | Denegación constante                                 |
| Sentinelas sintéticos de token/hash/enlace en entradas              | No aparecen en ninguna respuesta                     |
| anon/authenticated/service_role                                     | Ejecución rechazada con 42501; sin EXECUTE           |
| supabase_auth_admin sustituto                                       | Puede ejecutar, sin CREATE en el esquema             |
| Firma, retorno, invoker, no STRICT, volatilidad/search_path         | Coinciden con el diseño                              |
| JSON inválido antes de invocar                                      | 22P02, no se interpreta como éxito                   |
| Tablas/colas en el esquema                                          | Cero                                                 |
| Reaplicar SQL con esquema existente                                 | Colisión 42P06 y rollback; función previa conservada |

**29/29**, motor **PostgreSQL embebido 18.6**. ESLint aprobado. Se repitió el runner tras formato; no hubo cambios funcionales posteriores. Las cinco SHA-256 de migraciones coinciden con Fase 4C.

doctor informó CLI 3.0.0 y Docker operativo: no (salida 1 de diagnóstico). No se inició servidor o instaló infraestructura. PGlite no ejecuta el servicio Auth ni interpreta su protocolo HTTP. No se usó seed ni las identidades reales, incluyendo las dos QA nuevas.

**Pendiente:** PostgreSQL 17 nativo y rol Auth real; selección del esquema en Dashboard; propagación/error HTTP; no fallback SMTP; capturas/logs sin secretos; login/refresh/logout; cambio de contraseña con configuraciones reales y MFA TOTP. No se ha probado ninguna de estas condiciones en Cloud. Los logins manuales previos fueron sin hook configurado.

## 6. Activación futura para revisión, no ejecutada

1. Obtener aprobación expresa para un ensayo Auth aislado primero; no activar basándose solo en estas 29 pruebas. Crear escenarios sintéticos y capturar conteos de envío sin entrega externa ni contenido sensible.
2. Registrar versión Auth y configuración previa: hook actualmente vacío según el usuario, notificaciones y ajustes de reautenticación. Probar denegación directa de recovery/OTP/invite/email change y su resultado real, no solo mocks o Next.js.
3. Probar también alta administrativa confirmada, password login incorrecto/correcto, refresh/logout y TOTP enrollment/challenge/verify con cuentas autorizadas. Mantener Panel/RPC denegados sin aal2. No usar cuentas existentes para mutaciones no aprobadas.
4. Si pasa, revisar la propuesta, nombre/ausencia de colisiones, permisos y mecanismo de versionado nuevo. Una futura aprobación DDL permitiría crear el esquema/función; no editar las cinco migraciones. No hacer db push de esta propuesta ahora.
5. En el Dashboard del proyecto rnxgrunnrdlgjsbsrjev: Authentication → Auth Hooks → configurar Send Email, tipo Postgres; seleccionar auth_email_hooks.deny_email(jsonb), guardar/habilitar según la UI vigente. Si no aparece el esquema o no admite la firma, detenerse; no moverla a public, ampliar grants o cambiar propietarios automáticamente.
6. Verificar enlace, permisos efectivos y pruebas mínimas previamente aprobadas. Las pruebas de recovery/OTP o MFA generan estado remoto: requieren autorización de prueba separada, no se presentan como consultas de lectura.
7. No habilitar recuperación/invitaciones de Next.js o Auth automáticamente. No activar email, SMS o proveedores adicionales como parte del hook. El rol Auth necesita solo el permiso del objeto nuevo.

El Dashboard puede aplicar grants al configurar el hook: revisar su estado efectivo después, sin aceptar acceso para anon/authenticated o tablas privadas. No es necesario incorporar un endpoint, secreto de webhook HTTP, servicio de correo o job queue.

## 7. Reversión de activación fallida

Una aprobación de activación debe incluir un plan de reversión y su riesgo de correo. En fallo: detener las pruebas; conservar etapa/código sanitizados; no reintentar cambios de contraseña/factores automáticamente. Un error observado no prueba rollback de todas las operaciones Auth, especialmente notificaciones posteriores al commit.

Para desvincular: operador central entra al mismo proyecto en Authentication → Auth Hooks, deshabilita/elimina **solo la configuración Send Email** y verifica que no siga enlazada. Dejar la función inerte evita un DROP urgente. Su retirada DDL se revisa después, con autorización propia, sin CASCADE. No tocar RLS, usuarios, factores, sesiones o los otros hooks.

**Advertencia operativa necesaria:** desactivar el hook puede restaurar el envío predeterminado SMTP; no es una reversión que mantenga la denegación de correo. Antes de hacerlo debe existir otro control comprobado o aceptarse explícitamente esa exposición temporal en la autorización. Cerrar Next.js o sus flags no bloquea llamadas directas al proveedor. No presentar “quitar hook” como retorno seguro de la política sin correo.

Restaurar ajustes previos solo si fueron cambiados bajo autorización y se revisa su efecto. No sustituir la función por RETURN '{}' como emergencia: sería permitir el flujo sin envío y cambiaría la política solicitada.

## 8. Alternativas y recomendación

| Alternativa                        | Evaluación                                                                                                                                                                                                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flags Next.js + .invalid           | Mantenerlos, pero no bloquean endpoints del proveedor ni demuestran cero intentos de envío                                                                                                                                                                           |
| Deshabilitar email/password        | Bloquea también el login; no cumple el modelo                                                                                                                                                                                                                        |
| Apagar notificaciones de seguridad | Puede reducir avisos/ruido, pero no bloquea recovery/OTP/invitaciones                                                                                                                                                                                                |
| No configurar SMTP propio          | Permanece el servicio incorporado; no cumple                                                                                                                                                                                                                         |
| Éxito sin entregar correo          | Sencillo, pero no deniega y no es la política solicitada; descartado                                                                                                                                                                                                 |
| Límite global de correo cero       | El upstream contiene rechazo previo al hook con ese valor; disponibilidad/aceptación de ese ajuste en Cloud Free no comprobada. Podría ser más simple si se acredita, pero expresa rate limit y comparte riesgos de errores. No se configura ni se asume disponible. |
| Hook SQL constante                 | Pocas líneas, sin estado/secretos/servicios, error de negocio explícito y alcance auditable; candidato preferido si no hay un ajuste soportado suficiente                                                                                                            |

**Recomendación concreta:** conservar esta implementación local como candidata, pero **no activarla todavía en Cloud ni afirmar que no afecta MFA**. Validar primero el servidor Auth real y su configuración con el plan anterior. Si cumple, es una solución pequeña y mantenible para el requisito de denegación en proveedor.

El INSERT de organización/perfiles/membresías del aprovisionamiento SQL no invoca por sí mismo Send Email y no depende técnicamente del hook. Puede revisarse de forma separada manteniendo el acceso cerrado. Sin embargo, antes de habilitar uso académico QA bajo la garantía de bloqueo del proveedor, se recomienda haber validado y autorizado este control u otra alternativa equivalente. No convertir una prueba PostgreSQL en requisito satisfecho de Auth.

No se recomienda implementar una cola, proxy, SMTP o nuevo módulo de recuperación para resolverlo. No se necesita modificar MFA/RLS o rebajar aal2. El contexto visual y los logins siguen siendo evidencia del usuario, no una activación realizada aquí.

**Cierre:** propuesta y pruebas locales completadas; integración Auth/Cloud pendiente y sin autorización de activación. Se detiene el trabajo sin cambios remotos.
