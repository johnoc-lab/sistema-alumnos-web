# Fase 4B — Preparación de Supabase Cloud

> Actualización: la validación real, vinculación comprobada y dry-run ejecutado posteriormente están documentados en [FASE_4B_VALIDACION_PREFLIGHT.md](FASE_4B_VALIDACION_PREFLIGHT.md). Las referencias a falta de login/dry-run no ejecutado de esta guía describen su preparación inicial.

Proyecto previsto: sistema-alumnos-dev, organización johnoc-lab. Revisión local: 2 de noviembre de 2026.

**No se autenticó ni vinculó la CLI, no se ejecutó db push (ni siquiera dry-run), reset o repair, no se usó el seed y no se modificaron Vercel ni GitHub.** El intento de listar proyectos devolvió falta de autenticación. No existe supabase/.temp/project-ref. Por ello el nombre/organización y el estado vacío del destino son datos proporcionados por el usuario; todavía no constituyen una verificación remota.

## 1. Resultado y correcciones locales

Se revisaron las cinco migraciones completas y FASE_4_BASE_DATOS.md. El diseño sigue siendo organizaciones, identidades, membresías y matrículas separadas, sin permisos por dominio ni parámetros de navegador.

| Hallazgo                                                                                                                                              | Cambio local                                                                                                                                                                                            | Evidencia                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| RLS y revocaciones de tablas llegaban recién en la cuarta migración. Con defaults amplios, las primeras confirmaciones podían dejar tablas expuestas. | Las migraciones 1 y 2 ahora habilitan RLS y revocan permisos antes de su propio COMMIT. La cuarta concede las capacidades previstas.                                                                    | Prueba de cada límite de migración con defaults globales amplios.         |
| CLI 3.0.0 usa selección remota explícita y no admite varios flags de ejemplos de CLI 2.                                                               | Wrapper local corregido: reset local usa el destino local por defecto, sin --local. Comandos de esta guía usan --remote; no se ejecutó reset.                                                           | Ayuda del ejecutable instalado.                                           |
| La migración 5 escribía buckets mediante INSERT en storage.buckets.                                                                                   | Eliminado de las migraciones para Cloud. Los buckets se provisionarán posteriormente por API Storage, con autorización. El INSERT queda solo en el seed sintético del harness local, que no se ejecutó. | Reconstrucción sin seed con cero usuarios Auth, organizaciones y buckets. |
| La generación de tipos ejecutaba el seed innecesariamente.                                                                                            | Se separaron migrate() y migrateAndSeed(); el generador usa únicamente migrate().                                                                                                                       | db:types:check aprobado sin seed; tipos sin cambios.                      |

Se conservaron cinco versiones; se modificaron los archivos iniciales porque, según el usuario, ninguna migración ha sido aplicada. Si el historial remoto contradice esto, detenerse: no aplicar ni reparar automáticamente. Después de su primera aplicación, estas versiones deberán permanecer inmutables.

La creación de buckets ya no es efecto de las migraciones. Sus políticas se pueden crear aunque los buckets no existan. Cuando se autorice almacenamiento, se deberán crear course-files, certificate-files y organization-assets como privados mediante la API, antes de habilitar archivos. No hay escrituras SQL en auth o storage dentro de las cinco migraciones.

## 2. CLI y diferencias de sintaxis

Se ejecutaron --version y ayudas de login, link, projects list, orgs list, migration list, db push, db reset, gen types y test db. La dependencia fijada e instalada es **supabase 3.0.0**; no se actualizó.

La ayuda local indica:

- login admite flujo automático y --no-browser; no es necesario poner --token en un comando.
- link admite --project-ref; recibe un identificador, no el nombre visible del proyecto.
- migration list y db push apuntan a local por defecto; **--remote** selecciona el proyecto vinculado.
- db push admite --dry-run, --skip-vault y --include-seed. En esta fase solo se prepara el primero con --skip-vault; nunca --include-seed.
- Los ejemplos de CLI 2 con --linked o --local no corresponden a esta instalación para estos comandos.
- Para tipos oficiales locales: npm exec -- supabase gen types typescript --schema public. Para el proyecto vinculado, añadir --remote cuando corresponda; todavía no se ejecuta esa generación remota.

