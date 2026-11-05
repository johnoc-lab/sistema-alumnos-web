# Reporte de actividades — 2 de noviembre de 2026

**Proyecto:** SistemaAlumnos-Web
**Jornada:** 2 de noviembre de 2026, America/Lima
**Rama local:** feature/supabase-auth
**Área de trabajo:** base de datos, seguridad, autenticación e integración web.

Este reporte reúne las actividades documentadas durante la jornada y la revisión local efectuada para su cierre. La cronología sigue las fases de trabajo; no se asignan horas que no constan en la evidencia. La aplicación inicial de Fase 3, fechada el 30 de octubre, se considera un antecedente y no un desarrollo realizado hoy.

Se distinguen resultados comprobados en Cloud, pruebas locales, simulaciones y procedimientos todavía pendientes. Las observaciones remotas corresponden a las revisiones registradas en los informes. Se incorpora además la confirmación posterior del usuario sobre su prueba manual de login real, sin atribuir a Codex una verificación independiente del navegador. Para elaborar y actualizar este cierre no se volvió a consultar Cloud ni se ejecutaron pruebas, migraciones o cambios de configuración.

## 1. Resumen general del día

Se avanzó desde un esquema PostgreSQL probado localmente hasta su aplicación controlada en el proyecto Supabase de desarrollo **sistema-alumnos-dev**, de la organización **johnoc-lab**. Se verificaron identidad del destino, compatibilidad, permisos e integridad de los archivos antes de aplicar cinco migraciones. La revisión posterior confirmó 14 tablas públicas, 9 privadas, seguridad por filas —RLS— en las 23 tablas, 13 RPC públicas de aplicación y las políticas previstas de Storage.

Sobre esa base se implementó localmente la integración de Supabase Auth con Next.js y TypeScript: login, logout, validación de sesión, selector de organizaciones y protección de las páginas de alumnos y administradores. Se conservaron la separación entre organizaciones, la exigencia de MFA administrativo y la independencia de la demo.

Se adaptó el acceso al presupuesto definido de **S/ 0**, dejando el login con contraseña separado de las funciones de correo. La recuperación y las invitaciones permanecieron cerradas mediante controles privados en servidor e interfaz. También se preparó el procedimiento administrativo para una primera cuenta de prueba, sin atribuirle permisos académicos automáticamente.

Se reprodujo y corrigió el error «Origen no permitido» de los formularios nativos sin eliminar la protección CSRF. La última validación de código registró **134 pruebas aprobadas**, lint, comprobación de tipos y compilación correctos. **Posteriormente, el usuario confirmó una prueba manual satisfactoria de autenticación real con su cuenta existente en Supabase Auth: la aplicación mostró el mensaje genérico de ausencia de organizaciones asignadas y denegó el acceso académico por ausencia de perfil o membresía. El error de origen no reapareció en esa prueba.** Este resultado fue comunicado por el usuario; Codex no realizó una verificación independiente del navegador.

## 2. Actividades realizadas, en orden de ejecución

### 2.1. Implementación y comprobación local del esquema — Fase 4

Se implementaron cinco migraciones versionadas para el esquema operativo, tablas privadas de importación y activación, integridad, auditoría, permisos, políticas RLS y operaciones RPC delimitadas.

Se prepararon claves UUID, relaciones por organización, restricciones, índices, control de versiones de registros y reglas para impedir cruces de información entre organizaciones. Se generaron tipos TypeScript a partir de una reconstrucción de la base.

Ante la ausencia de Docker y PostgreSQL nativo, se utilizó PGlite con PostgreSQL 18.6 embebido. En ese entorno desechable se ejecutaron **83 pruebas SQL aprobadas**, con un seed sintético exclusivamente local. Esas identidades ficticias no tenían contraseñas ni constituían cuentas funcionales de Supabase Cloud.

Las pruebas nativas de concurrencia y pgTAP quedaron preparadas, pero no ejecutadas. Esta evidencia inicial no se confundió con la validación de los servicios administrados de Auth o Storage.

Fuente: [FASE_4_BASE_DATOS.md](FASE_4_BASE_DATOS.md).

### 2.2. Preparación, autenticación y vinculación de Supabase CLI — Fase 4B

Se comprobó Supabase CLI **3.0.0** y se consultó la ayuda del ejecutable instalado para validar su sintaxis. Se corrigieron referencias a opciones de otras versiones y se prepararon instrucciones de autenticación y vinculación segura.

