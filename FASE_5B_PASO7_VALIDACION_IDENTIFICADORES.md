# Fase 5B — Paso 7: validación mínima de identificadores

Fecha: **4 de noviembre de 2026**, America/Lima. Proyecto: SistemaAlumnos-Web. Rama comprobada: **feature/supabase-auth**. Escala: 10–15 alumnos inicialmente, aproximadamente 50 como previsión; presupuesto S/ 0.

**Resultado: validación parcial por revisión de fuentes y entorno. No se realizó ninguna prueba real de creación, confirmación o login en un servidor Supabase Auth.** No se encontró un entorno Auth local aislado utilizable y no se instaló infraestructura.

**Recomendación:** conservar cuentas.sistema-alumnos.invalid como candidato. La sintaxis es coherente con el validador upstream revisado y evita buzones de terceros, pero la aceptación integral por el proveedor sigue pendiente. El siguiente paso mínimo es resolver ese ensayo de Auth, no implementar primero migraciones, contrato v2 o módulos.

El único archivo nuevo de este paso es este informe. No se accedió a Supabase Cloud, no se crearon/modificaron usuarios, no se ejecutaron migraciones ni SQL, no se usaron los adaptadores QA y no se modificaron UUID, Next.js, MFA, RLS, demo o configuración. No se leyeron secretos, se hicieron instalaciones, commit, push o deploy.

## 1. Alcance y ajuste del orden propuesto en el Paso 6

Se revisó FASE_5B_PASO6_CUENTAS_INSTITUCIONALES.md y se contrastaron las fuentes oficiales de Auth, el entorno Windows, el diagnóstico local y las condiciones actuales de login/activación.

El Paso 6 propuso una evolución de esquema y un hook para expresar/proteger el modelo institucional. Son propuestas posteriores: **ninguna es una dependencia técnica de la prueba de aceptación de un identificador** mediante alta administrativa y contraseña. Tampoco es necesario integrar la aplicación para probar Auth.

Se mantiene la separación entre confirmación administrativa del proveedor, control de credenciales, verificación institucional y titularidad de buzón. El experimento propuesto solo demostraría comportamiento técnico. No aprobaría una persona, un rol, una membresía, MFA o un lote académico.

## 2. Qué se comprobó sobre el validador

Se consultaron las fuentes upstream públicas en la rama master. No se identificó ni se consultó la versión del servidor Auth de sistema-alumnos-dev: estas fuentes **no prueban equivalencia con su despliegue**.

| Revisión                                         | Observación y límite                                                                                                                      |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| API validateEmail                                | Rechaza vacío/longitud excesiva, utiliza checkmail.ValidateFormat y normaliza a minúsculas. Esa función no consulta DNS/MX.               |
| Dependencia concreta                             | El go.mod revisado fija checkmail a d0a759655d62. Se revisó esa revisión, no solamente la versión actual de la biblioteca.                |
| Patrón de esa dependencia                        | Permite letras/dígitos y guiones en etiquetas de dominio separadas por puntos, sin lista de TLD válidos ni exigencia de MX.               |
| Ejemplo u-000001@cuentas.sistema-alumnos.invalid | Sus componentes ASCII encajan en el patrón por inspección. No se ejecutó el validador Go ni el endpoint Auth para comprobarlo.            |
| Alta administrativa                              | El handler revisado valida el email y permite confirmación administrativa individual mediante email_confirm.                              |
| Login con contraseña                             | El flujo revisado comprueba proveedor habilitado, usuario, contraseña, bloqueo y confirmación; no requiere recibir un correo en esa ruta. |

