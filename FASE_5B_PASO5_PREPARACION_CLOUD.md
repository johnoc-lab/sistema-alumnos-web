# Fase 5B — Paso 5: preparación del aprovisionamiento QA Cloud

Fecha: **4 de noviembre de 2026**, America/Lima. Proyecto: SistemaAlumnos-Web. Rama comprobada: **feature/supabase-auth**. Presupuesto: S/ 0.

**Resultado:** destino, historial, dos identidades y ausencia de colisiones verificados mediante lecturas reales de Cloud. Se prepararon el manifiesto privado con UUID estables, un adaptador SQL separado y las consultas posteriores. **22/22 pruebas locales del adaptador aprobadas en PostgreSQL embebido 18.6 y 41/41 pruebas del preparador con archivos temporales sintéticos; lint aprobado.**

**El lote no está aprobado ni se ejecutó en Cloud. La preparación queda detenida antes de cualquier escritura:** faltan evidencia de control de los contactos, cierre del manifiesto, autorización final y revisión del canal de ejecución/validación nativa PG17. La elección de roles ya está expresamente realizada por el usuario; no requiere volver a inferirla del correo o del login.

## 1. Referencias y límites de la evidencia

Se revisaron FASE_5B_PASO2_APROVISIONAMIENTO.md, FASE_5B_PASO3_GUION_QA.md, FASE_5B_PASO4_MFA.md, FASE_4C_MIGRACIONES_CLOUD.md y las cinco migraciones. Para tipos, restricciones y triggers prevalece el SQL aplicado.

Se distinguen tres fuentes:

- **Observación remota actual:** catálogos y SELECT limitados, mediante CLI con --read-only y referencia explícita. No se ejecutó DML/DDL, seed, migración, repair o reset.
- **Información comunicada por el usuario:** login manual satisfactorio de ambas cuentas; Auth desactivado de nuevo y AUTH_FLOW_SECRET reemplazado. No se inspeccionó .env.local ni se observaron independientemente esas sesiones del navegador.
- **Ensayo automatizado local:** sustitutos Auth/Storage en PGlite, sin SDK remoto, cuentas reales, contraseñas o semillas MFA. No equivale a un login, MFA o prueba RLS real de Cloud.

No se cambiaron Next.js, variables privadas, las cinco migraciones, Vercel, GitHub o Apps Script. No hubo commit, push o deploy. La demo mantiene su implementación independiente. El repositorio ya contenía cambios locales de fases anteriores; no se atribuyen a este paso.

## 2. Destino e historial verificados

| Comprobación                                       | Resultado observado                                                        |
| -------------------------------------------------- | -------------------------------------------------------------------------- |
| Enlace local supabase/.temp/project-ref            | rnxgrunnrdlgjsbsrjev, coincidencia exacta                                  |
| Proyecto de la CLI                                 | sistema-alumnos-dev; linked=true; ACTIVE_HEALTHY                           |
| Organización de infraestructura                    | johnoc-lab, ID kpujkesuxmzmxbxiuuzv                                        |
| CLI                                                | 3.0.0; sintaxis db query revisada con help                                 |
| Motor remoto                                       | PostgreSQL 17.11, server_version_num=170011; release informada 17.11.0.011 |
| Contexto efectivo de SELECT                        | supabase_read_only_user, base postgres                                     |
| Versiones en supabase_migrations.schema_migrations | Exactamente las cinco esperadas, sin adicionales                           |

La etiqueta de entorno de la CLI es production, como en Fase 4C. El destino verificado sigue siendo el proyecto de desarrollo identificado por nombre, organización y Ref; no se seleccionó otro proyecto ni se modificó esa etiqueta.

Lectura del catálogo: 2026-11-04T05:35:12.468859+00:00. Las siguientes huellas locales coinciden con las aprobadas en Fase 4C; el historial remoto acredita versiones, no una nueva comparación byte a byte del cuerpo remoto:

| Migración                         | SHA-256 local aprobado                                           |
| --------------------------------- | ---------------------------------------------------------------- |
| 20261102090000_domain.sql         | d1ece5bcdb48ba1773089d826b418cbbbd60fd731646f0a9fea201bbf30677b8 |
| 20261102091000_private_tables.sql | 9ec4d34a58b8a2bc9ce75368c5dd7cde47ee76bf1a1db8b43ad2c65dd178fbc0 |
| 20261102092000_integrity.sql      | bcd42f3addb3dd52fade2f8778a701154b8b5b09a73051631e58a21a4224be74 |
| 20261102093000_rls.sql            | 299b02d8347bd166489c884fae22cc2cd7efde0656241450f6d523067116e488 |
| 20261102094000_rpc_storage.sql    | 876ee44654427024d88b00edf83cf5c99f3c7cb2b8027133592091ad539f5cfe |

