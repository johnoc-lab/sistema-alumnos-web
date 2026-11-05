# Fase 5B — Paso 3: guion QA y validación local

Fecha: **3 de noviembre de 2026**, America/Lima.
Proyecto: SistemaAlumnos-Web. Rama: feature/supabase-auth.
Destino previsto para una fase posterior: sistema-alumnos-dev, johnoc-lab, Ref rnxgrunnrdlgjsbsrjev.
Presupuesto: S/ 0.

**Resultado:** procedimiento SQL implementado y validado exclusivamente en PostgreSQL desechable en memoria: **36/36 comprobaciones aprobadas en PostgreSQL embebido 18.6**. ESLint aprobó los dos scripts nuevos, sin advertencias.

No se accedió a Supabase Cloud, no se ejecutó SQL remoto ni seed, no se crearon cuentas Auth y no se adjudicó ningún rol a la cuenta existente. Se mantuvieron intactas las cinco migraciones aplicadas, código de aplicación, demo, configuración privada, Vercel y Apps Script. No se hizo commit, push o deploy.

El guion entregado está limitado deliberadamente a validación local. No existe un adaptador para ejecutarlo en Cloud ni una aprobación para hacerlo.

## 1. Archivos entregados

| Archivo                                                         | Responsabilidad                                                                                                                                      |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [approval.template.json](supabase/qa/approval.template.json)    | Plantilla pendiente de revisión. Roles admin/student explícitos; todos los UUID, contactos, fechas y referencias de autorización sin adjudicar.      |
| [provision-qa.sql](supabase/qa/provision-qa.sql)                | Bloque SQL de aprovisionamiento, validación e idempotencia dentro de una transacción del caller. No es una migración ni crea funciones persistentes. |
| [postcheck-qa.sql](supabase/qa/postcheck-qa.sql)                | Consulta técnica de solo lectura: estructura, vínculos, manifiesto, marcador y firmas completas de las filas.                                        |
| [README del guion](supabase/qa/README.md)                       | Uso local, contrato de entrada, representación canónica y límites para otra persona de TI.                                                           |
| [qa-provision-suite.mjs](tests/database/qa-provision-suite.mjs) | Casos nuevos con datos mínimos y UUID aleatorios, independientes del seed histórico.                                                                 |
| [test-qa-provision.mjs](scripts/database/test-qa-provision.mjs) | Runner que solo crea PGlite en memoria; no acepta destinos ni argumentos.                                                                            |
| FASE_5B_PASO3_GUION_QA.md                                       | Este informe de resultados, pendientes y autorizaciones.                                                                                             |

No se cambiaron package.json ni dependencias. El comando de prueba se ejecuta directamente con Node.

## 2. Manifiesto preparado y controles de entrada

Se propone QA Sistema Alumnos, slug qa-sistema-alumnos-01, zona America/Lima. Es una propuesta, no una organización creada o reservada.

El envelope de entrada contiene:

- **payload:** versión, alcance, estado de aprobación, Project Ref, referencias de autorización/operador, UUID de operación, organización y dos personas.
- **payload_sha256:** huella del payload según la representación canónica de PostgreSQL.

Cada persona tiene UUID Auth, perfil, membresía, solicitud de activación y clave idempotente; rol explícito; etiquetas QA; contacto verificado y fecha de esa verificación. Debe existir exactamente un Admin primero y un alumno después. Las doce posiciones UUID del manifiesto —operación, organización y cinco por persona— deben ser distintas, no nulas y canónicas.

La plantilla conserva scope=pending_review y approval_state=pending, con campos de adjudicación nulos. **El guion la rechaza; no es una autorización ejecutable.** Los fixtures del runner usan local_validation para ambos controles y UUID exclusivamente sintéticos, sin relación con la cuenta que inició sesión realmente.

El SQL rechaza campos inesperados, roles ausentes o invertidos, otra referencia de proyecto, nombres vacíos, zona no válida, contacto no admisible, verificación futura y huellas contradictorias. La aprobación de un contacto no se deduce del formato de email: la titularidad real sigue requiriendo comprobación de operador antes de cualquier lote real.

La huella se define de una sola forma:

```sql
SELECT encode(sha256(convert_to($1::jsonb::text,'UTF8')),'hex');
```

