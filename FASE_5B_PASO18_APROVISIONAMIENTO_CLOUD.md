# Fase 5B — Paso 18: aprovisionamiento académico QA Cloud

Fecha: **4 de noviembre de 2026**, America/Lima. Rama: `feature/supabase-auth`.

**Estado: lote confirmado por COMMIT; verificación final incompleta.** La CLI rechazó la llamada al postcheck antes de ejecutar SQL por incompatibilidad entre `--read-only` y el BEGIN explícito del archivo. Se detuvo la operación sin reintentar, reparar ni realizar nuevas escrituras. No se declara aprobado el postcheck.

## 1. Destino y alcance autorizado

- Proyecto: **sistema-alumnos-dev**, Ref **rnxgrunnrdlgjsbsrjev**.
- Organización de infraestructura: **johnoc-lab**, ID `kpujkesuxmzmxbxiuuzv`.
- Estado comprobado antes de escribir: **ACTIVE_HEALTHY**, vínculo local coincidente.
- PostgreSQL: **170011 / 17.11**. Supabase CLI: **3.0.0**.
- Autorización: mensaje del usuario de esta conversación, encabezado **SISTEMA ALUMNOS — FASE 5B, PASO 18 / AUTORIZACIÓN EXPRESA**.

Único alcance DML: una organización QA, dos perfiles, dos membresías con los roles explícitos aprobados, dos activaciones institucionales y auditoría correspondiente. Se revisaron los informes de los Pasos 14–17, los tres artefactos v2 y la sexta migración. No hubo migraciones nuevas ni ejecución del adaptador v1.

## 2. Preflight real

Snapshot inicial: **13:13:08 Lima** (`2026-11-04T18:13:08.643302+00:00`), mediante SELECT remoto con modo de solo lectura.

Historial exacto, conservado después:

```text
20261102090000
20261102091000
20261102092000
20261102093000
20261102094000
20261104170000
```

Comprobaciones satisfactorias:

- Cinco identidades Auth esperadas, con UUID/identificador coincidentes, confirmación técnica y sin estado eliminado, anónimo o bloqueado vigente. No se consultaron contraseñas ni tokens.
- Cero organizaciones, perfiles, membresías, activaciones y auditoría antes de ejecutar. Sin vínculos de las identidades antiguas.
- Cero colisiones de organización/slug, perfiles, membresías, activaciones, claves idempotentes y UUID del marcador. Los doce UUID reservados eran distintos y se conservaron.
- 23 tablas de aplicación con RLS y Storage protegido; 57 triggers habilitados, restricciones validadas y contrato institucional presente.
- Metadatos de RLS, ACL, políticas, funciones, columnas, constraints y triggers iguales al snapshot posterior del Paso 17. Incluye integridad referencial, protección del último administrador y validación de activaciones.
- Seis migraciones locales con sus huellas esperadas; manifiesto pendiente y SQL de provisión/postcheck con las huellas del Paso 14.

El canal administrativo se probó sin DML: transacción SERIALIZABLE READ ONLY como postgres, sin claims Auth, row_security=on, session_replication_role=origin y PREPARE/EXECUTE conservando el parámetro en la misma sesión. No se utilizó Next.js ni el navegador.

## 3. Manifiesto privado y evidencia

Archivos ignorados por Git, comprobados localmente:

- `exports/paso18/assignment-authorization.json`.
- `exports/paso18/approval.private.json`.
- `exports/paso18/review.json`.

Se registró la autoasignación de ambas identidades sintéticas al único responsable/probador declarado. La fecha efectiva de registro es **2026-11-04T18:14:42.746Z**; no se presenta como fecha de creación, login, verificación externa o firma.

Referencia de aprobación: `conversation:user:FASE-5B-PASO18:AUTORIZACION-EXPRESA`, resuelta al mensaje real indicado y al registro privado. Operador técnico: `Codex:ejecutor-delegado-en-esta-conversacion:Paso18`; identifica la ejecución delegada de esta sesión, sin inventar nombre humano o principal administrativo del proveedor.