La preparación inicial detectó que faltaba autenticar la CLI. Posteriormente, el usuario informó que había completado la autenticación y la vinculación, y la validación posterior confirmó el destino mediante listados de proyectos y organizaciones y la referencia local:

- Proyecto: sistema-alumnos-dev.
- Organización: johnoc-lab.
- Project Ref autorizado: rnxgrunnrdlgjsbsrjev.

Se distinguió entre vincular la herramienta y conectar la aplicación: la vinculación no aplicaba migraciones ni activaba Next.js. No se incorporaron credenciales al repositorio.

Fuentes: [FASE_4B_SUPABASE_CLOUD.md](FASE_4B_SUPABASE_CLOUD.md) y [FASE_4B_VALIDACION_PREFLIGHT.md](FASE_4B_VALIDACION_PREFLIGHT.md).

### 2.3. Verificación de PostgreSQL, permisos y ejecución del dry-run

Se revisaron los resultados del preflight ejecutado por el usuario y se realizaron consultas remotas de solo lectura. Se confirmó PostgreSQL **17.11**, disponibilidad de auth.uid() y auth.jwt(), compatibilidad de la referencia UUID a auth.users y ausencia de colisiones con el esquema académico.

Se detectaron privilegios predeterminados amplios. Antes de aplicar las migraciones, se ajustaron localmente las versiones iniciales para habilitar RLS y revocar permisos generales dentro de sus propias transacciones. Así, las tablas no dependían de esperar a la cuarta migración para quedar protegidas.

Se revisaron las funciones SECURITY DEFINER y las políticas sobre storage.objects. La propiedad efectiva false no se tomó como falta automática de permisos: se verificó el mecanismo administrado supautils.policy_grants que autoriza a postgres a gestionar esas políticas, sin cambiar propietarios ni conceder privilegios excesivos.

También se retiró de las migraciones la creación SQL de buckets administrados y se separó la generación de tipos del seed local. Los buckets quedaron para una futura operación mediante API Storage.

Se ejecutó el dry-run con selección remota explícita y Vault omitido. Mostró exactamente cinco migraciones pendientes, sin seed ni roles adicionales. Se comprobó que aún no había aplicado el esquema. El dry-run se consideró una revisión del plan, no una ejecución de prueba de cada sentencia SQL.

### 2.4. Primera aplicación controlada y validación de seguridad — Fase 4C

Con autorización expresa, se volvieron a verificar Project Ref, huellas SHA-256, historial remoto vacío y las cinco migraciones pendientes. Luego se aplicó exclusivamente el conjunto autorizado:

| Orden | Migración | Responsabilidad |
| --- | --- | --- |
| 1 | 20261102090000_domain.sql | Esquema operativo, catálogos y relaciones principales. |
| 2 | 20261102091000_private_tables.sql | Tablas privadas de importación, trazabilidad y activación. |
| 3 | 20261102092000_integrity.sql | Integridad, triggers, auditoría y versiones. |
| 4 | 20261102093000_rls.sql | Permisos explícitos y políticas por identidad y organización. |
| 5 | 20261102094000_rpc_storage.sql | RPC de aplicación y políticas de Storage. |

La aplicación terminó sin errores. El historial remoto mostró las cinco versiones previstas. Las consultas posteriores confirmaron:

- **14 tablas públicas y 9 privadas, todas con RLS habilitada.**
- **13 RPC públicas de aplicación y 27 funciones privadas** coincidentes con el contrato local.
- **39 políticas**, incluidas **6 sobre Storage**, coincidentes con sus definiciones previstas.
- Coincidencia de **322 comprobaciones de privilegios por tabla/rol** y **2032 por columna/rol**.
- Ausencia de privilegios de superusuario o BYPASSRLS en anon y authenticated.
- Denegación de lectura operativa para anon y de acceso administrativo sin identidad.
- Integridad de los metadatos administrados de Auth y Storage, salvo las políticas de Storage expresamente autorizadas.

En ese momento se comprobaron cero usuarios Auth y cero filas de negocio, perfiles y organizaciones. Solo se incorporaron los catálogos técnicos aprobados: tres monedas y ocho proveedores permitidos. **Estos conteos corresponden a esa verificación y no se presentan como un inventario actual de cuentas después de las pruebas manuales de login.**

No se aplicó el seed local a Cloud, no se importó Google Sheets y no se crearon buckets u objetos. Se identificó además el event trigger del entorno rls_auto_enable; se documentó por separado, sin confundirlo con las RPC académicas ni alterar sus permisos.

