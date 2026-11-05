# Guion QA — validación local

Estos archivos preparan el lote descrito en [Paso 2](../../FASE_5B_PASO2_APROVISIONAMIENTO.md). No son migraciones ni autorización para aplicarlo en Cloud.

## Ejecutar las comprobaciones locales

Desde SistemaAlumnos-Web:

```powershell
node scripts/database/test-qa-provision.mjs
```

El runner crea PostgreSQL PGlite exclusivamente en memoria. Solo importa createEmbedded y migrate, nunca migrateAndSeed ni seed.sql. No acepta argumentos, URLs, credenciales ni destinos remotos y no carga .env.local. Las cinco migraciones se ejecutan sobre el sustituto local de Auth/Storage.

Las dos filas por caso en el sustituto auth.users contienen solo UUID de referencia. No crean cuentas Supabase ni generan contraseña, sesión, JWT o correo. Las consultas RLS fijan claims en ese entorno de pruebas; no acreditan autenticación o MFA reales.

## Archivos

- approval.template.json: plantilla no aprobada, con UUID/contactos/fechas nulos. No contiene ni asigna la identidad existente. Mantener un futuro manifiesto cumplimentado fuera de Git.
- provision-qa.sql: bloque transaccional que exige SERIALIZABLE, RLS/triggers activos, ausencia de identidad de usuario y un marcador temporal local. No tiene COMMIT interno.
- postcheck-qa.sql: SELECT técnico de operador, sin contactos, para comprobar el resultado. Comprueba la huella del manifiesto y las firmas completas de filas. El caller usa BEGIN READ ONLY, TimeZone UTC y DateStyle ISO/YMD. No prueba los permisos de una sesión web.
- tests/database/qa-provision-suite.mjs: casos nuevos y mínimos, generados con UUID aleatorios; no reutilizan el seed histórico.

## Entrada y transacción

El caller de pruebas abre BEGIN ISOLATION LEVEL SERIALIZABLE, fija search_path=pg_catalog y suministra mediante parámetro el GUC local qa.manifest. Ese GUC contiene un envelope con payload y payload_sha256. No interpolar JSON o datos de personas en SQL.

La huella se calcula exclusivamente en PostgreSQL:

```sql
SELECT encode(sha256(convert_to($1::jsonb::text,'UTF8')),'hex');
```

El parámetro es el payload completo. No calcular una huella equivalente con JSON.stringify: jsonb::text tiene su propia representación canónica. El orden de las claves de objetos no importa; el orden de las dos personas sí, Admin primero y alumno después. Todo cambio de valores requiere otra revisión.

El caller ejecuta el bloque, lee qa.outcome (created o already_applied) y confirma. Ante cualquier excepción revierte toda la transacción. No ejecutar el bloque sin esa envoltura. No activar autocommit por sentencia.

## Límites y siguiente autorización

El SQL acepta únicamente scope y approval_state local_validation y exige pg_temp.qa_local_validation_scope. La plantilla pendiente no se puede ejecutar. El runner genera esa marca solo en memoria. Es una barrera contra ejecuciones accidentales, no una prueba criptográfica del entorno frente a un operador dueño.

No se entrega un adaptador con conexión a Cloud. Antes de una escritura remota se necesita: adjudicar dos UUID reales y sus roles; verificar las identidades; revisar el manifiesto y su huella; preparar/revisar el adaptador de ejecución con control del destino y autorización; revalidar cualquier cambio de guardas; y obtener autorización expresa sobre ese guion y lote. No basta con cambiar local_validation por approved ni crear la marca temporal en SQL Editor.

La operación crea QA suspendida, prepara ambos perfiles y membresías, vincula las identidades, marca las activaciones linked y activa QA al final. El Admin sigue sujeto a aal2 en el panel/RPC. Enrollment/challenge y permisos positivos con sesiones reales continúan pendientes.

El marcador de operación usa la PK audit_events.id=operation_id y firmas SHA-256 de las siete filas completas. La repetición exacta no actualiza datos o auditoría; cualquier diferencia posterior detiene el procedimiento. Los hashes evitan copiar contactos a la auditoría, pero no convierten la información de control en pública.

Consultar [FASE_5B_PASO3_GUION_QA.md](../../FASE_5B_PASO3_GUION_QA.md) para resultados y autorizaciones pendientes.