## 3. Estado actual de los dos usuarios y las tablas

Observación de usuarios y tablas: **2026-11-04T05:36:15.679346+00:00**. Solo se consultaron id, email, email_confirmed_at, is_anonymous, banned_until y deleted_at para los UUID solicitados; no se leyeron contraseñas, tokens o metadata completa.

| Rol elegido por el usuario | Auth UUID                            | Resultado                                                                                     |
| -------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------- |
| Admin QA                   | 9eeeb988-f329-439d-b4b4-0f54cc1318d7 | Existe; correo coincide con prueba@correo.com; confirmado el 2026-11-04T05:19:56.926163+00:00 |
| Alumno QA                  | db59e5dd-1810-4627-bb45-4c7efc242a8c | Existe; correo coincide con john@correo.com; confirmado el 2026-11-02T23:09:58.501941+00:00   |

En ambas cuentas: is_anonymous=false, banned_until=NULL, deleted_at=NULL. El estado habilitado observado solo resume esos campos; no acredita titularidad del buzón ni garantiza la validez de una sesión futura. No se modificaron ni confirmaron usuarios. No se inspeccionaron factores MFA.

**Email confirmado y login con contraseña no prueban por sí solos el control del buzón.** El origen/método de confirmación y la evidencia de titularidad no se han acreditado. No se convirtió email_confirmed_at en verified_at del aprovisionamiento. Los logins reales se registran como éxito comunicado por el usuario, no como prueba independiente de Codex.

| Comprobación                                                                                              | Resultado actual                                                     |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Perfiles vinculados a ambos UUID                                                                          | Ninguno                                                              |
| Membresías de esos perfiles                                                                               | Ninguna                                                              |
| Solicitudes privadas de activación de esos UUID                                                           | Ninguna                                                              |
| Organización con slug qa-sistema-alumnos-01                                                               | No existe                                                            |
| Conteos organizations / profiles / organization_memberships / identity_activation_requests / audit_events | 0 / 0 / 0 / 0 / 0                                                    |
| RLS en las cinco tablas participantes                                                                     | Habilitada en todas                                                  |
| Triggers requeridos                                                                                       | Los 17 presentes y habilitados en modo origin                        |
| Restricciones de administrador                                                                            | Triggers de constraint diferidos; activation_profile_match inmediato |

Una segunda consulta SELECT a las **2026-11-04T05:43:42.494582+00:00** comprobó las doce posiciones UUID reservadas: cero colisiones en organización/slug, perfiles/vínculos, membresías, solicitudes/claves y marcadores de auditoría. Esto no reserva filas ni bloquea futuras altas; se deberá repetir inmediatamente antes de una ejecución autorizada.

No se repitió el inventario completo de permisos, RPC, Auth/Storage o de las 23 tablas de Fase 4C. No se confunde ese antecedente con una auditoría exhaustiva nueva. Las guardas del adaptador comprueban además el contrato participante en tiempo de ejecución.

## 4. Manifiesto preparado y UUID estables

Ubicación privada: **exports/qa-cloud/approval.pending.json**, bajo exports/ ya ignorado por Git. No contiene contraseñas, tokens, claves o QR. Incluye los contactos proporcionados, snapshots mínimos de cuenta y referencias de evidencia; debe custodiarse como información de control y no adjuntarse públicamente.

El manifiesto contiene un envelope y un bloque de evidencia separado. Solo envelope se suministrará al SQL. La evidencia registra roles elegidos, consultas remotas, login comunicado por el usuario y verificación de buzón pendiente.