Fuente: [FASE_4C_MIGRACIONES_CLOUD.md](FASE_4C_MIGRACIONES_CLOUD.md).

### 2.5. Integración de Supabase Auth con Next.js — Fase 5A

Se creó la rama feature/supabase-auth conservando los cambios locales anteriores. Se implementaron clientes Supabase por solicitud, manejo SSR de cookies, comprobación de usuario y claims, renovación de sesión y respuestas privadas sin caché compartida.

Se desarrollaron:

- Login mediante POST y signInWithPassword en servidor.
- Logout mediante POST, con cierre local y limpieza de cookies propias.
- Redirecciones limitadas a destinos internos permitidos y mensajes genéricos.
- Resolución del perfil, membresías activas y organizaciones activas mediante consultas con RLS.
- Selector que muestra únicamente las organizaciones autorizadas.
- Protección en cada página real de Dashboard y Admin.
- Controles CSRF, límite del cuerpo del formulario, CSP con nonce y cabeceras no-store.

Se mantuvo la distinción entre autenticar una cuenta y autorizar el acceso académico. El login no crea perfiles, membresías o roles. Un administrador requiere rol autorizado y nivel MFA aal2; la interfaz para registrar y verificar ese factor no quedó implementada.

También se prepararon rutas de recuperación, confirmación de enlaces y cambio de contraseña con una prueba firmada ligada a sesión. Su disponibilidad se volvió a evaluar en Fase 5B por las restricciones del correo gratuito.

La demo continuó separada del proxy Auth y de las consultas reales. Los repositorios académicos y operaciones CRUD permanecieron cerrados.

Fuente: [FASE_5A_AUTENTICACION.md](FASE_5A_AUTENTICACION.md).

### 2.6. Configuración de URL y variables del entorno local

La revisión inicial de Fase 5A encontró registro público habilitado y redirecciones incompletas. El usuario realizó después la configuración manual; la revisión de Fase 5B constató registro público y anónimo deshabilitados, confirmación de email habilitada, TOTP habilitado en el proveedor y private fuera de los esquemas expuestos por Data API.

Se dejó como origen local http://127.0.0.1:3000, con Site URL y redirecciones locales para /auth/callback y /auth/confirm. Se documentaron las variables necesarias y el uso de un archivo local ignorado por Git, sin copiar claves o secretos a los informes.

Los controles generales se conservaron desactivados por defecto durante la implementación. Posteriormente, **el usuario informó SUPABASE_AUTH_ENABLED=true para iniciar la prueba local**, manteniendo apagadas recuperación e invitaciones. Ese estado declarado se distingue del valor false por defecto del proyecto. Durante el diagnóstico y este cierre no se cambiaron las variables privadas ni se imprimió .env.local.

### 2.7. Adaptación al presupuesto gratuito — Fase 5B y Paso 1

Se auditó la compatibilidad de los flujos de correo con el proveedor predeterminado de Supabase Free. Según la revisión documentada ese día, existían restricciones de personalización de plantillas, destinatarios limitados a miembros autorizados del equipo y una cuota reducida de envío —dos mensajes por hora por proyecto según la documentación consultada—. No se contrató ni configuró SMTP de pago.

Se identificó que la recuperación PKCE existente no completaba la prueba exigida para cambiar contraseña y que las invitaciones predeterminadas podían devolver sesiones en fragmentos que el servidor actual no procesa. No se declararon resueltos esos flujos.

Se implementaron tres controles privados, cerrados por defecto:

| Control | Función protegida |
| --- | --- |
| AUTH_EMAIL_RECOVERY_ENABLED | Solicitud de correo de recuperación y su callback. |
| AUTH_TOKEN_HASH_RECOVERY_ENABLED | Confirmación de recuperación mediante token_hash. |
| AUTH_INVITATION_ACCEPT_ENABLED | Aceptación de invitaciones. |

Los controles se aplicaron en interfaz, handlers, rutas directas y proxy. Las operaciones desactivadas se detienen antes de enviar correo, verificar OTP o canjear códigos. Se incorporó el propósito recovery/invite a la prueba firmada para impedir que un flujo habilitado reutilice un permiso de otro desactivado.

Login y logout quedaron independientes del correo. El presupuesto S/ 0 se mantuvo como restricción de diseño; no se hizo una auditoría de facturación ni se asumió que las cuotas gratuitas fueran ilimitadas.

Fuentes: [FASE_5B_PLAN_GRATUITO.md](FASE_5B_PLAN_GRATUITO.md) y [FASE_5B_PASO1_LOGIN.md](FASE_5B_PASO1_LOGIN.md).