El parámetro es el payload completo. No se usa JSON.stringify como representación para calcular una supuesta huella equivalente. Se probó que reordenar claves de objetos no rompe la repetición; reordenar las personas altera su adjudicación y se rechaza. Las firmas de filas se calculan en UTC/ISO para evitar diferencias entre sesiones.

No se incorporan contraseñas, claves administrativas, cookies, tokens, QR o semillas MFA. Un manifiesto futuro cumplimentado deberá custodiarse fuera de Git.

## 3. Procedimiento SQL implementado

### 3.1. Envoltura y guardas

El caller abre **BEGIN ISOLATION LEVEL SERIALIZABLE**, suministra el envelope mediante un parámetro al GUC local qa.manifest, ejecuta el bloque, lee qa.outcome y confirma. Cualquier excepción provoca ROLLBACK. Se usa una transacción dedicada, sin operaciones de negocio ajenas al lote.

El guion no tiene COMMIT propio. Normaliza search_path a pg_catalog, TimeZone a UTC y DateStyle a ISO/YMD dentro de la transacción. Exige:

- Transacción serializable y de escritura, row_security activo y session_replication_role=origin.
- auth.uid() nulo: contexto de operador, sin hacerse pasar por el nuevo Admin.
- Tabla temporal de validación local con exactamente una marca local_validation.
- Scope y estado local_validation, versión y proyecto esperados.
- RLS habilitada en las cinco tablas participantes, presencia de los 17 triggers requeridos y ausencia de triggers de esas tablas deshabilitados.
- Las dos referencias UUID de Auth disponibles; el propio guion no crea ni modifica identidades.

Estas guardas impiden ejecutar accidentalmente el bloque aislado en otro contexto. Un operador dueño podría fabricar una marca temporal: no se presenta como una prueba criptográfica del servidor ni como autorización de escritura Cloud. No se entrega un cliente PostgreSQL remoto.

### 3.2. Orden del lote

| Orden | Estado y operación                                                                                                     |
| ----- | ---------------------------------------------------------------------------------------------------------------------- |
| 1     | Verificar manifiesto, huella, UUID, contexto y colisiones antes de crear registros.                                    |
| 2     | Crear la organización **suspended**.                                                                                   |
| 3     | Crear cada perfil **pending**, inicialmente sin vínculo Auth.                                                          |
| 4     | Crear las dos membresías **invited**, con roles admin/student y etiquetas QA explícitos. Ese estado no envía correos.  |
| 5     | Crear las solicitudes privadas **verified**, con evidencia adjudicada y clave idempotente.                             |
| 6     | Vincular el perfil al UUID Auth aprobado y ponerlo **active**. Exigir versión inicial y exactamente una actualización. |
| 7     | Activar la membresía y registrar joined_at, comprobando UUID, organización, perfil, rol, estado previo y versión.      |
| 8     | Cambiar la solicitud a **linked**, después del perfil activo/vinculado, con coincidencia de todos los identificadores. |
| 9     | Activar la organización, solo cuando ya exista el Admin válido.                                                        |
| 10    | Ejecutar **SET CONSTRAINTS ALL IMMEDIATE** para comprobar el estado final antes de confirmar.                          |
| 11    | Registrar el marcador de operación y devolver created. El caller confirma una sola vez.                                |

Los triggers generan fechas, actores y row_version. El SQL no escribe manualmente una versión nueva ni falsea una membresía creadora. Los UPDATE de perfiles, membresías y organización exigen una fila afectada; una discrepancia produce conflicto.

El resultado comprende **siete filas principales**: una organización, dos perfiles, dos membresías y dos solicitudes linked, más un marcador de operación y la auditoría automática. No se crean cursos, matrículas, archivos o buckets.

La validez estructural de la organización exige Admin activo, perfil activo y Auth vinculado. **No equivale a MFA completado:** el guard de aplicación y las RPC administrativas siguen exigiendo aal2.

## 4. Idempotencia, colisiones y auditoría

El marcador utiliza **audit_events.id=operation_id** y también request_id=operation_id. La PK evita duplicarlo; request_id por sí solo no es UNIQUE.

Su contenido incluye la huella del manifiesto, referencias de aprobación/operador y firmas SHA-256 de las siete filas completas. Las firmas incluyen versiones y fechas, pero el evento no copia nombres o contactos de los perfiles y solicitudes.