| Recurso                                     | UUID estable                         |
| ------------------------------------------- | ------------------------------------ |
| Operación y marcador explícito de auditoría | 0b57989a-4602-4163-86db-ed5a6f9002a3 |
| Organización QA                             | 64407d4f-a4c4-4349-8523-0cb1c1ac40ff |
| Perfil Admin                                | dcece088-4fe7-4a5e-95b6-7707e82b7c3b |
| Membresía Admin                             | 0ef98beb-a0a2-4ba2-8909-01886086b35d |
| Solicitud Admin                             | 4789b8b7-f49b-4925-ab6a-8ec00f93ec12 |
| Clave idempotente Admin                     | 565859b9-4334-464b-b288-cf8a5bf9b6c5 |
| Perfil alumno                               | 90a501bd-891c-408b-a8f0-08824e79b7b0 |
| Membresía alumno                            | 3ee4397c-2868-4a30-a4cc-6e05722a86f8 |
| Solicitud alumno                            | 6a64a5db-301f-46ad-9a63-7865d0fa8752 |
| Clave idempotente alumno                    | bde6a1dd-c7b3-480c-9cca-c49c469632aa |

Sumados los dos UUID Auth, son doce posiciones distintas y canónicas. Se generaron una sola vez; repetir el preparador conserva el manifiesto. Se comprobó estabilidad de archivo y UUID al repetirlo.

Propuesta: QA Sistema Alumnos, slug qa-sistema-alumnos-01, zona America/Lima; etiquetas sintéticas QA Administrador y QA Alumno. El UUID Auth administrativo aparece primero con role=admin y el alumno después con role=student. No se deriva ningún rol del dominio del correo ni de la organización de infraestructura.

Campos que permanecen deliberadamente incompletos:

- approval_state=pending; no representa permiso para escribir.
- approval_ref y operator_ref nulos.
- verified_contact y verified_at nulos para ambas personas, hasta acreditar control del contacto por un procedimiento revisado.
- payload_sha256 nulo; se calculará después de cerrar el payload aprobado con la representación canónica de PostgreSQL.
- Evidencia mailbox_ownership pendiente, sin método, referencia o fecha inventados.

La distribución de roles está confirmada. La identidad/contacto verificado y la ejecución final no. El SQL rechaza este manifiesto pendiente. Cuando se cierre la revisión deberá conservarse esta evidencia y emitirse una versión aprobada aparte con los mismos UUID; el preparador pendiente no es una herramienta de aprobación. Si un buzón no está bajo control legítimo, no se marcará como verificado; cualquier cambio de cuenta/contacto requerirá revisión y autorización separadas.

## 5. Adaptador Cloud y diferencias respecto del guion local

Archivos nuevos en supabase/qa/cloud, separados del Paso 3. provision-qa.sql, postcheck-qa.sql y approval.template.json originales conservan sus huellas y no se modificaron.

El preparador local fija la SHA del SQL fuente, genera archivos nuevos, conserva identificadores y comprueba coherencia del lote. Valida snapshots, selección, cuentas, tablas vacías, triggers, UUID, evidencia y estado pendiente tanto al crear como al repetir, antes de escribir salidas. Rechaza un manifiesto ya aprobado o con contactos/operador/hash completados; no lo sustituye. No exige que el snapshot guardado sea reciente ni atribuye una nueva consulta a su repetición. No carga .env.local, SDK, secretos ni cliente de base remoto. El adaptador es un bloque DO sin COMMIT ni conexión; no hay todavía un runner de escritura Cloud.

| Control      | Propuesta Cloud                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Contexto     | postgres, transacción dedicada SERIALIZABLE de escritura, row_security=on, session_replication_role=origin y auth.uid() nulo         |
| Motor        | Rechaza cualquier server_version_num distinto de 170011; si Cloud se actualiza se detiene y se revisa, sin quitar la guarda          |
| Marca local  | No crea ni acepta la tabla temporal de validación local como autorización                                                            |
| Aprobación   | scope=cloud_qa; approval_state=approved; claves exactas y referencias de aprobación/operador no vacías                               |
| Destino/lote | Project Ref fijo, UUID Auth y roles fijados a la elección explícita; coincidencia de operación/hash suministrados externamente       |
| Estado Auth  | Antes de DML comprueba existencia, contacto esperado, confirmación, no anónimo, no baja y no bloqueo vigente                         |
| Datos        | UUID distintos, contacto y fecha válidos, zona válida; RLS y 17 triggers presentes/habilitados                                       |
| Integridad   | Orden de altas del Paso 3, UPDATE con row_version, FK/triggers activos y SET CONSTRAINTS ALL IMMEDIATE antes de registrar éxito      |
| Idempotencia | Marcador operation_id y SHA del payload; repetición exacta sin cambios; estado parcial, colisión o drift detienen el lote            |
| Auditoría    | Marcador explícito con operador/aprobación/hash y firmas de siete filas, más auditoría automática; no copia contactos a ese marcador |

