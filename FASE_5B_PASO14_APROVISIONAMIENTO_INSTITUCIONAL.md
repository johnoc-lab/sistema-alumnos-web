# Fase 5B — Paso 14: aprovisionamiento institucional QA local

Fecha: **4 de noviembre de 2026**, America/Lima. Rama revisada: **feature/supabase-auth**. SistemaAlumnos-Web; destino futuro sistema-alumnos-dev, Ref rnxgrunnrdlgjsbsrjev. Escala 10–50 alumnos, presupuesto S/ 0.

**Resultado:** migración institucional mínima preparada, manifiesto v2 pendiente, adaptador y postcheck separados de v1; **37/37 comprobaciones locales aprobadas en PostgreSQL embebido 18.6** y lint aprobado. El manifiesto no está aprobado y no es ejecutable con sus campos pendientes. No se realizó ninguna operación Cloud, consulta remota o modificación de Auth.

Se revisaron los Pasos 2, 3, 5, 6, 9 y 13 y las cinco migraciones originales. Se conservaron intactos sus archivos, RLS, funciones de autorización, protección del último administrador, Next.js, MFA, demo, variables privadas y Apps Script. No se ejecutaron seed/reset, hook, commit, push o deploy; no se instalaron dependencias o infraestructura.

## 1. Evolución mínima y justificación

La tabla private.identity_activation_requests obligaba a escribir proposed_verified_contact aunque las cuentas institucionales no tienen buzón. El guion v1 además lo interpretaba como correo verificado y lo cotejaba con Auth.email. Rellenarlo con una dirección ficticia mantendría una afirmación ambigua.

La nueva migración agrega solo cuatro columnas, una restricción y un trigger en la tabla privada existente; no crea tablas de usuarios, RPC, módulos o permisos nuevos para clientes.

| Concepto                                 | Representación                                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Identificador de login                   | login_identifier, normalizado bajo cuentas.sistema-alumnos.invalid                                           |
| Confirmación técnica Auth                | Se consulta email_confirmed_at en auth.users; no se copia como prueba institucional ni buzón                 |
| Asignación a probador                    | verification_kind=institutional_assignment; verified_by_ref, verification_evidence_ref y verified_at reales  |
| Ausencia de buzón                        | proposed_verified_contact=NULL en la modalidad institucional; mailbox_status=not_applicable en el manifiesto |
| Registro histórico sin método acreditado | verification_kind=legacy_unspecified, sin inventar evidencia o convertirlo automáticamente a institucional   |

verified_at conserva su columna, pero su significado queda identificado por la modalidad: fecha de asignación institucional, no recepción de correo. No se añade una columna redundante de “buzón verificado”: en esta modalidad no existe tal comprobación.

La rama institucional exige identificador admisible, responsable, referencia y fecha no futura; contacto nulo y linked_at posterior/igual a verified_at cuando existe. La rama histórica conserva contacto obligatorio y los campos nuevos nulos. El trigger rechaza nuevas escrituras verified/linked sin modalidad institucional. Una fila histórica ya existente no cambia por aplicar el DDL; su actualización verificada/enlazada exige adjudicación explícita.

Permanecen los CHECK originales, PK/UNIQUE/FK, idempotency_key y activation_profile_match: linked exige perfil activo y Auth UUID coincidente. No se deshabilitan triggers ni RLS, se modifican propietarios o se amplían grants. La función nueva es SECURITY INVOKER con search_path fijo y ejecución pública revocada.

**Ubicación preparada:** supabase/qa/v2/migrations/20261104170000_institutional_activation.sql. Está deliberadamente fuera de supabase/migrations para no incorporarse a un push accidental o cambiar los cinco archivos históricos usados por los ensayos v1. Es una nueva migración pendiente, no una sexta versión aplicada. Antes de una futura ejecución se revisará/promoverá al mecanismo de migraciones autorizado, conservando su contenido/huella y registrando su aplicación; no aplicarla ad hoc y después reparar el historial.

## 2. Archivos locales nuevos

| Archivo                                                               | Responsabilidad                                                                                   |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| supabase/qa/v2/migrations/20261104170000_institutional_activation.sql | DDL preparado, aplicado solamente al motor desechable                                             |
| supabase/qa/v2/approval.pending.json                                  | Envelope v2 con UUID estables, evidencia de login comunicada y asignación/autorización pendientes |
| supabase/qa/v2/provision.sql                                          | Adaptador institucional; no ejecutado en Cloud                                                    |
| supabase/qa/v2/postcheck.sql                                          | SELECT de operador posterior, preparado y probado localmente                                      |
| scripts/database/prepare-qa-institutional.mjs                         | Generador local sin SDK, CLI, env o conexión remota; conserva manifiesto existente                |
| scripts/database/test-qa-institutional.mjs                            | Runner PGlite sin destinos/argumentos ni seed                                                     |
| FASE_5B_PASO14_APROVISIONAMIENTO_INSTITUCIONAL.md                     | Este informe                                                                                      |

