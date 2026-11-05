# QA Cloud — preparación sin ejecución

Estado del Paso 5: **solo lectura remota y artefactos locales; manifiesto pendiente**. No ejecutar provision-qa-cloud.sql en Cloud. Consultar [informe del Paso 5](../../../FASE_5B_PASO5_PREPARACION_CLOUD.md).

## Archivos

- probe-readonly.sql: SELECT de versión, migraciones, RLS, columnas mínimas Auth y constante JSON/SHA de portabilidad.
- state-readonly.sql: SELECT de los dos UUID elegidos, estado de cuenta, vínculos, slug, conteos y triggers. Su salida incluye contactos; custodiar fuera de Git.
- provision-qa-cloud.sql: propuesta de bloque DO para transacción dedicada SERIALIZABLE; sin conexión, COMMIT, DDL o escrituras Auth. Fija PG 17.11 y UUID/roles del lote. No es una migración.
- postcheck-qa-cloud.sql: SELECT técnico de operador posterior; requiere envelope aprobado en qa.cloud_manifest, transacción READ ONLY, TimeZone UTC y DateStyle ISO/YMD. No acredita RLS de sesiones web.
- ../../../scripts/database/prepare-qa-cloud.mjs: genera los dos archivos anteriores desde el original Step 3 con huella fijada; conserva UUID/evidencia del manifiesto privado. No carga .env, SDK o cliente remoto.
- ../../../scripts/database/test-qa-cloud-adapter.mjs: runner PGlite, sin argumentos ni conexiones remotas. Solo la copia de ensayo en memoria sustituye versión y dos UUID sintéticos.

## Comprobaciones locales

Desde SistemaAlumnos-Web:

```powershell
node scripts/database/prepare-qa-cloud.mjs
node scripts/database/test-qa-cloud-adapter.mjs
node --test tests/database/qa-cloud-preparer.test.mjs
npx eslint scripts/database/prepare-qa-cloud.mjs scripts/database/test-qa-cloud-adapter.mjs tests/database/qa-cloud-adapter-suite.mjs tests/database/qa-cloud-preparer.test.mjs --max-warnings=0
```

El preparador requiere los snapshots privados en exports/qa-cloud y la selección explícita. No produce una aprobación. Valida tanto el alta como la repetición antes de escribir y conserva el manifiesto existente byte a byte. Rechaza manifiestos con aprobación, contacto, fecha, operador o hash ya completados: una futura versión aprobada se revisará y custodiará aparte. Usa la foto guardada e imprime su fecha, sin atribuir una nueva consulta remota. No sustituir contactos verificados con email_confirmed_at ni regenerar UUID para eludir una colisión.

Resultado al cierre: 22/22 comprobaciones SQL en PGlite 18.6 y 41/41 del preparador con archivos temporales sintéticos. No acreditan PG17 nativo, sesiones o MFA reales.

## Solo lectura Cloud

Sintaxis comprobada con Supabase CLI 3.0.0, Project Ref explícito y --read-only:

```powershell
npx supabase db query --remote=rnxgrunnrdlgjsbsrjev --read-only --file supabase/qa/cloud/probe-readonly.sql --output-format json --log-level error
npx supabase db query --remote=rnxgrunnrdlgjsbsrjev --read-only --file supabase/qa/cloud/state-readonly.sql --output-format json --log-level error
```

No añadir BEGIN/COMMIT al SQL enviado por esa CLI: la protección abre su propia transacción de lectura y su validador rechaza BEGIN incluso READ ONLY. No quitar --read-only para sortearlo. No habilitar debug con información de conexión o credenciales.

La segunda consulta muestra campos permitidos de las cuentas solicitadas; no registra contraseñas, tokens, cookies, Authorization o metadata completa. Las lecturas son una foto temporal y deben repetirse antes de solicitar una escritura.

## Contrato de una futura ejecución autorizada

El envelope aprobado se suministrará parametrizado a qa.cloud_manifest. Requerirá referencias de aprobación/operador y hash calculado con PostgreSQL: encode(sha256(convert_to(payload::jsonb::text,'UTF8')),'hex'). No usar JSON.stringify como sustituto canónico.

Además, el futuro canal deberá validar externamente la conexión al Project Ref correcto y suministrar tres atestaciones de coherencia locales a la transacción: qa.cloud_verified_project_ref, qa.cloud_authorized_operation y qa.cloud_authorized_sha256. Esos GUC son modificables por el operador; no prueban la identidad del servidor ni la autorización por sí mismos. No se entrega ahora un runner de escritura remota.

La futura transacción exige postgres, SERIALIZABLE, row_security=on, session_replication_role=origin, auth.uid() nulo, RLS/triggers disponibles y el contrato completo. El operador postgres es privilegiado; esta operación no prueba los permisos de un alumno/Admin normal.

Ante cualquier discrepancia o error: ROLLBACK y revisión. No desactivar triggers/RLS, no reset/repair, no adoptar datos parciales, no borrar el marcador, no reactivar cuentas que cambiaron ni reintentar automáticamente 40001. El no-op exige exactamente el mismo envelope y firmas de filas.

El SQL original del Paso 3, sus pruebas y las cinco migraciones permanecen sin cambios. Los datos privados de aprobación y evidencia se guardan bajo exports/qa-cloud, ya ignorado por Git; nunca incluir contraseñas, tokens o claves allí.
