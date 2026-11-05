# Fase 4B — Validación real del preflight y dry-run

> Actualización posterior: las cinco migraciones ya se aplicaron mediante autorización de fase 4C. Véase [FASE_4C_MIGRACIONES_CLOUD.md](FASE_4C_MIGRACIONES_CLOUD.md). Este documento conserva la evidencia previa a la aplicación.

Fecha: 2 de noviembre de 2026. Continuación de [FASE_4B_SUPABASE_CLOUD.md](FASE_4B_SUPABASE_CLOUD.md).

**Resultado: no se identifican bloqueos conocidos para una primera aplicación controlada de las cinco migraciones al proyecto de desarrollo verificado.** El permiso administrado para políticas Storage está configurado y el dry-run terminó correctamente. No se aplicaron migraciones ni seed. Una aplicación real sigue requiriendo una nueva autorización.

## 1. Destino y evidencia

| Dato                               | Resultado y procedencia                                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proyecto                           | sistema-alumnos-dev, ACTIVE_HEALTHY; consultado mediante projects list.                                                                                                   |
| Project Ref                        | rnxgrunnrdlgjsbsrjev; coincide con supabase/.temp/project-ref y con el destino informado por la CLI.                                                                      |
| Organización                       | johnoc-lab, ID kpujkesuxmzmxbxiuuzv; orgs list confirmó la correspondencia con organization_id del proyecto.                                                              |
| CLI                                | 3.0.0, verificada de nuevo junto con la ayuda de db push y db query.                                                                                                      |
| PostgreSQL                         | server_version_num=170011, es decir 17.11; consulta remota READ ONLY. Compatible en versión mayor con major_version=17 local.                                             |
| Contexto del preflight del usuario | postgres; can_create_schema=true; auth.uid/auth.jwt disponibles; auth.users.id UUID único y REFERENCES permitido. Información proporcionada por el usuario.               |
| Contexto de las consultas nuevas   | supabase_read_only_user, porque db query --read-only utiliza el contexto administrado de lectura. No se interpreta como el rol que aplicaría DDL.                         |
| Storage                            | objects propiedad de supabase_storage_admin y sin políticas previas; RLS habilitada según preflight del usuario. Propietario y número de políticas cotejados remotamente. |
| Historial                          | Cinco migraciones locales y ninguna aplicada, verificado antes y después del dry-run.                                                                                     |

La CLI muestra environment=production para el destino vinculado. Se registró esa etiqueta; el nombre, Ref y organización comprobados son los del proyecto de desarrollo autorizado. No se cambió de proyecto, no se tocó Vercel y no se amplía la autorización a otro entorno.

## 2. Por qué effective_owner=false no bloquea CREATE POLICY

pg_has_role(..., 'USAGE') diagnostica pertenencia efectiva al propietario; no describe todas las capacidades añadidas por una plataforma administrada.