| Situación                                                                           | Comportamiento                                                                    |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Primer lote sin colisiones                                                          | Crea los registros y marcador en la misma transacción.                            |
| Marcador, manifiesto y siete filas sin cambios                                      | Devuelve already_applied, sin DML, nuevos eventos ni cambios de fechas/versiones. |
| Mismo operation_id con otro manifiesto                                              | Rechaza la diferencia.                                                            |
| Filas modificadas después del alta                                                  | Rechaza el reintento; no reactiva ni repara.                                      |
| Valor cambiado y luego restaurado                                                   | La firma detecta la nueva versión/fecha y también rechaza.                        |
| Slug ocupado, UUID en conflicto, perfil Auth vinculado o solicitudes/claves previas | Detiene la ejecución sin adoptar registros existentes.                            |
| Estado parcial sin marcador                                                         | No lo completa ni lo trata como una operación aprobada.                           |

No se usan UPSERT para adjudicar roles/vínculos ni DO NOTHING para ocultar diferencias.

Los eventos automáticos de organización/perfil pueden tener organization_id nulo; se correlacionan por entidad. Las solicitudes privadas se etiquetan importer por el trigger existente y no identifican al operador humano. El marcador explícito aporta esa referencia sin modificar eventos append-only.

Si se pierde la respuesta de una futura confirmación, primero se comprobará el marcador y el contrato. No se repetirá con UUID nuevos. Si se crea una cuenta fuera del lote y falla la vinculación SQL, no existe una transacción distribuida: deberá conservarse su UUID y detenerse, sin duplicar o eliminar cuentas automáticamente.

## 5. Entorno real de las pruebas y comando reproducible

Se utilizó **PGlite 0.5.14 / PostgreSQL 18.6 en memoria**, con createEmbedded() y migrate(db). Es ejecución SQL en PostgreSQL compilado para ese motor embebido; los servicios Auth/Storage son sustitutos locales.

No se invocaron migrateAndSeed, seed.sql, Supabase CLI ni clientes remotos. Al finalizar se cerró y descartó la base. El runner no lee .env.local, no consume claves administrativas y no permite URL/argumentos de destino.

**Anclas técnicas de FK:** los casos insertan únicamente UUID en la tabla auth.users del bootstrap sustituto. No existe un servicio Auth en ese entorno y esas filas no tienen contraseña, proveedor, JWT o capacidad de login. No son cuentas Supabase ni altas administrativas; sirven para comprobar las FKs y el orden de vinculación sin crear identidades reales.

Se volvió a comprobar que psql, postgres y docker no están disponibles como comandos en el entorno. Por ello no se ejecutó PostgreSQL 17 nativo ni concurrencia entre conexiones independientes.

Desde la carpeta SistemaAlumnos-Web:

```powershell
node scripts/database/test-qa-provision.mjs
```

Salida final confirmada:

```text
36/36 comprobaciones; PostgreSQL embebido 18.6.
Sin seed, red o cuentas Auth reales.
RLS usa claims locales simulados; no acredita MFA ni sesiones Cloud.
```

También se ejecutó:

```powershell
npx eslint scripts/database/test-qa-provision.mjs tests/database/qa-provision-suite.mjs --max-warnings=0
```

Resultado: salida 0, sin advertencias. Se dio formato a los archivos nuevos con Prettier. No se repitieron build ni tests de interfaz, ya que este cambio no modifica la aplicación.

## 6. Comprobaciones realizadas

Las 36 comprobaciones agrupan varios escenarios; los rechazos validan SQLSTATE específicos y la ausencia de cambios de datos, no cualquier error de ejecución.

