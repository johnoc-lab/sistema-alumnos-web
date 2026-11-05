# Fase 5B — Paso 1: login real sin SMTP

Fecha: 2 de noviembre de 2026. Rama: feature/supabase-auth.

**Resultado:** login/logout pueden habilitarse independientemente del correo. Los tres controles privados están implementados y cerrados por defecto en UI, handlers y proxy. Auth no fue activado; .env.local no se modificó.

No se crearon cuentas, perfiles o membresías. No se contactó Supabase Cloud, no se ejecutaron seeds o migraciones, ni se modificaron Vercel, GitHub o Apps Script. No se hizo commit, push o deploy. La demo y las páginas académicas conservan sus fronteras de autorización.

## 1. Referencias y alcance

Se revisaron FASE_5A_AUTENTICACION.md, FASE_5B_PLAN_GRATUITO.md y MODELO_BASE_DATOS.md. Este paso implementa los controles P0 del plan gratuito; no implementa SMTP, la adaptación de recuperación predeterminada o el panel MFA.

El directorio conserva cambios locales de fases anteriores. El estado global de Git contra main no representa exclusivamente este paso.

## 2. Archivos modificados

| Archivo                                              | Responsabilidad del cambio                                                                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| src/lib/auth/features.server.ts                      | Nuevo módulo server-only: lectura estricta de los tres flags y predicados por propósito.                                                               |
| src/lib/auth/handlers.server.ts                      | Bloqueo antes de inicializar el cliente SDK; control independiente por tipo de confirmación y ticket; callback PKCE cerrado cuando email está apagado. |
| src/lib/auth/recovery.server.ts                      | Ticket firmado con propósito recovery/invite y validación previa a consultar Auth.                                                                     |
| src/proxy.ts                                         | No renueva sesión en rutas apagadas ni antes de los handlers de operaciones; conserva renovación habitual para login/rutas protegidas.                 |
| src/features/auth/components/auth-form.tsx           | Oculta enlace y formularios desactivados; elimina la invitación textual a recuperar acceso cuando no está disponible.                                  |
| src/features/auth/components/feature-unavailable.tsx | Nueva respuesta visual genérica, sin formularios ni SDK.                                                                                               |
| src/app/auth/recuperar/page.tsx                      | Cierra el formulario de recuperación por URL directa.                                                                                                  |
| src/app/auth/confirm/page.tsx                        | Cierra confirmación global o por propósito, sin presentar un formulario que consuma un enlace desactivado.                                             |
| src/app/auth/actualizar-password/page.tsx            | Cierra actualización; comprueba propósito habilitado y ticket antes de consultar Auth.                                                                 |
| .env.example                                         | Agrega los tres flags privados en false; mantiene SUPABASE_AUTH_ENABLED=false.                                                                         |
| tests/auth-handlers.test.ts                          | Denegaciones sin SDK, flags independientes y login/logout sin correo.                                                                                  |
| tests/auth-proxy.test.ts                             | No renovación en rutas apagadas o antes de handlers; casos mixtos.                                                                                     |
| tests/auth-security.test.ts                          | Actualiza la prueba firmada para incluir propósito.                                                                                                    |
| tests/auth-features.test.ts                          | Nuevas pruebas de defaults, UI, URLs directas y tickets antiguos/manipulados.                                                                          |
| FASE_5B_PASO1_LOGIN.md                               | Este informe.                                                                                                                                          |

No se modificaron los adaptadores de identidad, la resolución de perfil/membresías, el guard de organización/rol, las reglas MFA o las cinco migraciones aplicadas.

## 3. Controles privados implementados

```dotenv
SUPABASE_AUTH_ENABLED=false
AUTH_EMAIL_RECOVERY_ENABLED=false
AUTH_TOKEN_HASH_RECOVERY_ENABLED=false
AUTH_INVITATION_ACCEPT_ENABLED=false
```

Solo el valor literal true habilita cada control. Ausencia, false, TRUE, 1, yes y otros valores mantienen cerrado el control. Los nuevos flags no llevan prefijo NEXT_PUBLIC y se leen desde un módulo server-only.

| Control                          | Permite, únicamente si se habilita explícitamente                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| SUPABASE_AUTH_ENABLED            | Integración general con configuración válida de proyecto, origen, clave pública y secreto. |
| AUTH_EMAIL_RECOVERY_ENABLED      | Solicitud de correo y callback PKCE usado por esa recuperación.                            |
| AUTH_TOKEN_HASH_RECOVERY_ENABLED | Confirmación recovery por token_hash y cambio de contraseña con prueba de ese propósito.   |
| AUTH_INVITATION_ACCEPT_ENABLED   | Confirmación invite y cambio de contraseña con prueba de invitación.                       |

Habilitar email no habilita token_hash ni invitaciones. Habilitar invitación no habilita solicitudes de correo. Login con contraseña y logout no dependen de ninguno de esos tres flags.

Los controles se consultan en el servidor. Un formulario construido manualmente, query string o POST directo no los cambia.

## 4. Comportamiento de las rutas directas