El generador fija la SHA del adaptador v1 revisado y comprueba transformaciones únicas antes de generar v2. No reescribe v1. Rechaza un manifiesto existente incompatible con preparación pendiente, UUID repetidos, roles/identificadores contradictorios o campos de asignación ya cumplimentados. No es una herramienta de aprobación: se conservará el archivo pendiente y se custodiará una copia final aprobada fuera de Git.

Se comprobó que repetir el generador conserva byte a byte manifiesto y SQL generado. No se regenera ningún UUID al repetirlo ni para eludir colisiones.

## 3. Manifiesto v2 y adjudicación

Las dos cuentas son las aprobadas por el usuario. Sus logins satisfactorios se registran como **reported_by_user**, no observación independiente de Codex. El método exacto de confirmación Auth sigue requiriendo registro de operador; no se verificó Cloud en este paso.

| Rol explícito | Login                                    | Auth UUID                            | Perfil propuesto                     | Membresía propuesta                  |
| ------------- | ---------------------------------------- | ------------------------------------ | ------------------------------------ | ------------------------------------ |
| admin         | u-000002@cuentas.sistema-alumnos.invalid | 6cabd8d2-55d0-401c-b4f6-a20040215134 | 5c68dac3-31fe-4a70-a823-45fa69f3c058 | 6e4260d4-b596-4158-8663-91b73a382f7a |
| student       | u-000001@cuentas.sistema-alumnos.invalid | 55d355b9-21d7-46af-8d6d-650a528743eb | 44dd96cb-0732-4760-b0c5-6dfe8de276af | 80e5b784-8c98-481d-9fc7-c761db51b7b9 |

- Operación v2: 2387aa0e-d1c6-4604-ad26-1ddbe0b28b5b.
- Organización: 211f6de1-5f3f-45ac-bbb1-d8363d715d01, slug qa-sistema-alumnos-01, nombre QA Sistema Alumnos, zona America/Lima.
- admin: solicitud be8296d9-c5d8-45da-8ab1-e49647ea47a6; clave idempotente 54705112-8dc9-49c5-af0a-fe14c3e5da22.
- student: solicitud c21b0da4-5a6e-4664-b9d5-328e9055b014; clave idempotente b61d3471-c13e-47a6-94c1-db6d0688050f.

Son UUID nuevos de recursos aún no escritos, separados de la preparación v1 para los sujetos anteriores. El cambio de versión/operación mantiene trazabilidad documental; no se afirma que se reservaron en Cloud.

El payload declara version=2 y scope=cloud_qa_institutional. Conserva **approval_state=pending**, approval_ref/operator_ref y payload_sha256 nulos. Para ambas personas assignment_verified_at, assignment_by_ref y assignment_evidence_ref son nulos: falta acreditar y registrar la asignación a un probador autorizado. Los roles admin/student ya están escogidos, pero no se han asignado mediante membresías.

La fecha institucional nunca se deduce de email_confirmed_at o del mero éxito del login. No se acredita una persona ficticia llamada QA como identidad civil; se adjudica una cuenta sintética a un probador/responsable real, con evidencia mínima y sin documentos personales o credenciales en este archivo.

El payload final incluirá responsable, referencia y fecha en su hash canónico PostgreSQL; los campos de evidencia externos son contexto, no sustituyen esos datos aprobados. No se almacenan contraseñas, claves, cookies, JWT o tokens.

## 4. Adaptador, integridad y postcheck

El caller futuro deberá abrir una transacción dedicada SERIALIZABLE y suministrar el **envelope** mediante parámetro a qa.institutional_manifest. No interpolar JSON en SQL. La huella es encode(sha256(convert_to(payload::jsonb::text,'UTF8')),'hex'), no JSON.stringify.

Se conservan las atestaciones qa.cloud_verified_project_ref, qa.cloud_authorized_operation y qa.cloud_authorized_sha256. Son controles de coherencia modificables por el operador, no pruebas criptográficas del destino. Antes de fijarlos se deberá comprobar externamente proyecto/Ref, conexión real, esquema y autorización exactos. No hay un ejecutor remoto en los archivos nuevos.

Guardas principales:

- Rol postgres, auth.uid() nulo, row_security=on, session_replication_role=origin y server_version_num=170011. Si Cloud cambia de versión se detiene y se revisa, sin quitar la guarda.
- RLS y 17 triggers previos disponibles; restricción institucional validada y nuevo trigger habilitado.
- Manifiesto v2, scope, aprobación, claves exactas, hash, roles, UUID e identificadores concretos. v1, campos heredados o evidencias nulas se rechazan.
- Auth UUID y email coincidentes, cuenta confirmada técnicamente, no anónima, sin baja/bloqueo vigente. Solo SELECT a Auth.
- Ausencia de perfiles/activaciones vinculados a los tres UUID anteriores; no se adoptan ni modifican esas identidades.
- Colisiones por UUID, slug, Auth vinculado, claves idempotentes y marcador; no UPSERT ni adopción de un estado parcial.
- Actualizaciones comparadas con row_version, restricciones inmediatas y SET CONSTRAINTS ALL IMMEDIATE al completar el estado coherente.

Orden preservado: QA suspended → dos perfiles pending → membresías invited con rol explícito → solicitudes verified con evidencia institucional → perfiles vinculados/active → membresías active → solicitudes linked → QA active → comprobación de constraints y marcador de auditoría. El estado invited no envía una invitación.

El marcador utiliza operation_id, hash del manifiesto, aprobación/operador y firmas completas de siete filas. Las referencias institucionales quedan ligadas por esas firmas. La auditoría automática conserva su comportamiento anterior y no copia los valores de los contactos. La repetición exacta devuelve already_applied sin cambios; cualquier drift posterior se rechaza, sin reparar, reactivar o borrar.

El postcheck requiere envelope aprobado y transacción READ ONLY con UTC/DateStyle ISO. Comprueba versión v2, huella, organización activa, dos perfiles vinculados, roles/membresías activos, solicitudes/evidencia, firmas/marcador, RLS de las cinco tablas participantes, nuevo trigger y ausencia de vínculos anteriores. Devuelve is_authentication_test=false: no valida login o MFA.

La ausencia de perfiles Auth antiguos y de activaciones garantiza que las membresías por FK no se adjudican a esos sujetos. Los UUID excluidos son db59e5dd-1810-4627-bb45-4c7efc242a8c, 9eeeb988-f329-439d-b4b4-0f54cc1318d7 y 6d8c8f78-1d3b-43b5-8eb0-638e9d0cd8fa. Sus cuentas y factores permanecen fuera del DML.

## 5. Pruebas y límites

Comandos locales:

```powershell
node scripts/database/prepare-qa-institutional.mjs
node scripts/database/test-qa-institutional.mjs
npx eslint scripts/database/prepare-qa-institutional.mjs scripts/database/test-qa-institutional.mjs --max-warnings=0
```

Resultado: **37/37**, PostgreSQL embebido **18.6**, lint aprobado. Cobertura:

- Cinco migraciones históricas y sexta propuesta en memoria, sin seed; 23 tablas mantienen RLS.
- Fila legacy previa conservada sin inventar evidencia; nuevos enlaces legacy rechazados.
- Archivo Cloud original rechaza PG18 antes del DML.
- v1/scope/aprobación incompatible, responsable/evidencia/fecha nulos, fecha futura, supuesto buzón verificado, roles invertidos, UUID repetidos/ajenos, identificador contradictorio y campo v1 inesperado.
- Destino, operación y hashes runtime/envelope incorrectos; colisión sin adoptar filas.
- Fallo tardío: rollback del lote y de su auditoría.
- Estado Auth sustituto no confirmado, anónimo o bloqueado: denegado.
- Alta, repetición idempotente **entre transacciones** y postcheck READ ONLY.
- CHECK con evidencia nula, protección del último administrador y rechazo de drift.
- Admin aal1, alumno aunque aal2 y Admin en otra organización: INSERT académico denegado por RLS.
- Identidad anterior vinculada: reintento detenido.
- Filas Auth sintéticas completas iguales antes/después; ningún UUID Auth real insertado.

**Instrumentación transparente:** las pruebas positivas ejecutan una copia del SQL en memoria con el predicado de versión adaptado al motor y las apariciones de los cinco UUID Auth sustituidas por UUID sintéticos. El archivo Cloud mantiene PG17.11 y los UUID reales. Las filas en auth.users son anclas del sustituto, no usuarios Supabase. Los claims RLS son simulados; no se verifican firmas del proveedor.