| Área                 | Evidencia obtenida                                                                                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base inicial         | Cinco migraciones reconstruidas sin seed; negocio y anclas Auth vacíos antes de los fixtures.                                                                                      |
| Alta                 | Organización active al final, dos perfiles vinculados, dos membresías active y solicitudes linked; marcador y auditoría sin contactos.                                             |
| Repetición           | Snapshot completo antes/después idéntico en filas, versiones, fechas y eventos.                                                                                                    |
| Canonicalización     | No-op tras cambiar TimeZone/DateStyle o reordenar claves JSON.                                                                                                                     |
| Cambios posteriores  | Rechazo de nombre alterado, nombre restaurado tras un cambio y membresía suspendida; sin reactivación automática.                                                                  |
| Manifiesto y UUID    | Huella incorrecta, otro contenido, UUID duplicados entre identidades/categorías, clave repetida, UUID nulo, roles ausentes/invertidos, scope o aprobación no permitidos.           |
| Plantilla            | El archivo pendiente literal no autoriza ninguna escritura.                                                                                                                        |
| FK e identidades     | Falta de ancla UUID y Auth previamente vinculado: rechazo sin creación/adopción de personas.                                                                                       |
| Colisiones           | Slug ocupado, ID de organización, perfil parcial y clave de activación de otro lote: rechazo y estado conservado.                                                                  |
| Constraints          | Organización active sin Admin, membresía activa sin nombre y solicitud linked antes de vincular el perfil: fallos según las restricciones existentes.                              |
| Rollback tardío      | Trigger de fallo exclusivo del test rechaza el marcador después de realizar DML. Se comprueba reversión de filas **y auditoría**, no solo un rechazo previo al alta.               |
| Último Admin         | Suspender su membresía, bloquear su perfil o quitarle el vínculo Auth falla con 23514; estado íntegro tras rollback.                                                               |
| Guardas de ejecución | Marcador temporal ausente/vacío/duplicado, aislamiento distinto o identidad Auth presente impiden aprovisionar.                                                                    |
| Postcheck READ ONLY  | Resultado correcto; hash de envelope incorrecto detectado; fila alterada detectada sin reparación.                                                                                 |
| RLS local            | Alumno ve su organización/perfil/membresía; Admin aal1 no obtiene administración; Admin aal2 **simulado** ve las membresías de QA y solo su perfil; anon no lee tablas operativas. |

Durante el desarrollo PostgreSQL detectó una referencia ambigua entre una variable users y la relación auth.users. Se corrigió a auth_ids. La revisión independiente también identificó que el primer postcheck era solo estructural; se reforzó para comprobar manifest_hash_valid y contract_unchanged y se probaron sus casos negativos. La suite final pasó después de ambas correcciones.

Se revisó el procedimiento independientemente en lectura, además de ejecutarlo. No se modificó una migración para hacer pasar las pruebas.

## 7. Comprobaciones posteriores preparadas

postcheck-qa.sql se ejecuta en una transacción **READ ONLY**, con el mismo envelope y TimeZone UTC/DateStyle ISO-YMD. Devuelve únicamente indicadores técnicos:

- Huella del manifiesto válida y firmas del contrato sin cambios.
- Organización active.
- Dos perfiles activos y vinculados a los UUID esperados.
- Dos membresías activas con organización, perfil y rol correctos.
- Dos solicitudes linked con UUID y fechas requeridos.
- Marcador asociado a la operación y manifiesto.
- RLS habilitada en las tablas del lote.
- Indicador explícito is_authentication_test=false.

La consulta técnica requiere el contexto de operador porque revisa tablas privadas. No sustituye las pruebas de permisos con la sesión ordinaria de cada persona.

La suite RLS usa roles SQL ordinarios y claims de prueba dentro del bootstrap local. Se comprueba la lógica SQL; **no se afirma haber validado JWT reales, una sesión Supabase, MFA ni acceso académico real**.

## 8. Pendientes y límites

| Pendiente                          | Qué falta comprobar                                                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL 17 nativo               | Repetir la validación del guion en la versión del destino, sin asumir equivalencia completa con 18.6.                                                             |
| Concurrencia nativa                | Dos conexiones, carreras de alta y cambios simultáneos del último Admin. Se probó rechazo secuencial y transacciones serializables, no esas carreras.             |
| Manifiesto real                    | Adjudicar las identidades exactas y sus roles con aprobación; verificar titularidad, email confirmado, estado habilitado y vínculos existentes.                   |
| Adaptador Cloud                    | Selección/verificación del destino, autorización de operación, contexto y ejecución parametrizada. No existe conexión remota preparada para ejecutar este bloque. |
| MFA                                | Implementar enrollment/challenge y obtener una sesión real aal2. Una membresía admin activa no lo resuelve.                                                       |
| RLS con sesiones reales            | Login de las dos personas, selector, permisos ordinarios, rechazo de alumno en Admin, denegación de Admin aal1 y acceso autorizado solo tras MFA.                 |
| Aislamiento completo entre tenants | Segunda organización y filas conocidas, autorizadas aparte. Las filas locales de los fixtures no constituyen QA remotas.                                          |
| Contenido académico                | Cursos, matrículas y demás módulos siguen sin integrarse. El placeholder autorizado no acredita CRUD ni contenido accesible.                                      |