Con configuración general válida pero los tres controles en false:

| Ruta                             | Resultado                                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| POST /auth/login                 | Mantiene signInWithPassword y redirección interna controlada. No solicita correo.                  |
| POST /auth/logout                | Mantiene cierre local y eliminación de cookies propias.                                            |
| POST /auth/recover               | 503 genérico, sin crear cliente ni ejecutar resetPasswordForEmail.                                 |
| POST /auth/verify, type=recovery | 503, sin verificar/consumir OTP.                                                                   |
| POST /auth/verify, type=invite   | 503, sin verificar/consumir OTP.                                                                   |
| POST /auth/password              | 503 incluso con un ticket firmado previamente válido; no updateUser.                               |
| GET /auth/callback?code=...      | 503 sin exchangeCodeForSession.                                                                    |
| GET /auth/recuperar              | Página de función no disponible, sin formulario.                                                   |
| GET /auth/confirm                | Página de función no disponible, sin formulario de confirmación.                                   |
| GET /auth/actualizar-password    | Página de función no disponible, sin lectura de sesión/SDK cuando ambos propósitos están apagados. |

Con Auth global desactivado, los POST conservan el 503 de configuración ausente; el callback conserva su redirección al login sin canjear el código.

Todos los POST mantienen el control Origin y las respuestas no-store de 5A. Una solicitud con origen inválido puede recibir 403 antes de evaluar la disponibilidad.

El proxy evita renovar tokens en rutas apagadas. Los handlers /auth/recover, /auth/verify y /auth/password no dependen de una renovación previa del proxy: verifican primero su control y luego usan su cliente escribible si procede. En confirmaciones GET y páginas de contraseña se revisa el propósito, también en configuraciones mixtas.

No se agregaron nuevas rutas de invitación, registro o administración.

## 5. Tickets y controles independientes

La prueba sa-credential-update ahora incluye purpose=recovery o purpose=invite dentro del payload firmado, además de sub, session_id y expiración de 10 minutos.

Esto evita que, al apagar recuperación pero mantener invitaciones —o al revés—, un ticket del flujo apagado permita actualizar una contraseña por la otra función.

Antes de inicializar el SDK, el handler de password comprueba firma, plazo y propósito permitido. Después conserva la verificación del usuario/claims y su vinculación a la sesión. El propósito no se toma de un campo manipulable del formulario.

Las pruebas de 5A sin propósito se rechazan aun si su firma era válida. Es una invalidación local de tickets de cambio de contraseña, no un cambio de JWT, usuario, membresía o MFA. No afecta al login/logout ordinario. No existían cuentas de prueba creadas por el proyecto en esta implementación.

Denegar una función no consume su OTP, canjea su código ni elimina un ticket válido del flujo apagado. La firma HMAC se comprueba localmente; esa lectura no es una operación contra Supabase.

## 6. Identidad y aislamiento preservados

Se mantienen getUser/getClaims, perfil activo, membresía activa, organización activa, separación por tenant y aal2 para Admin. No se confía en roles del navegador, dominios de correo o fixtures.

Una cuenta Auth sin perfil/membresía puede iniciar sesión, pero no recibe acceso académico. La primera cuenta sintética debe comprobar precisamente esa denegación.

Los adaptadores académicos/CRUD continúan sin conexión. Las rutas reales no usan /demo como respaldo. La demo permanece fuera del proxy Auth, sin consultas o renovación de sesión.

No se añadió un panel MFA ni se rebajó su nivel requerido.

## 7. Pruebas realizadas

| Verificación                    | Resultado                                                                 |
| ------------------------------- | ------------------------------------------------------------------------- |
| Vitest                          | **118/118 pruebas aprobadas**, ocho archivos.                             |
| ESLint                          | Aprobado sin advertencias.                                                |
| TypeScript                      | Aprobado.                                                                 |
| Next build                      | Aprobado; carga .env.local con Auth desactivado, sin mostrar sus valores. |
| check:routes                    | 55 rutas locales aprobadas: demo, rutas cerradas, cabeceras y 404.        |
| check:auth-routes               | 14 solicitudes Auth locales aprobadas sin credenciales.                   |
| .env.local                      | Contenido conservado; flag general continúa false.                        |
| Migraciones, demo y Apps Script | Huellas verificadas sin modificaciones.                                   |

Las nuevas pruebas usan mocks y variables de proceso aisladas del runner; no modifican .env.local ni habilitan Auth en el servidor real.

Cobertura específica:

- Flags ausentes o con valores no válidos permanecen false.
- Login habilitado en mocks con los tres controles false: signInWithPassword funciona y no llama a resetPasswordForEmail, verifyOtp o exchangeCodeForSession.
- Logout sigue funcionando con los tres controles apagados.
- Correo apagado: ninguna llamada al SDK, ninguna escritura de cookies.
- Confirmación de ambos tipos apagada, incluso con hashes de prueba formalmente válidos: ningún verifyOtp.
- Callback apagado con código de prueba: ningún canje.
- Password con ticket válido pero propósito apagado: ningún getUser/getClaims/updateUser y ticket sin consumir.
- Configuraciones mixtas: habilitar un flujo no abre el otro.
- Manipular purpose invalida la firma; ticket antiguo sin purpose se rechaza.
- UI sin enlaces/formularios desactivados; URLs GET directas cerradas.
- Proxy sin renovación previa en las operaciones y sin SDK para funciones apagadas.
- Pruebas anteriores de sesión inválida, falta de perfil/membresía, organización suspendida, acceso cruzado, Admin sin MFA y demo conservadas.