### 2.8. Preparación de la cuenta sintética y su vínculo académico

Se documentó el procedimiento para una única cuenta QA_AUTH_ONLY, inicialmente sin perfil ni membresía: autorización acotada, buzón controlado, contraseña exclusiva introducida privadamente y alta mediante un operador autorizado, fuera de la aplicación.

La confirmación administrativa individual se condicionó a verificar previamente la titularidad del buzón. No se propuso desactivar la confirmación global, compartir contraseñas, insertar directamente en auth.users o exponer credenciales administrativas en Next.js.

También se diseñó la futura vinculación por UUID, con aprobación explícita de persona, organización y rol, idempotencia y auditoría. No se utilizó el dominio de correo como fuente de pertenencia.

**La confirmación posterior del usuario acredita un login real satisfactorio con su cuenta de prueba existente y el mensaje genérico de ausencia de organizaciones asignadas. No se documenta aquí el procedimiento previo de alta administrativa ni su UUID, ni se contabiliza una creación de cuenta como actividad de este cierre.** La ausencia de acceso académico se registra por falta de perfil o membresía; no se realizó una inspección adicional de esos registros.

### 2.9. Diagnóstico y corrección de «Origen no permitido»

Durante el intento manual de login, el usuario informó un 403 en /auth/login con el mensaje «Origen no permitido».

Se inspeccionaron el formulario, su método POST, el handler, las redirecciones y el validador de origen. Se reprodujo el defecto con Chromium real, un perfil temporal y el componente de formulario y handler originales, usando Auth simulado: la política no-referrer hacía que el formulario nativo enviara Origin: null, aunque Sec-Fetch-Site fuera same-origin. El servidor lo rechazaba antes de llamar a Supabase.

Se ajustó Referrer-Policy a strict-origin en las páginas Auth y protegidas. Esta política conserva Origin y limita Referer al origen, sin rutas ni parámetros. Se mantuvieron la coincidencia exacta con APP_ORIGIN, el rechazo de orígenes ausentes/nulos/externos y la CSP form-action self. La demo conservó no-referrer.

Se añadieron 16 comprobaciones: cinco de política HTTP, cuatro con Chromium y siete rechazos CSRF. Se verificaron las redirecciones 303 seguidas de GET y los errores genéricos de credenciales, con el proveedor simulado.

**Prueba manual posterior confirmada por el usuario:** después de corregir el error y reiniciar Next.js, se inició sesión satisfactoriamente con la cuenta de prueba existente en Supabase Auth. La aplicación mostró el mensaje genérico de ausencia de organizaciones asignadas y el error «Origen no permitido» no volvió a aparecer. Se registra como autenticación real satisfactoria y denegación de acceso académico por ausencia de perfil o membresía.

La fuente de este resultado es la comunicación directa del usuario; Codex no observó ni verificó independientemente su navegador. Los cuatro casos automatizados con Chromium conservan su clasificación de pruebas con Auth simulado. El logout real, MFA, los permisos positivos de alumnos o administradores y el CRUD académico no forman parte de la prueba manual confirmada.

Fuente: [DIAGNOSTICO_ORIGEN_LOGIN.md](DIAGNOSTICO_ORIGEN_LOGIN.md).

### 2.10. Revisión del estado local y cierre documental

Para este cierre se consultaron los informes, el estado de Git y los archivos pertinentes de autenticación, autorización, configuración HTTP e integración académica.

Se confirmó localmente:

- Rama feature/supabase-auth.
- Cinco archivos de migración con las huellas SHA-256 aprobadas.
- Referencia local vinculada coincidente con el proyecto autorizado; no se renovó una comprobación remota.
- Existencia del artefacto de build local, coherente con la compilación documentada.
- .env.local excluido por Git, sin consultar su contenido.
- Cambios funcionales y documentos todavía locales, con archivos modificados y no versionados.
- Repositorios académicos aún deshabilitados y corrección de Referrer-Policy presente.

El diff respecto de Git contiene trabajo acumulado de varias fases; no se atribuyeron todas sus líneas exclusivamente al último diagnóstico ni se usaron sus cifras como medida de trabajo del día.

El único archivo creado y posteriormente actualizado durante este cierre es REPORTE_ACTIVIDADES_2026-11-02.md. La actualización incorpora el resultado manual comunicado por el usuario. No se repitieron pruebas, no se accedió a Cloud y no se modificaron código, configuraciones, usuarios o contraseñas.