La evidencia distingue expresamente autoasignación QA, confirmación técnica Auth, logins comunicados por el usuario y ausencia de verificación de persona/buzón. No representa uso productivo. El original `approval.pending.json` conserva exactamente sus bytes, UUID y estado pendiente; la aprobación se materializó únicamente en la copia privada para esta operación.

Hash canónico del payload, calculado con PostgreSQL sobre jsonb::text:

```text
47c758a26fb722b092fb5edbd78cbeb97fb21af5faf714925f558ef10205f987
```

Huellas de los SQL originales ejecutado/preparado, conservados sin edición:

- provision.sql: `79f38e4a7b8499abf9ed748eddf136c2b460af419fd5f09d15102483639003c5`.
- postcheck.sql: `b12381c4c2e5ed637fed1453b0de5c931b5164f195e0393c6cf2f4fbc1d4f313`.

No se reproduce el payload privado completo. La custodia de estos archivos es local; no se añadieron a Git ni se expusieron por la aplicación.

## 4. Transacción ejecutada

Se realizó **un único intento** por Supabase CLI, con Ref explícita y un archivo privado, en una sola solicitud/sesión administrativa. Los valores se suministraron a PREPARE tipado y EXECUTE con literales generados mediante pg.escapeLiteral; no hubo interpolación libre de datos en el SQL ni credenciales en argumentos.

El archivo envolvió el provision.sql original en BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE, estableció las cuatro guardas locales de manifiesto/destino/operación/hash y comprobó otra vez el historial. Se preservaron RLS, triggers y restricciones. El adaptador forzó las restricciones diferibles y el envoltorio exigió outcome=created antes de COMMIT. No se hizo una segunda ejecución para ensayar idempotencia en Cloud.

**COMMIT confirmado:** `2026-11-04T18:17:29.415274+00:00`, **13:17:29 Lima**. El SELECT posterior a COMMIT devolvió commit_acknowledged=true y la operación prevista.

| Recurso del manifiesto ejecutado | UUID |
|---|---|
| Operación/marcador | 2387aa0e-d1c6-4604-ad26-1ddbe0b28b5b |
| Organización qa-sistema-alumnos-01 | 211f6de1-5f3f-45ac-bbb1-d8363d715d01 |
| Perfil alumno | 44dd96cb-0732-4760-b0c5-6dfe8de276af |
| Membresía alumno | 80e5b784-8c98-481d-9fc7-c761db51b7b9 |
| Activación alumno | c21b0da4-5a6e-4664-b9d5-328e9055b014 |
| Perfil administrador | 5c68dac3-31fe-4a70-a823-45fa69f3c058 |
| Membresía administrador | 6e4260d4-b596-4158-8663-91b73a382f7a |
| Activación administrador | be8296d9-c5d8-45da-8ab1-e49647ea47a6 |

Las vinculaciones ejecutadas son exclusivamente alumno `55d355b9-21d7-46af-8d6d-650a528743eb` / student y administrador `6cabd8d2-55d0-401c-b4f6-a20040215134` / admin. El SQL crea inicialmente la organización suspendida y la activa tras enlazar perfiles/membresías y satisfacer la protección del administrador. La revisión independiente final de estos estados mediante el postcheck sigue pendiente.
## 5. Postcheck: rechazo de CLI y detención

Se intentó ejecutar el postcheck original dentro de BEGIN READ ONLY, con el mismo envelope y UTC/DateStyle ISO, usando además `db query --read-only`.

La CLI rechazó el archivo antes de enviarlo a PostgreSQL:

```text
Código CLI: DbQueryReadOnlyStatementError
--read-only only allows SELECT, WITH, VALUES, TABLE, SHOW, EXPLAIN statements (found: BEGIN)
SQLSTATE: no disponible; error local de CLI, no error del servidor.
```

La combinación elegida por Codex es incompatible con el filtro sintáctico de CLI 3.0.0. No significa que PostgreSQL haya rechazado el contrato de activación o que se haya encontrado un fallo en los datos. **Tampoco permite declarar satisfactorio el postcheck: no se ejecutó.**

El rechazo ocurrió después del COMMIT confirmado. No correspondía intentar ROLLBACK del lote ya confirmado ni ejecutar una reversión compensatoria no autorizada. Se detuvo la ejecución remota sin reparar, reaprovisionar o reintentar por otro canal. No se inventó SQLSTATE ni un resultado positivo.