La [referencia web de CLI](https://supabase.com/docs/reference/cli/supabase-db-push) aún muestra ejemplos distintos. Para estos comandos se tomó como autoridad operativa la ayuda del binario instalado. Repetir la comprobación de ayuda si cambia la versión.

## 3. Dependencias administradas y permisos

| Migración                         | Dependencias y revisión                                                                                                                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 20261102090000_domain.sql         | Crea private y tablas operativas; necesita CREATE de schema y REFERENCES sobre auth.users(id UUID único). No cambia la estructura de auth. Usa gen_random_uuid, JSONB y restricciones PostgreSQL estándar. |
| 20261102091000_private_tables.sql | FKs a las tablas previas y a auth.users para activación; tablas técnicas privadas. No provisiona cuentas.                                                                                                  |
| 20261102092000_integrity.sql      | Requiere auth.uid() → UUID y auth.jwt() → JSONB. Predicados, triggers, auditoría, zonas horarias y validaciones diferidas. No valida firmas JWT: esa frontera pertenece a Auth/gateway.                    |
| 20261102093000_rls.sql            | Requiere anon y authenticated ordinarios. Grants explícitos, RLS, lectura de columnas limitada en profiles y sin UPDATE/DELETE/TRUNCATE directo.                                                           |
| 20261102094000_rpc_storage.sql    | Requiere storage.objects con bucket_id/name y RLS ya habilitada. Agrega políticas de proyecto, sin alterar columnas/propietario del schema administrado. No inserta buckets.                               |

El rol postgres de Supabase Cloud no es superusuario. Las migraciones no crean roles, extensiones ni schemas auth/storage y no necesitan superusuario como requisito explícito. Falta verificar los permisos efectivos de la identidad que las aplique, especialmente creación de políticas sobre storage.objects. [Roles administrados](https://supabase.com/docs/guides/database/postgres/roles-superuser).

Las 13 RPC públicas SECURITY DEFINER son capacidades delimitadas: search_path vacío, nombres calificados, EXECUTE revocado para PUBLIC/anon, comprobación propia de identidad/perfil/membresía/tenant/MFA aal2 y comparación de row_version. No se convierten en clientes service_role ni confían en datos editables del JWT. Los helpers privados no se exponen por Data API. El propietario efectivo de las funciones debe ser de despliegue de confianza y debe conservar la capacidad de leer las tablas a las que sirven.

Los grants de funciones se revocan explícitamente sobre cada objeto. Un REVOKE de default EXECUTE limitado al schema no elimina el default global de PUBLIC; la prueba nueva introduce defaults globales amplios para comprobar que no abran acceso. [Seguridad de Data API](https://supabase.com/docs/guides/api/securing-your-api).

Las guardas RESTRICTIVE de Storage afectan a todos los objetos de este proyecto para roles web, no solo a un bucket. El destino debe ser dedicado al sistema. Inventariar políticas existentes antes de aplicar, porque una política RESTRICTIVE adicional podría impedir lecturas previstas. Nunca cambiar propietarios o columnas administradas para superar un error. [Schema de Storage](https://supabase.com/docs/guides/storage/schema/design).

## 4. Comandos que debe ejecutar el usuario

En PowerShell, desde la carpeta de Next.js:

```powershell
Set-Location -LiteralPath 'C:\Users\Delfi\Desktop\SistemaAlumnos-Web'
npm exec -- supabase --version
npm exec -- supabase login
if ($LASTEXITCODE -ne 0) { throw 'No se completó el login.' }
npm exec -- supabase orgs list
npm exec -- supabase projects list
```

El login abre el flujo de autenticación de la CLI. Si el navegador no se abre, usar npm exec -- supabase login --no-browser y seguir sus instrucciones. Los tokens quedan gestionados por la CLI fuera de archivos versionados; no pegarlos en el código, el chat o comandos --token. No consultar projects api-keys para esta preparación.

Antes de continuar, verificar la organización johnoc-lab y su ID en orgs list. Verificar que projects list muestre sistema-alumnos-dev asociado a ese mismo ID. Obtener su Project Ref desde ese listado o la configuración del mismo proyecto en Dashboard. El nombre visible no es suficiente y el slug de organización no es necesariamente su ID.

```powershell
$devProjectRef = (Read-Host 'Project Ref verificado de sistema-alumnos-dev en johnoc-lab').Trim()
if ($devProjectRef -cnotmatch '^[a-z]{20}$') { throw 'Project Ref no válido para esta CLI.' }
npm exec -- supabase link --project-ref $devProjectRef
if ($LASTEXITCODE -ne 0) { throw 'No se completó la vinculación.' }
$linkedProjectRef = (Get-Content -LiteralPath '.\supabase\.temp\project-ref' -Raw).Trim()
if ($linkedProjectRef -cne $devProjectRef) { throw 'El proyecto vinculado no coincide. Detenerse.' }
npm exec -- supabase migration list --remote
if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar el historial remoto.' }
```

El Project Ref no es una contraseña. No se inventa aquí su valor porque no se ha identificado el proyecto mediante una sesión autorizada. Si la CLI solicita contraseña de base, introducirla únicamente en su prompt privado; no usar --password, una URL con password en el comando ni compartirla en la conversación.

Vincular configura el destino de la CLI; no conecta Next.js, no sincroniza automáticamente config.toml con Cloud y no aplica migraciones. No ejecutar config push. Los comandos de gestión pueden obtener credenciales temporales de conexión con el token de cuenta; esto no equivale a una sesión RLS de alumno.

### Historial y comprobación previa

El listado debe mostrar exactamente estas versiones locales, todas pendientes y sin versión remota aplicada:

```text
20261102090000  domain
20261102091000  private_tables
20261102092000  integrity
20261102093000  rls
20261102094000  rpc_storage
```

Si hay versiones remotas inesperadas o falta alguna local, detenerse e investigar; no usar repair, reset ni --include-all para forzar coincidencia.

Después de verificar proyecto, configuración y consulta SQL de la siguiente sección, el comando preparado para **simular**, no aplicar, es:

```powershell
if ((Get-Content -LiteralPath '.\supabase\.temp\project-ref' -Raw).Trim() -cne $devProjectRef) {
  throw 'Cambió el proyecto vinculado.'
}
npm exec -- supabase db push --remote --dry-run --skip-vault
if ($LASTEXITCODE -ne 0) { throw 'Falló el dry-run: no autorizar aplicación.' }
```

**Este comando no se ejecutó durante esta fase**, respetando la prohibición de ejecutar db push todavía. No quitar --dry-run. No añadir --include-seed, --include-roles, --include-all o --yes. --skip-vault evita solicitar sincronización de secretos de Vault.

El resultado esperado es una lista de las cinco migraciones pendientes, sin aplicación ni seed. Un dry-run comprueba selección/historial, **no ejecuta cada sentencia ni prueba que su DDL sea compatible**. Tampoco debe confundirse con una transacción SQL estrictamente de solo lectura: la CLI puede gestionar credenciales temporales/metadatos de su conexión. Para inspección estricta se proporciona SQL READ ONLY.

## 5. Configuración real de Cloud que falta comprobar

La configuración local no demuestra cómo está configurado Cloud. En el Dashboard del Project Ref verificado:

| Requisito             | Comprobación / resultado esperado                                                                                                                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Destino               | sistema-alumnos-dev dentro del ID correspondiente a johnoc-lab; estado operativo y proyecto dedicado.                                                                                                                                    |
| Versión PostgreSQL    | Obtener server_version_num con la consulta preparada. Local apunta a 17, PGlite probado es 18.6. Si Cloud usa otra versión, ajustar únicamente la configuración local con evidencia y repetir pruebas en esa versión; no degradar Cloud. |
| Data API              | Exponer public según el diseño; **no exponer private**. No conceder permisos web amplios para resolver errores.                                                                                                                          |
| Auth                  | Registro público y acceso anónimo deshabilitados para este alcance. Sin alta automática de membresías/Admin. Estos ajustes no se trasladan solos desde config.toml.                                                                      |
| MFA                   | La autorización administrativa exige aal2; su flujo real sigue pendiente. No rebajar SQL a aal1 para probar una interfaz.                                                                                                                |
| Storage               | Servicio y schema administrado disponibles, RLS en objects, sin buckets/policies de otro sistema que entren en conflicto.                                                                                                                |
| Permisos de migración | Rol con CREATE de schema, REFERENCES a auth.users(id) y propiedad efectiva/capacidad legítima para crear políticas de storage.objects.                                                                                                   |
| Colisiones            | private ausente, ninguna de las 14 relaciones o 13 RPC existente y sin historial académico previo. Una base sin tablas académicas todavía puede tener schemas/buckets/policies conflictivos.                                             |
| Red                   | Conexión de CLI permitida; respetar restricciones IP/TLS. Si falla por IPv6/pooler, revisar configuración de conexión; no deshabilitar verificación TLS ni imprimir URLs con password.                                                   |

Abrir y ejecutar **supabase/checks/cloud-preflight.sql** en SQL Editor de ese mismo proyecto. El archivo contiene BEGIN READ ONLY, SELECT de catálogos/inventario y ROLLBACK; no tiene DDL ni DML, no consulta contactos o tokens, y no crea historial de migraciones.

Su JSON debe mostrar:

- roles anon/authenticated presentes, superuser=false y bypassrls=false;
- auth.uid y auth.jwt sin argumentos, tipos UUID y JSONB;
- auth.users.id UUID único y references_allowed=true;
- columnas administradas esperadas: buckets id/name text y public bool; objects id UUID, bucket_id/name text;
- storage_policy_target.rls=true; effective_owner es un diagnóstico de propiedad, no un veto. Supabase admite gestión mediante supautils.policy_grants para postgres sobre storage.objects; el preflight ampliado informa managed_policy_grant y carga/registro del módulo. Ver la validación real posterior;
- can_create_schema=true, private_schema_exists=false, relaciones/funciones conflictivas vacías;
- inventario de buckets objetivo vacío en este destino inicial;
- default_privileges y storage_policies revisados, sin objetos de otra aplicación.

La consulta no puede verificar por sí sola nombre comercial/organización ni los ajustes HTTP de Auth/Data API; deben cotejarse en Dashboard. Tampoco demuestra que las cinco migraciones se ejecutarán correctamente. Se probó su sintaxis en el bootstrap embebido, no en Cloud.

## 6. Pruebas remotas seguras sin Docker

**Ahora, antes de migrar:** login/listados, identidad del destino, historial y el preflight READ ONLY; el dry-run preparado se ejecutará cuando el usuario lo decida. Estas acciones no necesitan Docker ni seed.

**Después de autorizar y aplicar:** ejecutar supabase/checks/cloud-postmigration-readonly.sql en SQL Editor. Revisa catálogos, grants, policies, 13 definers y usa SET LOCAL ROLE authenticated sin identidad; espera 14/14 tablas con RLS, anon sin EXECUTE de RPC, sin escrituras directas/lecturas privadas y cero cursos visibles con admin_without_identity=false. No crea usuarios ni cambia datos. Tras una sesión sin identidad, eso solo prueba denegaciones; no aislamiento positivo entre personas.

La suite original de 83 casos, pgTAP y las tres pruebas simultáneas usan las fixtures del seed, y algunas generan escrituras/auditoría. **No ejecutarlas contra Cloud en este estado.** El harness nativo mantiene guardas de loopback/marcador local y no fue ampliado para aceptar una base remota.

Pruebas positivas de Impulso/Incubadora, Admin/MFA, suspensión, participantes, concurrencia real y APIs Storage requieren otra autorización para provisionar identidades y datos sintéticos en un entorno dedicado. No copiar hashes ni insertar filas de auth.users en Cloud para ello. No crear extensiones o hacer una aplicación de DDL seguida de ROLLBACK como supuesto dry-run inocuo.

## 7. Evidencia local de esta fase

| Verificación                                     | Resultado                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| CLI instalada y ayuda                            | 3.0.0; sintaxis contrastada con la instalación real.                                             |
| Lectura de proyectos                             | Rechazada por falta de login; no se autenticó automáticamente.                                   |
| db:test:preflight                                | 11/11 comprobaciones aprobadas, sin seed ni contacto con Cloud.                                  |
| Reconstrucción sin seed                          | Cinco migraciones aplicadas a PGlite PostgreSQL 18.6; cero Auth users, organizaciones y buckets. |
| db:types:check                                   | Aprobado, sin seed; tipos existentes reproducibles.                                              |
| Lint, TypeScript                                 | Aprobados.                                                                                       |
| Vitest de aplicación                             | 26/26 aprobados.                                                                                 |
| Build Next.js                                    | Aprobado.                                                                                        |
| HTTP local                                       | 55/55 comprobaciones aprobadas en loopback.                                                      |
| 83 casos con fixtures de fase 4                  | Resultado histórico 83/83; no repetidos en fase 4B por prohibición de usar seed.                 |
| Cloud, dry-run, PostgreSQL nativo y concurrencia | No ejecutados.                                                                                   |

Comandos locales comprobados que no usan seed:

```powershell
npm run db:test:preflight
npm run db:types:check
npm run lint
npm run typecheck
npm run test
npm run build
```

No ejecutar npm run check ni db:test/db:test:native/db:test:pgtap en esta preparación: check conserva la suite histórica que usa seed; los demás requieren fixtures locales. npm run test ejecuta únicamente los tests de aplicación, sin importar las suites .mjs de base.

## 8. Criterios antes de autorizar la primera aplicación

1. Identificar Project Ref y comprobar nombre/organización mediante la cuenta correcta.
2. Revisar el resultado real del SQL preflight y Dashboard; resolver versión, permisos, exposición y cualquier colisión.
3. Comprobar exactamente cinco versiones pendientes, ninguna aplicada y dry-run sin seed/Vault ni errores.
4. Revisar los cambios locales de las migraciones 1, 2 y 5 y guardar sus huellas; no alterar versiones ya aplicadas.
5. Aceptar explícitamente los efectos de la aplicación: 14 tablas públicas, 9 privadas, catálogos técnicos, triggers, índices, grants, RLS y RPC/policies; **sin cuentas, matrículas, buckets ni demo conectada**.
6. Aprobar en una instrucción posterior la aplicación al Project Ref verificado. Esta guía no incluye un comando listo para aplicar sin --dry-run.
7. Planificar pruebas de solo lectura posteriores y, separadamente, autorizar fixtures remotas si se necesitan pruebas funcionales completas.

Next.js conserva los clientes deshabilitados, repositorios unavailable, rutas reales cerradas y fixtures públicas independientes. La CSP también sigue restringiendo conexiones al origen; una futura integración deberá revisar cookies/SSR, autorización, variables y CSP de forma coordinada. Vincular la CLI por sí solo no habilita ninguna de esas funciones.

## 9. Huellas locales revisadas

SHA-256 de los archivos revisados al finalizar la fase 4B. Comparar antes de autorizar la aplicación; cambios de contenido o finales de línea requieren nueva comprobación.

| Migración                         | SHA-256                                                          |
| --------------------------------- | ---------------------------------------------------------------- |
| 20261102090000_domain.sql         | d1ece5bcdb48ba1773089d826b418cbbbd60fd731646f0a9fea201bbf30677b8 |
| 20261102091000_private_tables.sql | 9ec4d34a58b8a2bc9ce75368c5dd7cde47ee76bf1a1db8b43ad2c65dd178fbc0 |
| 20261102092000_integrity.sql      | bcd42f3addb3dd52fade2f8778a701154b8b5b09a73051631e58a21a4224be74 |
| 20261102093000_rls.sql            | 299b02d8347bd166489c884fae22cc2cd7efde0656241450f6d523067116e488 |
| 20261102094000_rpc_storage.sql    | 876ee44654427024d88b00edf83cf5c99f3c7cb2b8027133592091ad539f5cfe |