Huellas SHA-256 de los SQL locales propuestos al cierre de este paso (no equivalen a autorización):

| Archivo                | SHA-256                                                          |
| ---------------------- | ---------------------------------------------------------------- |
| provision-qa-cloud.sql | 6b39aee4311c01c6a92d85317c96ed58d89c4ac0030fc746815c3937a9249faf |
| postcheck-qa-cloud.sql | c5931f113150d44ce3b5b32d8174e7cd19a51f5e3d3111c2cd192d56be28875f |

Los GUC qa.cloud_verified_project_ref, qa.cloud_authorized_operation y qa.cloud_authorized_sha256 son controles de coherencia. **No prueban por sí mismos el servidor ni una autorización:** un operador postgres puede fijarlos. El futuro canal deberá verificar la conexión externamente contra la CLI/proyecto aprobado, parametrizar el envelope y aceptar solo la autorización exacta revisada. Esta pieza operativa sigue pendiente; no se propone improvisar pegando JSON o credenciales en comandos.

No se agregaron permisos excesivos, nuevas RPC SECURITY DEFINER, roles PostgreSQL o bypass de triggers. RLS permanece habilitada, aunque el operador privilegiado no sirve para demostrar la autorización de sesiones ordinarias.

## 6. PostgreSQL embebido 18.6 frente a Cloud 17.11

