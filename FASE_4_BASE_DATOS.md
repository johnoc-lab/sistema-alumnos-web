# Fase 4 — Base de datos y seguridad

Fecha: 2 de noviembre de 2026. Proyecto: SistemaAlumnos-Web.

Se implementaron cinco migraciones versionadas, datos sintéticos, RLS, RPC limitadas, tipos derivados del esquema y pruebas. La base se reconstruyó y probó en PostgreSQL embebido; **todavía no se validó sobre la pila nativa de Supabase** porque Docker no está disponible. No se conectaron proyectos remotos, no se desplegó, no se hizo push y no se importaron datos.

La aplicación conserva sus clientes Supabase deshabilitados, rutas reales cerradas y demo independiente. El Apps Script original y los documentos de las fases 1 y 2 se preservaron: comparación SHA-256 de sus 20 archivos sin diferencias. Los archivos de aplicación y fixtures preexistentes tampoco cambiaron; solo se añadió el tipo generado en src/types. Esta implementación usa MODELO_BASE_DATOS.md como especificación; las diferencias y capacidades pendientes se explican abajo.

## 1. Archivos y entorno

| Archivo                                               | Responsabilidad                                                                                                      |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| supabase/migrations/20261102090000_domain.sql         | Esquema operativo, catálogos privados, restricciones y principales índices.                                          |
| supabase/migrations/20261102091000_private_tables.sql | Staging, procedencia, conciliación, activación e índices de sus relaciones.                                          |
| supabase/migrations/20261102092000_integrity.sql      | Predicados de acceso, triggers, actores, versiones, auditoría e integridad diferida.                                 |
| supabase/migrations/20261102093000_rls.sql            | RLS y grants explícitos; sin acceso directo a tablas privadas.                                                       |
| supabase/migrations/20261102094000_rpc_storage.sql    | Trece operaciones administrativas delimitadas y políticas de Storage.                                                |
| supabase/config.toml                                  | Configuración exclusivamente local; PostgreSQL 17, registro público deshabilitado, solo public expuesto en Data API. |
| supabase/seed.sql                                     | Organizaciones Impulso e Incubadora ficticias y datos académicos reproducibles.                                      |
| tests/database/security-suite.mjs                     | Suite común de integridad, grants, RLS y RPC; cada caso revierte su transacción.                                     |
| tests/database/concurrency-suite.mjs                  | Tres escenarios de conexiones independientes para PostgreSQL nativo.                                                 |
| tests/database/support/embedded-bootstrap.sql         | Dobles SQL de auth y storage para el motor embebido; nunca se aplican a Supabase.                                    |
| supabase/tests/database/001_schema.test.sql           | Ocho comprobaciones adicionales pgTAP para la pila local.                                                            |
| scripts/database/                                     | Diagnóstico, ejecución local, pruebas y generación comprobable de tipos.                                             |
| src/types/database.generated.ts                       | Tipos de las 14 tablas y 13 RPC obtenidos de catálogos de una base reconstruida.                                     |

Dependencias de desarrollo fijadas: Supabase CLI 3.0.0, PGlite 0.5.14 y pg 8.23.1. Se verificó la CLI con su comando de versión. No están disponibles Docker ni los ejecutables PostgreSQL nativos.

PGlite ejecutó PostgreSQL 18.6 real compilado a WebAssembly, en memoria. No es un simulador de SQL, pero su bootstrap de auth/storage sí es una sustitución de servicios administrados. La diferencia con PostgreSQL 17 configurado exige repetir las pruebas nativas antes de integrar.

## 2. Tablas implementadas

Todas las entidades operativas usan UUID; las entidades de organización incluyen claves compuestas y actor de membresía. Las migraciones crean **14 tablas public y 9 private**. El seed añade un marcador privado exclusivo para impedir que la herramienta de pruebas nativas opere sobre una base arbitraria.