## 3. Herramientas utilizadas y plataformas sin cambios

| Herramienta o servicio | Uso real y estado durante la jornada |
| --- | --- |
| Next.js y React | Desarrollo local de formularios, rutas, protección SSR, cabeceras y compilación. No hubo despliegue de estos cambios. |
| TypeScript | Tipado de clientes, identidad y permisos; comprobación estática y tipos derivados del esquema. |
| Supabase Cloud | Proyecto de desarrollo donde se aplicó y verificó el esquema autorizado. Auth quedó integrado localmente; el usuario confirmó después un login real satisfactorio con denegación de acceso académico por ausencia de perfil o membresía. |
| Supabase CLI 3.0.0 | Ayuda, autenticación/vinculación, inventarios, dry-run, aplicación autorizada y consultas de verificación. No se usó para modificar Cloud durante el cierre. |
| PostgreSQL y SQL | Migraciones, restricciones, triggers, RLS, funciones, permisos y consultas de catálogo. Cloud 17.11; entorno embebido 18.6. |
| PGlite | Reconstrucción y pruebas SQL locales sin Docker, con sustitutos de Auth/Storage. No reemplaza sus servicios HTTP reales. |
| Supabase Storage | Políticas creadas y verificadas. Buckets, carga y descarga real pendientes. |
| PowerShell, Node.js y npm | Ejecución local de CLI, scripts, comprobaciones de archivos, pruebas y build. |
| VS Code | Entorno local del proyecto presente durante la prueba reportada. No se documentaron cambios de configuración del editor. |
| Vitest, ESLint y compilador TypeScript | Pruebas de aplicación, análisis estático y comprobación de tipos. |
| Chrome/Chromium | Reproducción del POST nativo y regresiones en perfiles temporales con Auth simulado. |
| Git | Creación/uso de la rama y revisión de cambios locales. Los informes no registran commit o push de estas fases. |
| GitHub | Plataforma prevista de repositorio; no se realizaron cambios remotos ni publicación de estos avances. |
| Vercel | Hosting de la demo existente según el contexto y los informes. Permaneció sin cambios de variables ni despliegues de esta jornada. |
| Apps Script y Google Sheets | Sistema de origen preservado; sin modificación ni importación de información durante estas actividades. |

No se contrataron servicios de pago. Las revisiones de costes se limitaron al alcance y las restricciones del plan gratuito; no se accedió a facturación para certificar consumos.

## 4. Problemas encontrados y soluciones

| Problema | Causa o diagnóstico | Solución y límite |
| --- | --- | --- |
| Pila Supabase local no disponible | Docker y PostgreSQL nativo ausentes. | Pruebas SQL embebidas y posterior comprobación real del esquema Cloud; concurrencia nativa y pgTAP permanecieron pendientes. |
| Ejemplos CLI incompatibles | Sintaxis de otras versiones distinta de CLI 3.0.0. | Uso de la ayuda instalada, selección --remote y dry-run con --skip-vault. |
| Exposición temporal por defaults amplios | Las revocaciones y RLS llegaban inicialmente en una migración posterior. | Protección dentro de las migraciones 1 y 2 antes de sus COMMIT; pruebas con defaults amplios. Se corrigió antes de aplicarlas en Cloud. |
| Duda sobre CREATE POLICY en Storage | effective_owner=false no representa las capacidades administradas completas. | Confirmación de supautils.policy_grants; aplicación exitosa sin cambios de propietario ni grants excesivos. |
| Creación SQL de buckets administrados | No era apropiado gestionar sus metadatos mediante las migraciones del proyecto. | Retiro previo a la aplicación; provisionamiento por API aplazado. |
| Registro público y URLs iniciales incompletas | Configuración observada en Fase 5A. | Ajustes manuales posteriores del usuario, corroborados en la revisión de Fase 5B. |
| Recuperación e invitaciones no operativas con el correo actual | Límites Free e incompatibilidades de retorno y prueba de contraseña. | Login separado del correo y tres bloqueos explícitos. Recuperación e invitaciones siguen pendientes, no solucionadas de extremo a extremo. |
| «Origen no permitido» en el formulario local | no-referrer generaba Origin: null en POST nativo. | strict-origin en rutas correspondientes; CSRF estricto conservado y regresión con Chromium. El usuario confirmó que el error no reapareció al iniciar sesión realmente después de reiniciar Next.js. |
| Diferencia en el número total de funciones Cloud | Función de event trigger adicional del entorno. | Identificación y documentación separada; las 40 funciones de aplicación coincidieron. Su revisión adicional quedó pendiente. |