Los 134 casos de aplicación de la fase anterior no se vuelven a contabilizar como ejecutados aquí. El login manual exitoso anterior sigue siendo un resultado comunicado por el usuario, separado de esta validación SQL.

## 9. Autorizaciones exactas antes de cualquier escritura Cloud

Este paso **no solicita ni ejecuta** la aplicación remota. Para avanzar será necesario aprobar:

1. **Destino y lote:** sistema-alumnos-dev / johnoc-lab / rnxgrunnrdlgjsbsrjev; nombre/slug de una organización QA y estado final previsto.
2. **Adjudicación explícita:** UUID Auth del Admin y del alumno, distintos, con aprobación separada de sus roles. La cuenta existente no adquiere ninguno por este documento.
3. **Identidad adicional, si falta:** autorización específica para su alta administrativa, titular, control de buzón y custodia de contraseña. No se crea desde el SQL de aplicación.
4. **Manifiesto cumplimentado:** referencias de aprobación/operador, UUID estables de recursos y claves, contacto legítimamente verificado, fechas, plazo de uso y huella canónica. Custodia fuera de Git.
5. **Guion/adaptador definitivo:** revisar su huella y el cambio de guardas necesario para un contexto remoto. No basta con cambiar local_validation por approved o copiar la marca temporal al SQL Editor. Cualquier adaptación se revisa y prueba antes de solicitar su ejecución.
6. **DML acotado:** una organización, dos perfiles, dos membresías, dos solicitudes y un marcador de operación, más la auditoría automática. Sin seed, cursos, matrículas, buckets, roles extra, Vault ni cambios de permisos.
7. **Revalidación previa:** identidad del proyecto/conexión, cinco versiones aplicadas y huellas intactas, esquema/privilegios/triggers, ausencia de colisiones y estado de las identidades. Sin db push, reset o repair.
8. **Verificación funcional autorizada:** lecturas y sesiones de los titulares. Enrollment MFA, pruebas negativas de mutación, suspensiones y una segunda QA requieren alcances específicos; no se incluyen implícitamente en aprobar las siete filas.
9. **Tratamiento de fallos:** rollback y revisión; ante resultado de COMMIT incierto, leer primero el marcador. Cualquier suspensión o limpieza posterior se autoriza de forma expresa; no borrar auditoría ni desactivar restricciones.

El operador deberá aprobar un resultado concreto y revisado antes de ejecutar, con las incertidumbres nativas documentadas. Este lote local no consume esa autorización futura.

## 10. Integridad y huellas de revisión

Se contrastaron las cinco migraciones con los SHA-256 aprobados en Fase 4C: todas coinciden. La comparación antes/después de los 150 archivos preexistentes protegidos no detectó cambios. Las huellas documentadas de los tres artefactos siguientes también se cotejaron y todos los enlaces locales del informe existen.

Huellas de los artefactos locales ejecutados/revisados:

| Artefacto              | SHA-256                                                          |
| ---------------------- | ---------------------------------------------------------------- |
| provision-qa.sql       | 61aa41d059f6f1ef798ea322c654cea6cf15b0d883e57968a4a85fa2faa04ad1 |
| postcheck-qa.sql       | e901b18e0d76454ec8a1ca6be7672cba4a32930033d4ae32c1ec4c80c137a02a |
| approval.template.json | d14aab1b464d4ef4b4b36e77cc4eeff076a6dabef25473269db0b4568fd307c8 |

Estas huellas identifican esta revisión local; **no** son huellas aprobadas para Cloud ni la huella de un manifiesto con identidades reales.

Referencias: [Paso 2](FASE_5B_PASO2_APROVISIONAMIENTO.md), [Fase 4C](FASE_4C_MIGRACIONES_CLOUD.md), las cinco migraciones de supabase/migrations y el bootstrap de [pruebas embebidas](tests/database/support/embedded-bootstrap.sql).

Estado final: guion local y plantilla preparados; validación SQL desechable aprobada; cuenta real sin nueva asignación; Cloud sin cambios; ejecución remota y autenticación/MFA/CRUD reales fuera de esta evidencia.