| Tabla public             | Finalidad y relaciones                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| organizations            | Tenant, slug único, estado y zona horaria.                                                   |
| profiles                 | Persona global, enlace único y opcional a auth.users; sin contraseñas propias.               |
| organization_memberships | Persona, organización, rol, estado y contacto del tenant.                                    |
| courses                  | Curso, estado editorial, orden, precio/moneda y portada.                                     |
| course_modules           | Módulo dentro de un curso y organización.                                                    |
| lessons                  | Clase, módulo opcional del mismo curso, enlaces y fecha histórica pendiente de conciliación. |
| enrollments              | Membresía y curso, estado, progreso y fechas; una relación por curso/persona del tenant.     |
| announcements            | Avisos del curso con estado y fecha de publicación.                                          |
| materials                | Material de curso/clase; exactamente una URL externa o referencia a archivo.                 |
| calendar_events          | Agenda canónica, curso/clase, intervalo, zona y estado.                                      |
| calendar_event_attendees | Asignación de membresía a evento, única por evento/persona.                                  |
| file_assets              | Registro lógico, propósito, bucket/ruta, estado, tamaño y huella del archivo.                |
| certificate_issues       | Matrícula, número, estado, snapshot histórico y archivo opcional.                            |
| audit_events             | Registro append-only de actor, operación, entidad, campos cambiados y estados.               |

Tablas técnicas privadas aprobadas: migration_sources, import_runs, import_records, import_issues, legacy_id_map, event_source_links e identity_activation_requests. Mantienen FKs de ejecución/origen, mapas tipados por entidad/tenant y validación del enlace de identidad al completar una activación.

Catálogos adicionales privados: currency_codes (PEN, USD, EUR inicialmente) y allowed_resource_hosts. El seed añade private.local_test_environment, sin grants de aplicación. Las tablas integration_identities e integration_organization_links siguen reservadas para una futura decisión del protocolo de integración; no se crearon.

## 3. Integridad y concurrencia

- FK compuesta por organización, y por curso cuando corresponde, para impedir asociaciones cruzadas aunque se conozca un UUID válido.
- Unicidad de slug por tenant, perfil por membresía, matrícula, asignación de asistentes, número de certificado y ruta de Storage.
- Relaciones de negocio con ON DELETE RESTRICT; el borrado de Auth pone a nulo su enlace de perfil sin destruir historial. Un último administrador de una organización activa no puede perder su enlace sin sustituto.
- Estados mediante CHECK; importes numeric no negativos y moneda obligatoria cuando existe precio; progreso entre 0 y 100; fechas coherentes; duración positiva y zonas presentes en pg_timezone_names.
- URLs HTTPS con proveedores permitidos. No se descarga contenido externo. Catálogos y límites de texto/payload deberán revisarse con datos históricos, sin truncamiento silencioso.
- Claves de tenant, relaciones esenciales, timestamps de creación y versiones protegidos por trigger. Los actores se derivan de auth.uid(), nunca del patch recibido.
- row_version se incrementa en servidor. Los cambios RPC reciben la versión esperada; un conflicto genera SQLSTATE 40001. Se debe volver a leer y resolver el conflicto antes de reenviar.
- Creación de evento y asistentes atómica. Los cambios de asistentes bloquean el evento; un evento scheduled requiere al menos una asignación activa al cerrar la transacción. Cada alta/reactivación valida matrícula, curso y membresía.
- Suspender perfil, organización o matrícula corta acceso mediante los predicados, sin eliminar relaciones históricas. Una asignación histórica activa no garantiza acceso si su matrícula deja de ser válida.
- Cambios de administradores bloquean la organización; los constraints diferidos comprueban al último administrador al cierre de transacción. Los cambios globales de perfil bloquean sus organizaciones administrativas en orden estable.
- Certificados emitidos conservan su snapshot, fecha y archivo. Solo avanzan por estados permitidos. La emisión nueva queda bloqueada para usuarios de aplicación hasta definir y validar elegibilidad.
- Auditoría por trigger; registra nombres de campos y estados, sin copiar contactos, payloads ni URLs. Usuarios no pueden insertar, modificar o borrar logs. Un operador dueño sigue siendo una frontera de confianza y puede alterar el esquema: estos controles no sustituyen su custodia.
- Índices para predicados de acceso, listas por tenant/curso, fechas, actores y FKs. No se afirma haber validado su rendimiento con volúmenes productivos.