La ausencia de acceso académico para una cuenta sin perfil o membresía es el comportamiento de seguridad esperado, no un error que deba resolverse asignando roles automáticamente.

## 5. Verificaciones y resultados confirmados

### 5.1. Evidencia por entorno

| Verificación | Resultado registrado | Qué demuestra y qué no |
| --- | --- | --- |
| Suite SQL de Fase 4 | 83/83 aprobadas en PostgreSQL embebido, con seed local. | Integridad y autorización SQL con datos sintéticos; no login, firmas JWT ni APIs reales de Storage. |
| Preflight local | 11 comprobaciones iniciales; después 12/12 aprobadas sin seed. | Reconstrucción vacía, protección entre migraciones y diagnósticos. No emula el permiso administrado real de Storage. |
| Tipos derivados | Reproducción local correcta para 14 tablas y 13 RPC. | Contrato de tipos reproducible; no equivale a generar tipos oficiales desde Cloud ni concede permisos. |
| Dry-run Cloud | Cinco migraciones previstas, sin seed ni roles adicionales. | Plan e historial correctos; no ejecución del DDL en esa etapa. |
| Aplicación Cloud | Cinco versiones aplicadas sin errores. | Ejecución real del SQL en PostgreSQL 17.11. |
| Seguridad estructural Cloud | 23 tablas con RLS, 39 políticas, 40 funciones de aplicación y permisos coincidentes. | Contrato remoto conforme al esquema; no navegación positiva de alumnos/Admin reales. |
| Denegaciones Cloud | anon sin lectura operativa; authenticated sin identidad no ve contenido ni es Admin. | Rechazos bajo roles ordinarios, sin crear usuarios de prueba. |
| HTTP local en fases anteriores | 55 rutas y 14 solicitudes Auth aprobadas con Auth desactivado. | Rutas, cierres, cabeceras y respuestas sin credenciales; no login Cloud. |
| Regresión del navegador | Cuatro casos ejecutados con Chromium y SDK simulado. | Origin real del navegador, login/logout simulados y redirecciones POST–303–GET; no credenciales validadas por Supabase. |
| Última suite de aplicación | 134/134 aprobadas, 9 archivos y ninguna omitida en ese equipo. | Pruebas locales; incluye las simulaciones de sesión, permisos y Auth. |
| Último lint, typecheck y build | Aprobados; lint sin advertencias. | Calidad estática y compilación local; no un despliegue. |
| Integridad de archivos | Huellas de migraciones, demo y Apps Script preservadas en las revisiones documentadas. | Preservación del alcance; las cinco migraciones también se cotejaron en este cierre. |
| Login manual posterior al arreglo | Satisfactorio, según confirmación directa del usuario: reinicio de Next.js, login con cuenta existente en Supabase Auth y mensaje genérico de ausencia de organizaciones asignadas, sin repetirse el error de origen. | Autenticación real y denegación de acceso académico por ausencia de perfil o membresía. No fue una verificación independiente de Codex ni una prueba de MFA, permisos positivos o CRUD. |

La suite de aplicación evolucionó de **26 a 75, 118 y finalmente 134 casos** durante las fases. Son versiones sucesivas de la suite, no cantidades que deban sumarse. Las 83 pruebas SQL constituyen una suite diferente y no se repitieron con seed durante la preparación Cloud posterior.

### 5.2. HTTP comprobado después de corregir el origen

En Next.js local se observaron /login con strict-origin y la demo con no-referrer. El endpoint GET /auth/login devolvió 405. Los POST con Origin ausente, null, host local diferente o Fetch Metadata cross-site conservaron el rechazo 403 y no-store.

Un POST del origen correcto con email inválido recibió 303 a /login?notice=invalid. Ese caso comprobó que se superaba CSRF y se alcanzaba la validación de datos; **no intentó autenticar una cuenta**.

No se obtuvo evidencia de entrega de correos, recuperación real, invitación aceptada, TOTP registrado/verificado o aislamiento positivo entre cuentas reales.

### 5.3. Prueba manual real comunicada por el usuario

Después de corregir el error de origen, el usuario confirmó que reinició Next.js, inició sesión con su cuenta de prueba existente en Supabase Auth y recibió el mensaje genérico de ausencia de organizaciones asignadas. El error «Origen no permitido» no volvió a aparecer en esa prueba.