Esto no acredita ejecución nativa PG17, permisos efectivos Cloud, sesiones reales, MFA, envíos o concurrencia entre operadores. No se probó el comportamiento del Send Email Hook ni se lo integró. Los logins manuales anteriores no prueban acceso académico posterior. Tests/lint/build de Next.js no se repitieron porque la aplicación no cambió.

Ante error futuro: rollback, registrar paso/SQLSTATE sin datos sensibles y detenerse. Sin reset, repair, desactivar RLS/triggers, limpiar auditoría o regenerar UUID. Ante COMMIT incierto, consultar marcador/filas antes de decidir una repetición.

## 6. Revisión y huellas locales

Estas huellas fijan los artefactos preparados, no una autorización de ejecución:

| Archivo                                                               | SHA-256                                                          |
| --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| supabase/qa/v2/approval.pending.json                                  | 3158c789ce632f4fb6559158229bc5552f3ddfb172e75f860a24b3b32d504320 |
| supabase/qa/v2/provision.sql                                          | 79f38e4a7b8499abf9ed748eddf136c2b460af419fd5f09d15102483639003c5 |
| supabase/qa/v2/postcheck.sql                                          | b12381c4c2e5ed637fed1453b0de5c931b5164f195e0393c6cf2f4fbc1d4f313 |
| supabase/qa/v2/migrations/20261104170000_institutional_activation.sql | ec70da504805021d7332865048ad3674a90244edef512a9111ddc190124df284 |

La huella del archivo pendiente no es payload_sha256: el hash canónico del payload solo se calculará cuando estén completos y aprobados sus datos. Si se modifica el contenido final, debe revisarse otra vez.

## 7. Pendientes indispensables y secuencia futura

1. Acreditar la asignación de cada cuenta al probador autorizado y completar responsable/referencia/fecha, operador y autorización en una copia privada aprobada. No inventar prueba de buzón, métodos de confirmación o fechas.
2. Revisar/probar migración y adaptador en PostgreSQL 17 nativo y con contrato administrado compatible cuando se disponga del entorno. La diferencia actual no se declara resuelta. Preparar el canal parametrizado y comprobar su contexto postgres.
3. Mediante una autorización posterior de lectura, actualizar destino/Ref, historial y huellas, versión exacta, cuentas/identificadores/estados, ausencia de vínculos con las cinco identidades y colisiones de todos los recursos/slug. No utilizar como estado actual el snapshot del Paso 10: corresponde a un momento anterior al alta de las dos cuentas nuevas.
4. Obtener autorización concreta de **la nueva migración**; promoverla al historial/flujo acordado, aplicarla y verificar columnas/constraint/trigger, sin alterar las cinco originales o reparar historial a ciegas.
5. Calcular/fijar las huellas finales del SQL y payload; obtener autorización separada para el lote de una organización, dos perfiles, dos membresías y dos activaciones con auditoría. Revalidar condiciones inmediatamente antes del DML.
6. Ejecutar el lote en una transacción y luego el postcheck de lectura. Solo después realizar pruebas de acceso con sesiones ordinarias, bajo su alcance autorizado: alumno con pertenencia válida; Admin aal1 denegado al Panel/RPC y configuración propia TOTP accesible; Admin aal2 solo tras verificación real del proveedor. No crear matrículas/cursos ni ejecutar RPC mutantes como prueba de lectura.

El procedimiento no crea usuarios Auth ni modifica los cinco existentes. No habilita Auth en .env.local. Cambios locales de flag, pruebas MFA reales, hook y configuración del proveedor requieren sus propios alcances; no quedan incluidos implícitamente en el lote SQL.

**Solo imprescindible ahora:** evidencia pendiente, revisión PG17/canal, preflight actualizado y las dos autorizaciones (DDL nuevo y DML exacto). La migración no activa el acceso por sí sola. El aprovisionamiento estructural tampoco exige técnicamente un hook: no envía correo. La garantía de bloqueo de correo en el proveedor, pendiente del Paso 13, debe cerrarse antes de habilitar uso académico bajo esa política; no se presenta como satisfecha.

Mejoras pospuestas: recuperación administrativa, panel de altas, operaciones genéricas de segunda membresía, verificación de buzones reales, modalidades adicionales, importaciones/SSO y automatización masiva. El modelo ya admite un perfil para ambas organizaciones; no se añaden cuentas por dominio ni roles globales.

**Cierre:** preparación v2 local completa dentro de sus límites; manifiesto y permisos de escritura pendientes. La evidencia manual de Auth procede del usuario; la seguridad SQL se ensayó solo en el motor desechable. Ninguna escritura Cloud o activación del hook ha ocurrido en este paso.