El payload de staging y snapshots rechaza claves indicativas de secretos, incluso anidadas. Es una barrera adicional: no detecta secretos ocultos en texto libre o bajo nombres arbitrarios. El futuro extractor deberá usar una lista explícita de campos permitidos y excluir credenciales antes de enviar datos.

## 4. Autorización y RLS

La identidad de aplicación se resuelve mediante auth.uid() del JWT validado por Supabase y su enlace único a un perfil activo. Para contenido se exige además membresía activa y organización activa. Un alta Auth aislada no crea perfil autorizado ni membresía. Se rechazan identidades anónimas de Auth.

| Contexto                          | Lectura                                                                                                                                                                                 | Escritura                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| anon                              | Sin datos operativos privados ni RPC.                                                                                                                                                   | Ninguna.                                                                          |
| Autenticado sin membresía vigente | Perfil propio mínimo y diagnóstico de membresías propias; sin contenido.                                                                                                                | Ninguna.                                                                          |
| Alumno                            | Cursos publicados con matrícula active/completed, clases/módulos visibles, avisos publicados y vencida su fecha, materiales autorizados; solo eventos asignados y su propia asignación. | Ninguna en este alcance.                                                          |
| Admin con MFA aal2                | Datos del tenant administrado; perfil global de otros usuarios no expuesto.                                                                                                             | Altas académicas mediante columnas autorizadas y cambios por RPC delimitadas.     |
| Admin sin MFA                     | Solo acceso personal que conceda su matrícula; no administración.                                                                                                                       | Ninguna administrativa.                                                           |
| Operador/importador de confianza  | Fuera de la sesión normal de aplicación.                                                                                                                                                | Bootstrap, asignación de administradores, activación y procesos privados futuros. |

Una persona puede tener membresías en ambas organizaciones. Un Admin de Impulso no administra Incubadora por ese hecho. Dominio del email, slug, parámetros y user_metadata no otorgan permisos. El contacto del alumno es independiente de su identidad Auth.

RLS está habilitada en las 14 tablas públicas y en las tablas privadas. Se revocaron grants generales y defaults inseguros del propietario que aplica estas migraciones. Nuevos objetos creados por otro propietario requerirán la misma revisión. No hay vistas expuestas. profiles limita SELECT por columna y no permite leer auth_user_id.

authenticated no tiene UPDATE, DELETE ni TRUNCATE directo. No puede crear perfiles/membresías ni modificar roles o vínculos Auth. El contacto/estado de un alumno se cambia mediante RPC que exige rol student en el destino y no reemplaza sus matrículas.

### RPC y diferencia respecto del diseño preferente

El modelo prefería SECURITY INVOKER para operaciones académicas cuando fuera suficiente. Aquí se eligieron operaciones SECURITY DEFINER **específicas**, con search_path vacío, nombres calificados, EXECUTE explícito, comprobación de tenant/identidad/MFA, lista cerrada de campos y comparación de versión. Esta decisión impide eludir el control de concurrencia con un UPDATE directo desde Data API.

Las trece funciones públicas son: update_course, update_course_module, update_lesson, update_enrollment, update_announcement, update_material, update_calendar_event, update_file_asset, update_certificate_issue, update_student_contact, set_student_status, create_scheduled_event y replace_event_attendees.