Se registra un resultado satisfactorio de autenticación real y de denegación de acceso académico por ausencia de perfil o membresía. La confirmación procede del usuario y no de una observación independiente del navegador por Codex. No se realizaron consultas adicionales para identificar cuál de esos vínculos faltaba.

Este resultado se añade a las verificaciones automatizadas sin cambiar su naturaleza simulada ni el total de 134 casos. No acredita logout real, MFA, acceso positivo de alumnos o administradores ni operaciones CRUD académicas.

## 6. Actividades pendientes y estado final

| Prioridad | Actividad pendiente | Criterio para considerarla completada |
| --- | --- | --- |
| 1 | Completar las pruebas reales del ciclo de sesión. | Verificar logout, caducidad, renovación y retorno al login sin registrar secretos. El login inicial y la denegación sin perfil o membresía ya fueron confirmados manualmente por el usuario. |
| 1 | Aprovisionar perfiles y membresías de forma controlada. | Vínculos por UUID, aprobación explícita del rol y organización, idempotencia y auditoría; sin automatismos por correo o primer login. |
| 1 | Preparar organizaciones y primer Admin. | Bootstrap coherente con los constraints del último administrador. No activar una organización con solo un alumno ni deshabilitar triggers para sortear la regla. |
| 1 | Implementar interfaz y handlers MFA TOTP. | Enrollment/challenge propios, QR/semilla privados, verificación real y nueva sesión aal2. Panel/RPC Admin cerrados mientras falte ese nivel. |
| 2 | Validar RLS con identidades sintéticas autorizadas. | Pruebas positivas y negativas entre dos organizaciones, roles distintos, suspensión, revocación y acceso a recursos matriculados. Las sesiones administrativas no sustituyen las pruebas ordinarias. |
| 2 | Integrar los módulos académicos. | Consultas y RPC con sesión del usuario para cursos, clases, matrículas, avisos, materiales, calendario, alumnos y certificados. Los módulos actuales siguen protegidos y sin CRUD conectado. |
| 2 | Preparar Storage real. | Buckets privados creados por API con autorización; carga, validación, finalización y descarga probadas contra permisos lógicos. |
| 2 | Completar pruebas técnicas pendientes. | Comparación de tipos oficiales Cloud, pgTAP y concurrencia nativa en un entorno adecuado; revisión separada del event trigger adicional. |
| 2 | Definir recuperación sostenible sin coste. | Flujo autorizado compatible con el proveedor, probado de extremo a extremo. Mientras tanto mantener apagados correo, token_hash e invitaciones salvo prueba específica aprobada. |
| 3 | Importación histórica y calendario. | Extracción sin secretos, conciliación, mapeos e integridad validados, con pruebas sobre el calendario canónico. No se importó Google Sheets. |
| 3 | Login unificado de Impulso e Incubadora. | Protocolo de integración definido y probado, manteniendo membresías por organización y sin depender del dominio del email. |
| 3 | Publicación futura. | Revisión y autorización de configuración, seguridad y condiciones del presupuesto gratuito antes de cambios en GitHub o Vercel. No forma parte de este cierre. |

**Estado al cierre documental actualizado:** esquema inicial aplicado y verificado en el proyecto Cloud autorizado; integración Auth implementada localmente; login real satisfactorio y denegación de acceso académico por ausencia de perfil o membresía confirmados por el usuario, sin repetición del error de origen. Esta confirmación no procede de una verificación independiente de Codex. Recuperación e invitaciones siguen cerradas; MFA administrativo continúa exigido pero sin interfaz operativa; repositorios académicos sin conexión; demo independiente; cambios locales pendientes de gestión de versiones. El último estado de activación local comunicado fue Auth habilitado para la prueba; no se cambió durante el cierre. Permanecen pendientes el ciclo completo de sesión, el aprovisionamiento de perfiles y membresías, MFA, los permisos positivos de alumnos/administradores y el CRUD académico.

## 7. Resumen breve para el reporte de prácticas

Se realizó la preparación y validación de la base de datos de SistemaAlumnos-Web en Supabase Cloud. Se verificaron la CLI, PostgreSQL y sus permisos, y se aplicaron cinco migraciones autorizadas. Se comprobó la creación de 23 tablas con seguridad por filas, 13 funciones RPC públicas y las políticas de almacenamiento previstas.

Se implementó la integración local de Supabase Auth con Next.js y TypeScript, incluyendo inicio y cierre de sesión, protección de rutas y comprobación de identidad, organización y membresía. Se adaptó la autenticación al presupuesto gratuito, separando el login de la recuperación e invitación por correo, que permanecieron desactivadas.