Supabase incorpora supautils.policy_grants para permitir a roles concretos gestionar políticas en tablas concretas sin ser propietarios. Su documentación incluye CREATE, ALTER, DROP y COMMENT de políticas. Esta capacidad no concede propiedad de la tabla ni autoriza DDL arbitrario. [Documentación primaria de supautils](https://github.com/supabase/supautils#table-ownership-bypass).

Se verificaron por consultas remotas de solo lectura:

| Comprobación                                        | Valor                  |
| --------------------------------------------------- | ---------------------- |
| session_preload_libraries                           | supautils              |
| Registro de supautils.policy_grants en pg_settings  | true                   |
| Configuración para postgres incluye storage.objects | true                   |
| Propietario de storage.objects                      | supabase_storage_admin |
| effective_owner en contexto de lectura              | false                  |

La combinación de carga del módulo, parámetro registrado y autorización específica confirma que el mecanismo administrado está configurado en este servidor. El preflight del usuario ya identificó postgres como rol de administración. No se realizó una prueba DDL para demostrar su ejecución: esa operación permanece fuera de esta autorización.

La [configuración oficial de Supabase Postgres](https://github.com/supabase/postgres/blob/develop/ansible/files/postgresql_config/supautils.conf.j2) también incluye postgres y storage.objects en policy_grants. La evidencia local al proyecto proviene de su GUC real, no únicamente de ese valor publicado.

No se atribuye este permiso a GRANT ALL, BYPASSRLS, MAINTAIN ni roles de escritura de archivos. No se cambió el propietario, no se concedió membresía a supabase_storage_admin y no se modificó configuración administrada.

La consulta diagnóstica relevante, sin DDL, es:

```sql
SELECT
  current_user,
  current_setting('session_preload_libraries', true) AS session_preload_libraries,
  EXISTS (
    SELECT 1 FROM pg_settings WHERE name = 'supautils.policy_grants'
  ) AS policy_grants_registered,
  coalesce(
    (nullif(current_setting('supautils.policy_grants', true), '')::jsonb
      -> 'postgres') ? 'storage.objects',
    false
  ) AS postgres_can_manage_storage_policies;
```

El preflight local se amplió con managed_policy_role, managed_policy_grant, supautils_session_preload y policy_grants_registered para evitar usar propiedad como único diagnóstico. No concede permisos: solo los describe.

## 3. Revisión de la migración 5

20261102094000_rpc_storage.sql mantiene seis políticas sobre storage.objects:

- Una SELECT permisiva para authenticated, con comprobación del recurso lógico.
- Una SELECT restrictiva para authenticated con la misma autorización.
- Una SELECT restrictiva que deniega anon.
- Guardas restrictivas INSERT, UPDATE y DELETE que deniegan escrituras a anon/authenticated.

Usa CREATE POLICY estándar, sin ALTER TABLE storage.objects, cambio de propietario, escritura de metadatos o modificación de columnas administradas. Esa es la capacidad acotada contemplada por policy_grants. Supabase documenta la creación de políticas directamente sobre objects. [Control de acceso de Storage](https://supabase.com/docs/guides/storage/security/access-control).

El helper private.storage_read_allowed tiene SECURITY DEFINER, search_path vacío y EXECUTE solo para authenticated. Resuelve bucket/ruta contra el archivo lógico y sus permisos; no concede acceso por prefijo aislado. Los demás RPC conservan sus controles de identidad, membresía, tenant, MFA y versión.

Los buckets no se crean al aplicar estas migraciones; deberán provisionarse posteriormente por la API Storage con autorización. No se descargan ni suben objetos ahora.

Las guardas restrictivas se aplican a todos los objetos para los roles indicados. Eso es deliberado en este proyecto dedicado. La lectura real confirmó cero políticas preexistentes; si otro sistema incorpora políticas/objetos antes de aplicar, hay que revisar de nuevo el inventario.

## 4. Migraciones 1 y 2 frente a defaults amplios

Se inspeccionaron sus bloques finales y se ejecutó la reconstrucción de cada versión con defaults globales amplios para anon/authenticated.

- Migración 1: activa RLS en las 14 tablas públicas y dos catálogos privados, y REVOKE ALL a PUBLIC/anon/authenticated antes de COMMIT.
- Migración 2: hace lo mismo con las siete tablas privadas de importación/activación antes de su COMMIT.
- Migración 3: agrega integridad, helpers y auditoría sin reabrir grants de tablas.
- Migración 4: concede únicamente capacidades previstas bajo políticas explícitas.
- Migración 5: revoca EXECUTE general de las RPC y concede solo las capacidades delimitadas en su misma transacción.

No se depende de que ALTER DEFAULT PRIVILEGES limitado al schema neutralice defaults globales; las revocaciones se aplican a los objetos ya creados. Una transacción confirmada a mitad del conjunto queda cerrada a roles web por grants/RLS. La primera migración no necesita esperar a la cuarta para proteger tablas.

Las cinco migraciones permanecen idénticas a las huellas SHA-256 publicadas en la preparación anterior. Se comprobó esto antes del dry-run. No se reescribió su SQL en esta validación.

## 5. Dry-run ejecutado

Comando exacto ejecutado tras verificar Project Ref, nombre, organización, historial, permisos y huellas:

```powershell
npm exec -- supabase db push --remote --dry-run --skip-vault
```

Resultado: salida 0 y mensaje explícito de que las migraciones no se enviarían. Resumen sin credenciales:

```json
{
  "upToDate": false,
  "dryRun": true,
  "migrations": [
    "20261102090000_domain.sql",
    "20261102091000_private_tables.sql",
    "20261102092000_integrity.sql",
    "20261102093000_rls.sql",
    "20261102094000_rpc_storage.sql"
  ],
  "seeds": [],
  "roles": [],
  "target": {
    "project_ref": "rnxgrunnrdlgjsbsrjev",
    "project_name": "sistema-alumnos-dev"
  }
}
```

upToDate=false es el resultado esperado: hay cinco migraciones pendientes, no un error.

La CLI informó Initialising login role como parte de su conexión administrada. No se introdujo ni mostró una contraseña; no se guardaron credenciales en archivos versionados. roles=[] describe los roles que aplicaría el plan de migración, no niega la gestión interna de credenciales de conexión por la CLI.

No se usaron --include-seed, --include-roles, --include-all, --yes o comandos de reparación. --skip-vault evitó la sincronización de Vault.

## 6. Comprobación remota después del dry-run

Se ejecutaron nuevas consultas READ ONLY y migration list --remote:

| Objeto/estado                         | Después             |
| ------------------------------------- | ------------------- |
| Tablas académicas públicas            | 0                   |
| Schema private                        | No existe           |
| supabase_migrations.schema_migrations | null / no existe    |
| Políticas de storage.objects          | 0                   |
| Buckets objetivo del sistema          | 0                   |
| Versiones locales                     | Las cinco previstas |
| Versiones remotas aplicadas           | Ninguna             |

El historial ausente es coherente con una base sin migraciones aplicadas; no se necesita repair ni crear el historial manualmente.

## 7. Pruebas locales y límites

- db:test:preflight: **12/12 comprobaciones aprobadas sin seed**. Incluye defaults amplios, protección en cada COMMIT, reconstrucción vacía, ausencia de DML en schemas administrados y diagnóstico del grant específico de Storage.
- El nuevo caso de diagnóstico simula únicamente el valor del GUC para comprobar respuestas positivas/negativas. No emula la extensión ni acredita permisos de CREATE POLICY en PGlite.
- db:types:check: aprobado, 14 tablas y 13 RPC reproducibles.
- ESLint: aprobado.
- No se repitieron los 83 casos con fixtures ni las pruebas de concurrencia, para respetar la prohibición de usar seed. Su resultado previo sigue siendo histórico.
- No hubo cambios en código Next.js, fixtures, clientes Supabase, configuración Vercel, ni archivos del Apps Script original.

Un dry-run compara/lista el plan y no ejecuta el DDL de las cinco migraciones. Por tanto, aún no existe prueba de aplicación completa en PostgreSQL 17.11 administrado. La reconstrucción embebida sigue siendo PostgreSQL 18.6 con bootstrap de auth/storage; esa diferencia permanece documentada.

Tampoco se han probado login/MFA real, APIs Storage, aislamiento positivo con usuarios reales de prueba ni concurrencia nativa. Los ajustes HTTP de Auth/Data API no quedan demostrados por estas consultas SQL. Mantener private fuera de esquemas expuestos y la aplicación desconectada hasta completar la fase correspondiente.

## 8. Decisión y siguiente paso

**Se puede avanzar a solicitar la primera aplicación controlada en rnxgrunnrdlgjsbsrjev; no se requiere corregir las cinco migraciones por effective_owner=false.** No quedan bloqueos conocidos de versión, colisión, historial o permiso administrado de Storage con la evidencia actual.

Antes de una ejecución real se debe mantener este mismo Project Ref y verificar que no cambien las cinco huellas ni el estado vacío. La instrucción posterior debe autorizar explícitamente aplicar solo las cinco migraciones, sin seed, roles adicionales, Vault ni conexión de Next.js.

Después de la aplicación autorizada: confirmar cinco versiones remotas, 14 tablas públicas y 9 privadas, sus grants/RLS/RPC/políticas y ejecutar las comprobaciones posteriores de solo lectura. Si alguna versión falla, detenerse e inspeccionar su transacción e historial; no usar reset o repair automáticamente. El conjunto no debe tratarse como una sola transacción global.

No se ejecuta la aplicación real en este turno.