No son un CRUD genérico elevado: cada función modifica únicamente columnas de su entidad y no acepta actor, rol, tenant nuevo o timestamps de sistema como patch. Su propietario debe ser una identidad de despliegue de confianza y ajena a las sesiones web. Los predicados definer privados evitan recursión circular de RLS y solo devuelven acceso/contexto propio; no se exponen mediante Data API. Las funciones de trigger no son invocables por roles web.

### Storage

Se crean tres buckets privados: course-files, certificate-files y organization-assets. Las políticas de storage.objects comprueban el registro lógico y su autorización, además de bucket/ruta. Incluyen guardas RESTRICTIVE para resistir otra política permisiva accidental y denegar escrituras de roles web.

Un alumno solo puede descargar un archivo ready vinculado a material publicado accesible, branding de su organización o un certificado propio issued. La revocación conserva la emisión visible pero cierra descarga. Los archivos sin vínculo autorizado, pendientes o de otro tenant no se habilitan.

No hay flujo de carga, finalización, URLs firmadas ni bytes subidos. La aplicación no puede declarar un archivo ready. El vínculo de un asset course_video con una clase publicada no está definido en el modelo; **su descarga por alumnos permanece denegada** hasta modelarlo explícitamente. Las video_url externas autorizadas de una clase son otra vía ya representada en el esquema.

## 5. Datos de prueba y tipos

El seed local crea dos organizaciones, diez identidades Auth ficticias sin contraseña, diez perfiles, diez membresías (incluida una persona en ambos tenants), cuatro cursos, matrículas, avisos, materiales, archivos lógicos, eventos y un certificado histórico sintético. Los contactos terminan en example.test. No se envían invitaciones ni correos y no se crea un login funcional.

Los UUID son deterministas. El seed está preparado para reconstrucción local y emplea ON CONFLICT para sus datos iniciales; no es una herramienta para restablecer datos modificados ni un importador productivo. Las fixtures TypeScript de la demo no se reutilizan como credenciales ni como base de datos.

database.generated.ts se obtiene de information_schema y pg_constraint/pg_proc de la reconstrucción embebida: columnas, nulabilidad, defaults, relaciones, argumentos y retornos reales. db:types:check verifica reproducción exacta. Es un generador local del proyecto, no una salida atribuida a la CLI oficial. Los tipos describen formas SQL, **no conceden permisos**; Insert/Update pueden listar columnas que el rol web no tiene autorizadas. bigint/numeric se representan como number siguiendo la convención del cliente; revisar precisión si se manejan valores fuera del rango seguro de JavaScript.

Antes de conectar Supabase nativo, regenerar y comparar con su herramienta oficial:

```powershell
npm exec -- supabase gen types typescript --schema public
```

No ejecutar este comando con project-id ni sustituir el archivo sin revisar diferencias. La generación embebida permanece reproducible mediante npm run db:types.

## 6. Evidencia de pruebas

| Comprobación                                  | Resultado                                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Supabase CLI --version                        | 3.0.0.                                                                                    |
| db:doctor                                     | CLI disponible; Docker no disponible; salida 1 esperada. No se intentó iniciar servicios. |
| Reconstrucción desde cero                     | Cinco migraciones y seed aplicados a PostgreSQL 18.6 embebido.                            |
| db:test                                       | 83/83 casos aprobados.                                                                    |
| db:types:check                                | Tipos reproducibles para 14 tablas y 13 RPC.                                              |
| ESLint                                        | Aprobado sin advertencias.                                                                |
| TypeScript                                    | Aprobado.                                                                                 |
| Vitest de la aplicación                       | 26/26 casos aprobados.                                                                    |
| Compilación Next.js                           | Aprobada; rutas existentes conservadas.                                                   |
| Comprobaciones HTTP locales                   | 55/55 rutas: demo, guardias cerradas, cabeceras y 404.                                    |
| Supabase local PostgreSQL 17                  | Pendiente: Docker ausente.                                                                |
| Concurrencia con conexiones independientes    | Tres pruebas implementadas, pendientes de ejecución.                                      |
| pgTAP nativo                                  | Ocho comprobaciones implementadas, pendientes de ejecución.                               |
| Auth HTTP, firmas JWT, MFA real y API Storage | Pendientes; no se simula su validación como éxito.                                        |