Se diagnosticó y corrigió el error de origen del formulario, conservando la protección CSRF. Se registraron 134 pruebas automatizadas aprobadas, análisis estático, comprobación de tipos y compilación correctos.

Posteriormente, según la confirmación manual del usuario, se inició sesión satisfactoriamente con una cuenta existente en Supabase Auth. La aplicación informó que no había organizaciones asignadas y denegó el acceso académico, sin repetir el error de origen. Este resultado no fue verificado independientemente por Codex. Quedaron pendientes perfiles, membresías, MFA y módulos académicos.

## 8. Explicación personal para exposición

Texto sugerido para la exposición del usuario; la prueba manual descrita en primera persona corresponde a su propia confirmación.

Hoy trabajé en la base de datos y en el acceso seguro del sistema de alumnos. Primero se probó el esquema en un entorno local y después se comprobó que el proyecto de Supabase fuera el correcto y tuviera los permisos necesarios. Con la autorización correspondiente se aplicaron cinco migraciones para crear las tablas y las reglas que separan la información de cada organización.

Después se preparó el inicio y cierre de sesión en Next.js. Una cuenta puede demostrar quién es, pero solo debe entrar a los módulos si tiene un perfil y una membresía autorizados. Para administrar también se exige un segundo factor, cuya pantalla todavía falta desarrollar.

Como el presupuesto es cero, se separó el login del envío de correos. También se corrigió un error del formulario: una cabecera de privacidad hacía que el navegador enviara un origen nulo y el servidor lo rechazara. Se ajustó esa cabecera sin quitar la seguridad.

Las pruebas locales y la compilación terminaron correctamente. Después del arreglo reinicié la aplicación e inicié sesión con mi cuenta de prueba existente en Supabase Auth. Apareció el mensaje genérico de que no había organizaciones asignadas y el error de origen no volvió a presentarse. Eso confirma que pude autenticarme y que la aplicación mantuvo cerrado el acceso académico por falta de perfil o membresía. Esta es mi confirmación manual como usuario, distinta de las pruebas automatizadas y sin una verificación independiente del navegador por Codex.

Falta vincular los perfiles y membresías autorizados, desarrollar y probar MFA, comprobar los permisos positivos y conectar los módulos académicos. Tampoco se confirmó todavía el logout real. No se publicó una nueva versión ni se modificó el sistema Apps Script original.

## Documentos consultados

- [FASE_4_BASE_DATOS.md](FASE_4_BASE_DATOS.md): implementación y pruebas locales de la base, también fechadas el 2 de noviembre.
- [FASE_4B_SUPABASE_CLOUD.md](FASE_4B_SUPABASE_CLOUD.md): preparación, compatibilidad y endurecimiento previo.
- [FASE_4B_VALIDACION_PREFLIGHT.md](FASE_4B_VALIDACION_PREFLIGHT.md): destino, permisos administrados y dry-run real.
- [FASE_4C_MIGRACIONES_CLOUD.md](FASE_4C_MIGRACIONES_CLOUD.md): aplicación y comprobaciones remotas.
- [FASE_5A_AUTENTICACION.md](FASE_5A_AUTENTICACION.md): integración inicial de Auth y protección de rutas.
- [FASE_5B_PLAN_GRATUITO.md](FASE_5B_PLAN_GRATUITO.md): límites gratuitos, aprovisionamiento y estrategia MFA.
- [FASE_5B_PASO1_LOGIN.md](FASE_5B_PASO1_LOGIN.md): separación de login y correo, controles y 118 pruebas.
- [DIAGNOSTICO_ORIGEN_LOGIN.md](DIAGNOSTICO_ORIGEN_LOGIN.md): corrección de Origin, regresiones y 134 pruebas.

**Fuente adicional:** confirmación directa del usuario sobre el reinicio de Next.js, el login real satisfactorio con su cuenta de prueba existente, el mensaje genérico de ausencia de organizaciones asignadas y la ausencia del error de origen en esa prueba. Esta comunicación posterior actualiza el estado del reporte; los informes anteriores conservan la evidencia disponible cuando se redactaron.

Los estados anteriores —CLI inicialmente sin autenticar, base todavía vacía o Auth desactivado durante la implementación— se interpretan en su momento correspondiente y se actualizan con las fases posteriores. El resultado manual comunicado por el usuario se mantiene separado de las pruebas automatizadas y de cualquier verificación independiente de Codex. No se atribuyen resultados de MFA, permisos positivos o CRUD académico a esta prueba.