## 6. Lectura posterior ya obtenida

Se había lanzado en paralelo al postcheck un snapshot independiente mediante SELECT, que sí finalizó: **13:17:59 Lima**, `2026-11-04T18:17:59.420153+00:00`. Después del rechazo solo se analizaron archivos locales; no se ejecutaron más consultas remotas.

| Conteo | Antes | Después |
|---|---:|---:|
| Organizaciones | 0 | 1 |
| Perfiles | 0 | 2 |
| Membresías | 0 | 2 |
| Solicitudes de activación | 0 | 2 |
| Auditoría | 0 | 15 |
| Cursos | 0 | 0 |
| Matrículas | 0 | 0 |
| Organización con el slug QA | 0 | 1 |

Los 15 eventos son compatibles con los INSERT/UPDATE auditados del guion y su marcador. La coherencia exacta de las firmas de filas/marcador y de las claves idempotentes debe confirmarse mediante el postcheck pendiente; no se declara validada por el conteo.

La comparación estructural local de snapshots resultó satisfactoria: historial de seis versiones, 23 tablas con RLS, 57 triggers, constraints, columnas, definiciones/ACL/configuración de funciones, ACL de tablas/esquemas, políticas y metadatos de Storage iguales antes/después. Las cinco identidades Auth conservan exactamente los metadatos no secretos comparados; no se hicieron operaciones Auth.

### Tres identidades anteriores

- db59e5dd-1810-4627-bb45-4c7efc242a8c.
- 9eeeb988-f329-439d-b4b4-0f54cc1318d7.
- 6d8c8f78-1d3b-43b5-8eb0-638e9d0cd8fa.

El preflight confirmó que carecían de vínculos y el SQL ejecutado adjudica únicamente los dos UUID institucionales aprobados, sin asignar permisos a estas tres identidades. Sus registros Auth no cambiaron. **La comprobación directa posterior old_identities_unlinked sigue pendiente**, junto con la consulta exacta de los roles/estados finales; no se presenta como observación independiente ya completada.

## 7. Estado final y siguiente paso mínimo

Evidencia local ignorada: `exports/paso18/`, con manifiesto/evidencia privados, huellas, SQL del canal y ejecución, respuesta de COMMIT, rechazo CLI, snapshots y comparación local. No contiene contraseñas, claves, sesiones o tokens. El archivo de ejecución queda marcado como intentado una vez para evitar un reintento automático.

No hubo cambios en las seis migraciones, usuarios Auth, confirmaciones, contraseñas, sesiones, MFA, SMTP/Send Email Hook, RLS o permisos de esquema. Las dos membresías académicas creadas son exactamente el alcance DML autorizado. No se ejecutaron seeds, reset, repair, operaciones destructivas, nuevas migraciones, altas de cursos/matrículas/materiales, cambios de .env.local, activación de Auth, Next.js, Vercel, GitHub o Apps Script. No hubo commit de Git, push, deploy ni pruebas de login/TOTP.

**Pendiente inmediato:** revisar la incompatibilidad de invocación y autorizar continuar exclusivamente con la verificación de lectura. El mismo archivo privado conserva BEGIN READ ONLY y el postcheck original; un canal administrativo que admita el batch transaccional puede ejecutarlo manteniendo la protección READ ONLY en PostgreSQL, como demostró el ensayo inicial de canal. No quitar BEGIN READ ONLY ni convertirlo en una operación de escritura. No repetir provision.sql.

Solo si ese postcheck confirma todos sus indicadores —salvo is_authentication_test=false— se recomienda el ensayo posterior separado: alumno hacia organización/Dashboard; administrador hacia TOTP y Panel con aal2. Este paso no habilita Auth ni modifica factores MFA. Se detiene aquí por el error de invocación, con el aprovisionamiento ya confirmado y el cierre de verificación pendiente.

Referencia técnica consultada: [Management API oficial de Supabase, consulta SQL](https://supabase.com/docs/reference/api/v1-run-a-query). La prueba efectiva del canal y el rechazo del filtro de la CLI se documentan a partir de su ejecución local/remota, no se deducen de esa referencia.