La suite SQL usa SET LOCAL ROLE authenticated/anon con roles sin superusuario ni BYPASSRLS. Sus claims se fijan desde el harness de pruebas de confianza; esto prueba autorización en PostgreSQL, no firmas JWT. Los casos de integridad que requieren bootstrap usan dueño explícitamente, y no sustituyen las pruebas de acceso ordinario.

Cobertura: tablas/RLS/grants; FK y unicidad; dos tenants, dos alumnos del mismo tenant y usuario compartido; Admin ajeno/sin MFA; identidades suspendidas/bloqueadas/anónimas/sin membresía; no escalamiento por metadata/patch; publicación, matrícula, eventos/asistentes; contacto sin afectar matrículas; CAS secuencial; último Admin; auditoría; staging sin claves de secretos; mapas y activaciones; archivos y certificados; guardas de Storage ante otras políticas permisivas.

Las pruebas embebidas de Storage insertan únicamente metadatos en tablas sustitutas y revierten la transacción: no escriben objetos reales. Las nativas también usan metadatos sintéticos dentro de transacciones reversibles para comprobar RLS; no deben emplearse para gestionar archivos.

Las tres pruebas simultáneas abren conexiones separadas y observan la espera por bloqueo antes de confirmar: actualización de curso por dos administradores, suspensión concurrente de los dos administradores por operadores y sustitución concurrente de asistentes por dos administradores. Las pruebas de operador se distinguen de las de usuario. La suite restaura las fixtures, pero deja auditoría y aumenta versiones: usar exclusivamente una base local desechable.

## 7. Ejecutar sin Docker

```powershell
Set-Location -LiteralPath 'C:\Users\Delfi\Desktop\SistemaAlumnos-Web'
npm ci --ignore-scripts
npm run db:test
npm run db:types:check
npm run check
```

Estas pruebas no necesitan cuentas, .env ni claves. npm run check agrega las comprobaciones SQL/tipos al pipeline anterior. npm run build sigue compilando únicamente Next.js; no aplica migraciones ni inicia una base durante builds de hosting.

## 8. Ejecutar Supabase local después

Usar una copia local de desarrollo sin supabase/.temp/project-ref y Docker operativo. Los comandos siguientes afectan únicamente a esa pila local; reset destruye y reconstruye su base de desarrollo.

```powershell
npm run db:doctor
npm run db:local:start
npm run db:local:reset
```

Obtener la URL de PostgreSQL local desde la pila propia y establecer LOCAL_DB_URL solo en la sesión de terminal, sin guardarla en archivos ni historial compartido. No se proporciona una contraseña en este documento. La herramienta acepta solo postgres/postgresql, loopback:54322/postgres sin parámetros y exige el marcador del seed antes de ejecutar pruebas.

```powershell
npm run db:test:native
npm run db:test:pgtap
npm exec -- supabase stop
```

Se esperan 83 casos comunes más tres de concurrencia en db:test:native y ocho adicionales en pgTAP; **estos resultados aún no se han obtenido**. Si falla el baseline nativo, no se ejecutan los escenarios simultáneos. Los wrappers rechazan carpetas vinculadas y no admiten --linked, db push o destinos arbitrarios.

La CLI puede mostrar credenciales locales durante start: no copiarlas al repositorio. .temp, .branches y archivos de entorno están ignorados. Mantener el entorno desechable; no introducir datos reales ni reutilizar un proyecto compartido para estas pruebas.

## 9. Problemas, decisiones pendientes y aceptación futura