La revisión no identifica una dependencia intencional de sintaxis exclusiva de PG18: se usan PL/pgSQL, JSONB, UUID, hash binario, transacciones serializables y constraints diferidos disponibles en PG17. La documentación oficial confirma [sha256(bytea)](https://www.postgresql.org/docs/17/functions-binarystring.html), [JSONB](https://www.postgresql.org/docs/17/datatype-json.html), [SERIALIZABLE](https://www.postgresql.org/docs/17/transaction-iso.html) y [SET CONSTRAINTS](https://www.postgresql.org/docs/17/sql-set-constraints.html). Es una evaluación de portabilidad, no una ejecución positiva nativa del lote.

La constante JSON anidada usada en una consulta SELECT devolvió la misma representación canónica y SHA tanto en Cloud 17.11 como en PGlite 18.6. No se concluye que esa sola muestra demuestre equivalencia universal de JSONB, collation o planes.

La huella final debe calcularse con encode(sha256(convert_to(payload::jsonb::text,'UTF8')),'hex'); no con JSON.stringify. Se normalizan UTC y DateStyle ISO/YMD para las firmas de filas. Deben revisarse otra vez versión exacta, rol del canal, Auth administrado, locks/serialización y privilegios en el destino antes de aprobar ejecución.

No se encontraron postgres, psql o docker disponibles en PATH. No se descargó ni configuró otro motor. La prueba positiva nativa de PostgreSQL 17.11, sin instrumentación de las guardas, queda pendiente. Tampoco se ensayaron concurrencia multiusuario ni fallos de red/COMMIT incierto en Cloud. No se sustituye esa carencia con una supuesta aprobación.

## 7. Pruebas realizadas y sus límites

```powershell
node scripts/database/prepare-qa-cloud.mjs
node scripts/database/test-qa-cloud-adapter.mjs
node --test tests/database/qa-cloud-preparer.test.mjs
npx eslint scripts/database/prepare-qa-cloud.mjs scripts/database/test-qa-cloud-adapter.mjs tests/database/qa-cloud-adapter-suite.mjs tests/database/qa-cloud-preparer.test.mjs --max-warnings=0
```

Resultado del runner: **22/22**, PostgreSQL embebido **18.6**. ESLint: sin errores ni advertencias en los cuatro scripts nuevos.

Cobertura: cinco migraciones en memoria sin seed; constante canónica PG17; rechazo del SQL Cloud original sobre PG18 antes del DML; alta y repetición sin duplicados; aprobación/contactos/fechas pendientes; GUC de destino, operación y hash contradictorios; UUID y roles invertidos; hash alterado; colisiones de perfil, slug e identidad vinculada; rollback ante fallo tardío con auditoría; rechazo de drift; postcheck de lectura; estados Auth sustitutos inválidos.

Además, **41/41 pruebas nuevas del preparador** con archivos temporales sintéticos comprobaron validación inicial y repetida, byte a byte del manifiesto, snapshots contradictorios/incompletos, cuentas no válidas, colisiones, triggers, cambios de aprobación/contacto/hash, UUID duplicados, JSON corrupto y fuente alterada. Ante esos rechazos no se generaron ni reemplazaron salidas. No se leyeron los datos privados reales para construir esos fixtures.

En la comprobación local final con los snapshots reales guardados se ejecutó dos veces el preparador: el manifiesto mantuvo exactamente sus bytes y UUID; el SQL se conservó y el postcheck solo corrigió el comentario heredado del GUC. No se hizo una nueva lectura remota en esa comprobación.

**Instrumentación explícita:** para los casos positivos se usa una copia en memoria con exactamente tres sustituciones comprobadas: predicado de versión 170011 por la versión embebida y los dos UUID Auth fijados por UUID sintéticos. El archivo de producción conserva la guarda PG17 y los UUID reales. Esos UUID reales no se insertan en el sustituto local Auth. Las filas mínimas de prueba no crean usuarios Supabase ni generan contraseña/sesión/correo.

Estas pruebas no acreditan ejecución real sobre PG17, identidades, login, MFA ni RLS con sesiones normales. El Paso 3 documenta sus 36 pruebas locales previas, incluida protección del último administrador; no se presentan como una nueva ejecución Cloud en este paso. Los tests/build de Next.js no se repitieron porque no se cambió su código funcional; los resultados del Paso 4 son antecedentes separados.

## 8. Consultas y verificaciones posteriores preparadas

Se entregan probe-readonly.sql y state-readonly.sql como SELECT reproducibles; fueron ejecutados con Supabase CLI 3.0.0:

```powershell
npx supabase db query --remote=rnxgrunnrdlgjsbsrjev --read-only --file supabase/qa/cloud/probe-readonly.sql --output-format json --log-level error
npx supabase db query --remote=rnxgrunnrdlgjsbsrjev --read-only --file supabase/qa/cloud/state-readonly.sql --output-format json --log-level error
```

La CLI envuelve la lectura y rechaza BEGIN en el archivo, incluso BEGIN READ ONLY. Un primer intento con esa envoltura fue rechazado por el validador antes de ejecutar el SQL. Se corrigió la consulta a SELECT y se conservó --read-only. No se convirtió el error en permiso para escribir.

postcheck-qa-cloud.sql está preparado **para después de una ejecución autorizada**. No se ejecutó en Cloud. Con envelope aprobado y contexto READ ONLY/UTC/ISO comprueba huella válida, firmas sin cambios, organización activa, dos perfiles activos/vinculados, dos membresías activas con roles exactos, dos activaciones linked, marcador y RLS de las cinco tablas. Su resultado declara is_authentication_test=false.

Las pruebas con sesiones normales continúan pendientes:

1. Alumno: solo identidad/membresía propias y organización QA válida; denegación del panel, RPC administrativas y filas ajenas; ausencia de matrícula no concede cursos.
2. Admin aal1: puede llegar a configuración propia de MFA con perfil/membresía/organización activos; panel y RPC siguen denegados hasta aal2.
3. Admin con TOTP realmente verificado: comprobar claims frescos aal2 y alcance exclusivo a QA, con autorización separada para enrollment/challenge reales.
4. Sesión ausente, perfil/membresía suspendidos y organización ajena: denegaciones. Las pruebas que necesiten otra organización o mutar estados requerirán aprobación específica; no están incluidas en este lote.

No usar postgres/service_role ni claims fijados manualmente para atribuir éxito a RLS del navegador. No probar RPC mutantes como si fueran una comprobación de lectura.

## 9. Alcance exacto de una futura escritura

Sujeto a cerrar el manifiesto y a autorización posterior sobre su SHA final, **una sola transacción** para este proyecto y UUID comprendería:

1. INSERT de una organización QA suspended.
2. INSERT de dos perfiles pending, sin adjudicar identidades automáticamente.
3. INSERT de dos membresías invited, con admin/student explícitos.
4. INSERT de dos solicitudes privadas verified, con evidencia de contacto ya acreditada.
5. UPDATE de ambos perfiles a active y vínculo con los UUID Auth aprobados; UPDATE de las dos membresías a active y solicitudes a linked.
6. UPDATE de QA a active, una vez cumplido el administrador válido, y comprobación de todas las restricciones.
7. INSERT de un marcador explícito de auditoría, además de los eventos automáticos de los triggers existentes.

Total de entidades de negocio: **1 organización, 2 perfiles, 2 membresías y 2 solicitudes**. Un reintento exacto solo admite no-op; no se adopta estado parcial ni se reactiva información cambiada.

La autorización futura no incluirá usuarios, confirmaciones, contraseñas o factores Auth; nuevas migraciones/DDL/roles/grants; cursos, matrículas o contenido académico; archivos/buckets; Vault; seed/reset/repair; cambios de .env.local, activación automática de Auth, Vercel, GitHub, Apps Script, push o deploy. Tampoco habilita invitaciones/recuperación o rebaja aal2.

Ante error: detenerse, ROLLBACK y registrar SQLSTATE/paso sin datos sensibles. Ante pérdida de conexión o resultado de COMMIT incierto: consultar marcador/filas antes de decidir una nueva acción. No reparar, borrar o reintentar automáticamente para forzar éxito.

## 10. Pendientes antes de solicitar la primera escritura

| Pendiente                | Condición para cerrar                                                                                                                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Control de los contactos | Acreditar por separado por UUID mediante procedimiento administrativo verificable; registrar método, evidencia y fecha sin contraseñas/tokens. El login manual y email_confirmed_at no bastan. No requiere contratar SMTP. |
| Manifiesto               | Revisar nombre/etiquetas QA, conservar UUID, completar verified_contact/verified_at respaldados y referencias de operador/aprobación. La elección de roles ya está resuelta.                                               |
| Validación PG17/canal    | Probar el adaptador en PostgreSQL 17 desechable cuando esté disponible y revisar el canal transaccional parametrizado con verificación externa de destino. La limitación actual no debe ocultarse.                         |
| Huellas y revisión       | Calcular el hash canónico final y fijar también la SHA del SQL definitivo; revisar el lote exacto y controles sin instrumentación.                                                                                         |
| Revalidación inmediata   | Ref/nombre/organización, cinco migraciones, versión, cuentas y contactos, RLS/triggers, vínculos y colisiones de todas las claves. Cualquier cambio detiene el proceso.                                                    |
| Autorización final       | Permiso expreso para ese envelope/hash, adaptador y alcance de DML en rnxgrunnrdlgjsbsrjev. La preparación actual no lo concede.                                                                                           |

MFA real y pruebas de acceso positivo se programarán después del aprovisionamiento, con autorización independiente para los cambios de factores que requieran. El Admin creado en PostgreSQL no accede al panel con solo aal1. El modelo mantiene perfil, membresía, organización y MFA como controles separados.

## 11. Archivos nuevos y custodia

| Archivo                                    | Uso                                                        |
| ------------------------------------------ | ---------------------------------------------------------- |
| supabase/qa/cloud/README.md                | Instrucciones, guardas y límites para otro encargado de TI |
| supabase/qa/cloud/probe-readonly.sql       | Catálogo y constante de portabilidad                       |
| supabase/qa/cloud/state-readonly.sql       | Cuentas mínimas, vínculos, colisiones y triggers           |
| supabase/qa/cloud/provision-qa-cloud.sql   | Adaptador propuesto, sin ejecutar                          |
| supabase/qa/cloud/postcheck-qa-cloud.sql   | Verificación técnica posterior preparada                   |
| scripts/database/prepare-qa-cloud.mjs      | Generación local reproducible; conserva el manifiesto      |
| scripts/database/test-qa-cloud-adapter.mjs | Runner sin conexión remota                                 |
| tests/database/qa-cloud-adapter-suite.mjs  | 22 casos en entorno desechable                             |
| tests/database/qa-cloud-preparer.test.mjs  | 41 pruebas de archivos temporales sintéticos, sin red      |
| FASE_5B_PASO5_PREPARACION_CLOUD.md         | Este informe                                               |

Bajo exports/qa-cloud, ignorado por Git: account-selection.json, approval.pending.json, read-only-project.json, read-only-state.json y consulta/resultado de colisiones reservadas. Son evidencia local privada, no archivos de credenciales ni aprobación de escritura. No se imprimieron ni guardaron secretos. No deben incorporarse a un commit con --force.

**Estado final:** las lecturas y la preparación local están completadas dentro de su alcance; el manifiesto y el canal de ejecución están incompletos. No se solicita ni se ejecuta todavía el lote Cloud. Se conservan las cinco migraciones y la ausencia de perfiles, membresías y organizaciones QA observada.