La inferencia sintáctica se apoya en [validateEmail](https://github.com/supabase/auth/blob/master/internal/api/mail.go), el [go.mod de Auth](https://github.com/supabase/auth/blob/master/go.mod) y el [validador fijado d0a759655d62](https://github.com/badoux/checkmail/blob/d0a759655d62/checkmail.go). La disponibilidad de alta/confirmación administrativa figura en [createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser) y su [handler](https://github.com/supabase/auth/blob/master/internal/api/admin.go); el flujo de contraseña se contrastó en [token.go](https://github.com/supabase/auth/blob/master/internal/api/token.go).

No se observa una exigencia de buzón o DNS en esos caminos revisados. **Esto no equivale a probar su ejecución:** configuración, hooks, versión y validaciones adicionales del servicio pueden afectar el resultado. No se ejecutaron regex traducidas a JavaScript, mocks del SDK o tablas Auth sustitutas para presentarlas como evidencia del proveedor.

En la aplicación actual, el formato básico y límite de 254 caracteres del POST /auth/login admiten el ejemplo por inspección. No se ejecutó Next.js ni se cambió su validador. Mantener el proveedor email/password habilitado: apagarlo para impedir correo impediría también el login revisado.

## 3. Entorno aislado: comprobaciones y resultado

| Recurso comprobado              | Resultado observado                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Supabase CLI del proyecto       | 3.0.0, según el diagnóstico local existente                                                                               |
| Docker/Podman                   | No disponibles en PATH; tampoco se encontraron en las rutas comunes comprobadas de Docker Desktop/Podman                  |
| Go, postgres y psql             | No disponibles en PATH; tampoco se encontró Go en su ruta común comprobada                                                |
| Listeners locales               | Ninguno en 54321, 54322 o 9999: API/DB configuradas y puerto habitual de Auth                                             |
| Procesos por nombres conocidos  | No se encontraron gotrue, auth, postgres o motores Docker/Podman en la consulta realizada                                 |
| WSL                             | Existe wsl.exe, pero el listado devolvió ayuda/estado 1 y --status devolvió 50; no se acreditó una distribución operativa |
| PGlite y embedded-bootstrap.sql | Disponibles como sustitutos de base de datos; no contienen el servidor HTTP/validación/sesiones de Supabase Auth          |

Se ejecutó exclusivamente:

```powershell
node scripts/database/local.mjs doctor
```

Resultado: CLI 3.0.0; Docker operativo: no; código de salida 1. Es el resultado del diagnóstico de disponibilidad, no un fallo de login. Se leyó el script antes: doctor consulta versiones, no ejecuta start, reset o migraciones.

Las herramientas/procesos/puertos y rutas se inspeccionaron sin leer archivos privados o líneas de comandos de procesos. No se lanzó el stack, se descargaron servicios, se inició WSL o se probó un endpoint HTTP. La conclusión se limita a los recursos comprobados: **no hay entorno Auth aislado utilizable identificado para este ensayo**.

La documentación actual ofrece un runtime nativo experimental para plataformas Linux compatibles y macOS Apple silicon; **Windows no está soportado**. No se intentó usarlo como una alternativa ya disponible ni se instaló una distribución o contenedores. [Runtimes oficiales](https://supabase.com/docs/guides/local-development/docker-and-native-runtimes).

Por tanto:

- Pruebas reales de alta administrativa: **0**.
- Confirmaciones técnicas realizadas: **0**.
- Logins, refresh/logout o envíos observados en Auth aislado: **0**.
- Usuarios reales/sintéticos creados en Cloud: **0**.
- Migraciones o cambios funcionales de este paso: **0**.

Las 12 comprobaciones PGlite del Paso 6 y los logins QA anteriores no validan este namespace: las primeras eran SQL/claims simulados y los segundos utilizaron otras direcciones. No se repitieron tests/build de Next.js por tratarse de documentación sin cambios funcionales.

## 4. Conveniencia del namespace

**Sí conviene conservarlo como candidato, sujeto al ensayo real pendiente.** .invalid y sus subdominios están reservados para nombres que no deben resolver en DNS público; es una base apropiada para identificadores sin buzón, sin comprar un dominio ni utilizar direcciones ajenas. No demuestra que todos los proveedores acepten esas direcciones. [RFC 6761, sección 6.4](https://www.rfc-editor.org/rfc/rfc6761.html#section-6.4).

Mantener una política mínima: identificador ASCII estable, normalizado, no reciclable y sin datos sensibles; namespace global para ambas organizaciones; roles/permisos por membresías y UUID. No crear otra cuenta por pertenecer a Incubadora ni deducir el rol del dominio.

No afirmar que la dirección es entregable, que email_confirmed_at verifica un buzón o que .invalid apaga endpoints. Su reserva evita un destinatario público válido; no garantiza cero intentos de envío.

No cambiar todavía las dos cuentas QA, sus UUID ni el manifiesto pendiente. No utilizar sus direcciones bajo correo.com para conceder acceso académico. La eventual corrección de identificadores, sesiones/enlaces previos o sustitución de cuentas mantiene la revisión/autorización del Paso 6.

## 5. Modelo simple y cambios indispensables

Para 10–50 usuarios es suficiente conservar Supabase Auth, un perfil global, membresías independientes y un **procedimiento de operador central** con registro de aprobación y auditoría. No hace falta construir un panel de altas, SMTP, federación o una segunda base de cuentas.

Separar tres momentos:

| Momento                      | Mínimo indispensable                                                                                                                                                                       | No necesario todavía                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Aceptación del identificador | Servidor Auth real, cuenta sintética sin permisos, alta administrativa/confirmación/password login y evidencia de no envío                                                                 | Tablas académicas nuevas, migración v2, hook personalizado, Next.js o MFA real                                |
| Primera vinculación QA       | Identificador aceptado/corregido, adjudicación institucional por UUID/rol, responsable/referencia/fecha, contrato honesto sin prueba de buzón, lote revisado y política de correo resuelta | Modelo general de recuperación, automatización de altas o segunda organización Cloud de prueba sin aprobación |
| Uso académico                | Estados/organizaciones/membresías válidos, RLS, MFA aal2 para Admin, credenciales individuales, soporte y controles del proveedor verificados                                              | SSO externo, importación, autoservicio de recuperación o funciones opcionales no integradas                   |

**Seguridad que no se puede posponer:** registro público/anónimo cerrado; controles de recuperación/invitación actuales cerrados; ninguna clave administrativa en navegador/Next.js; roles aprobados explícitamente; no conceder permisos a identificadores ajenos; no inventar verificaciones; conservar UUID/perfil/membresía/organización/RLS y aal2. El operador central debe tener autoridad sobre la identidad global, no solo una membresía administrativa en una organización.

**Después de validar Auth**, resolver únicamente lo que necesita la primera vinculación: separar login_identifier de la comprobación institucional y registrar responsable, referencia y fecha sin declarar titularidad de buzón. El v1 actual no se ejecuta ni se completa con una falsa verificación. Si se decide persistir esa distinción en la tabla, preparar la migración mínima en una fase posterior, sin editar las cinco existentes. No es un requisito previo al experimento de Auth.

Se pueden posponer el contrato v2 generalizado, modalidades de verificación no utilizadas, nuevas tablas/RPC de recuperación, panel de aprovisionamiento, automatización masiva, importación y SSO. La recuperación administrativa seguirá sin implementar, sin prometer autoservicio o eludir MFA mientras no exista.

## 6. ¿Es obligatorio un hook?

**No para probar alta administrativa, confirmación y login con contraseña.** El camino upstream revisado no requiere un hook de correo para ese experimento. **Sí es obligatorio disponer de un control verificable en el proveedor si se quiere garantizar bloqueo de sus flujos de correo**, pero no se ha demostrado que deba ser necesariamente un hook personalizado.

Los flags de Next.js no impiden solicitudes directas a Auth. Tampoco .invalid o los límites del correo gratuito demuestran que la recuperación/OTP estén desactivados. Antes de uso académico debe cerrarse esa política: comprobar si existe una configuración suficiente compatible con login o, en caso contrario, revisar el hook. No se acreditó tal configuración Cloud en este paso.

Send Email Hook es un candidato compatible con Free y puede implementarse como función PostgreSQL; la documentación indica que sustituye el envío SMTP cuando está habilitado. Esto no significa que un hook escrito sin más sea correcto o que deba implementarse antes de validar el identificador. [Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks), [comportamiento de envío documentado](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/auth-hooks/send-email-hook.mdx).

Pruebas mínimas antes de cualquier habilitación futura:

1. Solicitudes directas a Auth de recuperación, OTP/magic link, invitación/cambio de email y reautenticación: rechazo según política, no únicamente botón oculto en Next.js.
2. Sin fallback/envío externo; observar resultado y contadores en infraestructura de prueba, sin registrar payloads, códigos, tokens o enlaces. Un éxito sin envío no debe confundirse con una denegación del flujo.
3. Conservar alta confirmada administrativamente, password login, rechazo de contraseña incorrecta, refresh y logout.
4. Comprobar enrollment/challenge/verify TOTP y requisitos aal2, incluidas notificaciones de seguridad que puedan abortar operaciones si se bloquean indiscriminadamente.
5. Tipos desconocidos/fallos del hook: comportamiento cerrado y sin secretos. Si usa SQL, permisos mínimos al rol Auth administrado; sin grants académicos nuevos ni exposición como RPC pública.

Para el ensayo aislado de identificador puede utilizarse un capturador local sin entrega externa y comprobar cero mensajes en ese flujo, sin hook propio. Ese resultado no demostraría bloqueo global de otros flujos.

No se implementó ni enlazó hook, ni se llamó a los endpoints anteriores en esta fase. Posponer el hook **no autoriza afirmar bloqueo remoto ni habilitar funcionalidades de correo**. La política y su mecanismo deben resolverse antes de otorgar acceso académico si todavía no se dispone de la garantía exigida.

## 7. Prueba pendiente y siguiente paso mínimo

**El siguiente cambio mínimo no es de esquema o aplicación: es disponer de una ejecución real de Auth autorizada para el experimento.**

Opción preferida: un entorno Auth aislado ya disponible o habilitado después con autorización, en directorio/proyecto de pruebas independiente del checkout vinculado. No instalar infraestructura pesada automáticamente.

Si se decide evitar esa instalación, otra opción futura es **un piloto explícitamente autorizado en sistema-alumnos-dev**, con una identidad sintética nueva, sin perfil, organización, membresía o rol académico y sin tocar los dos UUID QA. Cloud de desarrollo **no es un entorno local aislado**: esa alternativa implica escritura remota y está fuera de la autorización actual. No se ejecuta ni se solicita su aprobación como parte de este informe.

Ficha mínima del ensayo futuro, todavía sin ejecutar:

| Paso                                 | Evidencia mínima                                                                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verificar servidor/destino y versión | Endpoint/versión de Auth y entorno; ninguna conexión accidental a Cloud desde un fixture local                                                     |
| Configurar aislamiento y correo      | Proveedor email/password habilitado, confirmación global conservada, registro cerrado y captura/no entrega externa verificable                     |
| Crear una cuenta sintética           | Identificador único bajo el namespace, contraseña individual generada/manejada privadamente y confirmación administrativa; UUID nuevo del servidor |
| Comprobar estado                     | Identificador normalizado, UUID y confirmación técnica; no volcar la respuesta Admin completa                                                      |
| Login real por contraseña            | Sesión del mismo UUID, resultado de getUser y fallo con contraseña incorrecta; sin imprimir password/JWT/cookies                                   |
| No envío y cierre                    | Cero mensajes del flujo observado; refresh/logout y resultado del cierre registrados sin secretos                                                  |

Si falla la creación o el login, conservar código/etapa y error sanitizado; no quitar confirmaciones, usar dominio ajeno o inventar un resultado. Los tokens/contraseñas no formarán parte de evidencia ni archivos versionados. No se hará limpieza destructiva automática en Cloud.

Solo tras ese resultado se prepara el cambio mínimo del contrato de aprovisionamiento, su representación de verificación institucional y el tratamiento de las cuentas QA. La validación SQL PostgreSQL 17 del lote sigue siendo necesaria cuando se vaya a aplicar ese lote; no sustituye la prueba de Auth ni obliga a construirla antes.

## 8. Estado final

| Pregunta                                                                 | Respuesta                                                                                                |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| ¿La sintaxis propuesta es coherente con las fuentes revisadas?           | Sí, por inspección del validador y su dependencia fijada.                                                |
| ¿Se probó creando/confirmando/autenticando una cuenta con ese namespace? | No: no había entorno Auth aislado utilizable identificado.                                               |
| ¿Está validada la aceptación por el proyecto Cloud?                      | No; no se consultó ni escribió Cloud.                                                                    |
| ¿Conviene mantener el namespace?                                         | Sí como candidato reservado, pendiente de prueba real.                                                   |
| ¿Hay que implementar ahora el contrato v2 o un hook?                     | No para responder a la compatibilidad del identificador.                                                 |
| ¿Se puede ejecutar ya el lote QA?                                        | No: permanecen pendientes el ensayo Auth y los controles/revisión/autorización del lote correspondiente. |
| ¿Qué se modificó?                                                        | Solo este documento; ningún código, dato, UUID o configuración.                                          |

**Cierre:** se aclaró la viabilidad por fuentes y se confirmó la falta de un entorno local utilizable; no se simuló una aprobación del proveedor. Se detiene el trabajo sin nuevas migraciones, módulos o cambios remotos.