Las comprobaciones HTTP utilizaron el servidor compilado en loopback, puerto 3107, con Auth real desactivado. No prueban un login exitoso de Cloud. La separación del login respecto de SMTP se verificó con mocks; la prueba real requiere una cuenta autorizada posterior.

No se ejecutó npm run check porque incluye la suite histórica de base que utiliza seed. No se ejecutaron pruebas con usuarios Cloud ni se enviaron correos.

## 8. Confirmación: login puede habilitarse sin correo

Sí. Una cuenta ya creada administrativamente, con contraseña y email verificado/confirmado de forma legítima, puede usar login/logout sin solicitar correo durante el acceso.

Tras una autorización futura, será posible poner únicamente SUPABASE_AUTH_ENABLED=true en el entorno local, con el resto de configuración válida y los tres nuevos flags en false. No será necesario configurar SMTP ni editar plantillas para esa prueba.

Este paso **no** cambia ese valor ahora, no crea la cuenta y no garantiza la validez de las credenciales locales mediante una autenticación real.

## 9. Primera prueba real con una sola cuenta sintética

No ejecutar todavía los pasos que crean datos o activan Auth.

1. Obtener autorización posterior para exactamente una cuenta QA_AUTH_ONLY en sistema-alumnos-dev / rnxgrunnrdlgjsbsrjev. Acordar responsable, buzón/alias de pruebas bajo su control y plazo de uso.
2. El operador verifica la titularidad del buzón, prepara una contraseña exclusiva en un gestor privado y realiza el alta mediante Dashboard o Auth Admin fuera de Next.js. No enviar contraseña por correo, compartirla o insertar directamente en auth.users.
3. Si se usa confirmación administrativa individual, exigir evidencia previa de control de identidad/buzón. No deshabilitar Confirm Email ni marcar direcciones inventadas como verificadas para sortear el límite SMTP.
4. Registrar únicamente la referencia de autorización y Auth UUID. No crear perfiles, organizaciones, matrículas ni membresías para esta primera prueba.
5. Confirmar que los tres controles siguen false. Si no figuran en .env.local, su valor efectivo es false por defecto; cualquier edición posterior debe limitarse a controles autorizados, sin mostrar secretos.
6. Obtener autorización expresa para activar Auth localmente y reiniciar el servidor en el origen de APP_ORIGIN, actualmente http://127.0.0.1:3000.
7. Abrir /login fuera de /demo e introducir privadamente la contraseña única.
8. Esperar login correcto y selector sin acceso académico por falta de perfil/membresía. Dashboard/Admin de cualquier organización deben seguir cerrados.
9. Comprobar que login no envía correo. GET de recuperación no muestra formulario y POST directo continúa rechazado.
10. Hacer logout y verificar que navegar a rutas reales vuelva a requerir autenticación.
11. Registrar resultados sin contraseñas, JWT, cookies o enlaces de recuperación.
12. Finalizar el ensayo y devolver el flag local a false conforme al alcance autorizado. No eliminar o modificar la cuenta automáticamente sin autorización.

Una prueba positiva de Admin requiere perfiles y membresías aprobados, organización válida y la interfaz/challenge MFA aún pendiente. No forma parte de esta primera prueba.

## 10. Riesgos y pendientes

- Recuperación por correo predeterminado sigue incompleta de extremo a extremo según el plan 5B. Encender su flag no corrige por sí solo el callback o las plantillas. Mantenerlo false.
- Invitaciones predeterminadas por fragmentos siguen sin integración. Mantener aceptación apagada hasta un diseño y pruebas autorizados.
- Ningún correo administrativo, OTP o enlace válido fue consumido durante las pruebas: se simularon en memoria. No se afirma entrega real ni recuperación real probadas.
- La aplicación no puede impedir que un operador use el Dashboard/API de Supabase fuera de ella. Estos controles gobiernan sus propias rutas, no sustituyen la configuración de signup, destinatarios o cuotas de Cloud.
- Pérdida de contraseña durante el piloto requerirá el procedimiento administrativo controlado del plan 5B; no habilitar un atajo público.
- Con 10–15 alumnos y un máximo previsto de 50, el tamaño no elimina las restricciones del SMTP gratuito. Este paso no añade servicios o gasto y no promete correo masivo gratuito.
- Mantener las migraciones aplicadas inmutables. Aprovisionamiento, panel MFA, integración académica y despliegue requieren fases/autorizaciones posteriores.

Estado final: código preparado para login sin correo; las cuatro opciones permanecen cerradas por defecto y la configuración real de Auth continúa desactivada.