| Estado                | Hallazgo / siguiente acción                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Confirmado            | Docker ausente; falta validar configuración CLI 3, migraciones, storage administrado y compatibilidad exacta con PostgreSQL 17.              |
| Confirmado            | No hay login ni provisionamiento real. Los clientes y repositorios siguen devolviendo unavailable.                                           |
| Decisión conservadora | Emisión de certificados y finalización de archivos quedan bloqueadas hasta definir elegibilidad y verificador.                               |
| Modelo pendiente      | Falta el vínculo explícito clase/asset de video; se deniega acceso a esos assets por alumno.                                                 |
| Negocio pendiente     | Validar acceso de matrículas completed, paleta, monedas/proveedores, zona histórica y límites de contenido.                                  |
| Operación pendiente   | Retención/consulta de auditoría, política de bajas de Auth, copias y restauración, rendimiento y revisión de propiedad de funciones.         |
| Integración pendiente | Impulso/Incubadora necesitan protocolo de identidad y adjudicación verificada de membresías; no se resuelve mediante dominios.               |
| Importación pendiente | Extractor de campos permitidos, dry-run, conciliación de calendarios, revisión de ambigüedades y conteos; no se implementó ni ejecutó ahora. |

Para conectar un proyecto Supabase **de desarrollo** después de una nueva instrucción:

1. Repetir reconstrucción y suite nativa en la misma versión PostgreSQL que el destino; aprobar los tres casos simultáneos y pgTAP. Investigar cualquier discrepancia con PGlite.
2. Revisar el inventario de grants/policies preexistentes. Esta base inicial supone un destino nuevo y falla ante tablas/buckets conflictivos; no adapta silenciosamente una base existente.
3. Aplicar migraciones mediante un procedimiento de despliegue revisado y con copia de recuperación. No aplicar el seed sintético a entornos con usuarios o información real; no modificar esquemas administrados auth/storage.
4. Generar tipos oficiales y revisar relaciones/contratos. Implementar repositorios reales separados de fixtures y probar consultas con JWT ordinario.
5. Configurar secretos solo en variables privadas del entorno. Nunca enviar credenciales de dueño o service role al navegador ni utilizarlas como cliente normal de negocio.
6. Implementar verificación SSR de identidad, sesión/cookies, caducidad, CSRF/origin para mutaciones y protección de callbacks. Crear activación/invitación auditada e idempotente sin copiar hashes antiguos.
7. Mantener registro público deshabilitado y sin alta automática de Admin. Habilitar y probar MFA real para administradores; los factores locales permanecen deshabilitados hasta implementar ese flujo. Un claim aal2 escrito por las pruebas no demuestra autenticación MFA.
8. Probar revocaciones, enlace de cuenta, invitaciones, recuperación, usuario sin membresía, ambas organizaciones, APIs reales de Storage y permisos desde HTTP.
9. Confirmar que las rutas reales nunca usan fixtures de respaldo y que la demo permanece independiente. Desplegar o publicar solo tras autorización posterior.

Criterio de aceptación actual: esquema y pruebas implementados, reconstrucción embebida aprobada y aplicación sin regresiones. La aceptación para integrar datos reales exige completar la validación nativa y los flujos pendientes; no se declara esta fase lista para producción.

Referencias técnicas consultadas: [Supabase CLI local](https://supabase.com/docs/guides/local-development/cli/getting-started), [RLS de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [políticas PostgreSQL](https://www.postgresql.org/docs/current/sql-createpolicy.html) y [PGlite](https://pglite.dev/docs/).

## Actualización de preparación Cloud — fase 4B

La revisión posterior está en [FASE_4B_SUPABASE_CLOUD.md](FASE_4B_SUPABASE_CLOUD.md). Corrige RLS desde el primer commit, flags de CLI 3 y separa la creación de buckets de las migraciones; ya no se crean buckets al aplicar SQL. La generación de tipos ahora no usa seed. Los resultados anteriores de 83 casos son evidencia histórica: no se repitieron con seed en fase 4B. Para tipos oficiales locales con CLI 3: npm exec -- supabase gen types typescript --schema public (sin --local).
