# Fase 4C — Primera aplicación controlada en Supabase Cloud

Fecha: 2 de noviembre de 2026. Estado: **cinco migraciones aplicadas y verificación posterior aprobada**.

## 1. Alcance y destino

Se ejecutó la autorización explícita del usuario para aplicar exclusivamente las cinco versiones SQL verificadas:

- Proyecto: sistema-alumnos-dev.
- Organización: johnoc-lab, ID kpujkesuxmzmxbxiuuzv.
- Project Ref: rnxgrunnrdlgjsbsrjev.
- Supabase CLI: 3.0.0.
- PostgreSQL Cloud: 17.11, server_version_num=170011.

Se cotejaron el archivo local supabase/.temp/project-ref, projects list, orgs list y el destino informado por migration list y db push. Todos coinciden. La CLI etiqueta este destino como environment=production; la referencia comprobada sigue siendo el proyecto de desarrollo autorizado, sin cambiar de proyecto ni tocar Vercel.

No se ejecutó seed, importación, reset, repair, creación de usuarios, modificación de Vercel, push a GitHub o despliegue. Next.js continúa desconectado; no se modificaron sus clientes, fixtures, rutas ni variables de entorno. No se modificó Apps Script.

## 2. Comprobaciones previas

1. Se verificó que hubiera exactamente cinco archivos SQL y se comparó cada SHA-256 contra los valores aprobados, sin depender únicamente del nombre.
2. Se confirmó la CLI 3.0.0 y el proyecto saludable en la organización esperada.
3. migration list --remote mostró las cinco versiones locales y ninguna remota aplicada.
4. El inventario previo confirmó cero usuarios Auth, cero tablas académicas públicas, private ausente, cero buckets, cero objetos y cero políticas de Storage.
5. Se registraron huellas de los metadatos de auth/storage para comparar después.
6. Se repitió el dry-run con --remote --dry-run --skip-vault: devolvió las cinco versiones previstas, dryRun=true, seeds=[] y roles=[].
7. Justo antes de aplicar se volvieron a verificar el Project Ref, las huellas, el conjunto de archivos y el historial vacío. No hubo discrepancias.

### Archivos y huellas aprobados

| Migración                         | SHA-256                                                          | Resultado |
| --------------------------------- | ---------------------------------------------------------------- | --------- |
| 20261102090000_domain.sql         | d1ece5bcdb48ba1773089d826b418cbbbd60fd731646f0a9fea201bbf30677b8 | Aplicada  |
| 20261102091000_private_tables.sql | 9ec4d34a58b8a2bc9ce75368c5dd7cde47ee76bf1a1db8b43ad2c65dd178fbc0 | Aplicada  |
| 20261102092000_integrity.sql      | bcd42f3addb3dd52fade2f8778a701154b8b5b09a73051631e58a21a4224be74 | Aplicada  |
| 20261102093000_rls.sql            | 299b02d8347bd166489c884fae22cc2cd7efde0656241450f6d523067116e488 | Aplicada  |
| 20261102094000_rpc_storage.sql    | 876ee44654427024d88b00edf83cf5c99f3c7cb2b8027133592091ad539f5cfe | Aplicada  |

Los archivos de migración no se editaron durante esta fase. Estas versiones ya aplicadas deberán conservarse inmutables; cualquier cambio futuro del esquema necesita una migración nueva.

## 3. Aplicación ejecutada

Se invocó la dependencia local de la CLI, desde SistemaAlumnos-Web:

```powershell
node node_modules/supabase/dist/supabase.js db push --remote --skip-vault --yes --output-format json
```

--yes confirma en la CLI la autorización ya otorgada por el usuario. No amplía el conjunto de archivos y no incluye seed o roles adicionales. --skip-vault impide la sincronización de Vault.

La CLI devolvió salida 0, dryRun=false y la lista exacta de los cinco archivos anteriores. seeds=[] y roles=[]. No hubo errores de aplicación ni necesidad de recuperación.

La conexión administrada de la CLI puede gestionar su rol interno de login; roles=[] indica que no se aplicó un archivo de roles adicionales del proyecto. No se imprimieron ni guardaron contraseñas/tokens en archivos versionados.

## 4. Historial real después de aplicar

Se consultó tanto migration list --remote como supabase_migrations.schema_migrations mediante SELECT:

| Versión local  | Versión remota |
| -------------- | -------------- |
| 20261102090000 | 20261102090000 |
| 20261102091000 | 20261102091000 |
| 20261102092000 | 20261102092000 |
| 20261102093000 | 20261102093000 |
| 20261102094000 | 20261102094000 |

Hay exactamente cinco versiones y ninguna inesperada. El schema de historial de la CLI se creó como parte de la aplicación normal; no se alteró manualmente.

## 5. Tablas y datos

### Tablas públicas: 14/14

organizations, profiles, organization_memberships, courses, course_modules, lessons, enrollments, announcements, materials, calendar_events, calendar_event_attendees, file_assets, certificate_issues y audit_events.

### Tablas privadas: 9/9

currency_codes, allowed_resource_hosts, migration_sources, import_runs, import_records, import_issues, legacy_id_map, event_source_links e identity_activation_requests.

Las **23 tablas tienen RLS habilitada**, coincidiendo con el esquema aprobado. No se añadió el marcador exclusivo del seed local.

### Conteos verificados, sin leer datos personales

| Conjunto                                          | Después    |
| ------------------------------------------------- | ---------- |
| Cada una de las 14 tablas públicas                | 0 filas    |
| auth.users                                        | 0 usuarios |
| Las siete tablas privadas de migración/activación | 0 filas    |
| private.currency_codes                            | 3 filas    |
| private.allowed_resource_hosts                    | 8 filas    |
| storage.buckets                                   | 0 filas    |
| storage.objects                                   | 0 filas    |

Las tres monedas y ocho proveedores son catálogos técnicos incluidos en la primera migración aprobada, no un seed ejecutado aparte. No existen organizaciones, perfiles, membresías, alumnos, administradores, cursos o eventos de prueba.

Los buckets privados previstos todavía no existen: su creación por API Storage requiere una fase/autorización posterior.

## 6. Verificación de seguridad

Se reconstruyeron las mismas cinco migraciones en PostgreSQL embebido **sin seed**, usando migrate(), para obtener el contrato esperado. Se consultaron los catálogos reales de Cloud con operaciones de solo lectura y se compararon sus representaciones canónicas.

| Comprobación                        | Resultado                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| RLS en tablas de aplicación         | 23/23, coincidente.                                                                  |
| Casos de privilegio por tabla/rol   | 322/322 coinciden.                                                                   |
| Casos de privilegio por columna/rol | 2032/2032 coinciden.                                                                 |
| Funciones de aplicación             | 40/40 coinciden: 13 públicas y 27 privadas.                                          |
| Políticas                           | 39/39 coinciden, incluidas expresiones, roles, comando y tipo permisivo/restrictivo. |
| Roles anon/authenticated            | Sin superusuario ni BYPASSRLS.                                                       |

La comparación de funciones incluye firma, retorno, volatilidad, SECURITY DEFINER, configuración, huella del cuerpo y EXECUTE efectivo para anon/authenticated/PUBLIC. La comparación de grants evalúa privilegios efectivos, por lo que detectaría accesos heredados desde defaults o PUBLIC.

Consecuencias verificadas:

- anon no puede leer tablas operativas ni ejecutar las 13 RPC de aplicación.
- authenticated no tiene UPDATE, DELETE o TRUNCATE directo.
- No hay acceso directo de roles web a tablas privadas.
- profiles conserva SELECT limitado por columna; auth_user_id no está expuesto mediante un grant de lectura.
- Las altas académicas se limitan a las columnas previstas y sus políticas de Admin.
- No se permiten altas directas de perfiles/membresías o cambios directos de roles y vínculos Auth.
- Las 13 RPC son SECURITY DEFINER, search_path vacío, EXECUTE habilitado para authenticated y revocado para anon/PUBLIC; su cuerpo coincide con las funciones locales verificadas.
- Los helpers privados mantienen los grants limitados del modelo.

### RPC públicas de aplicación: 13/13

update_course, update_course_module, update_lesson, update_enrollment, update_announcement, update_material, update_calendar_event, update_file_asset, update_certificate_issue, update_student_contact, set_student_status, create_scheduled_event y replace_event_attendees.

### Políticas Storage: 6/6

| Política                    | Comando | Tipo        |
| --------------------------- | ------- | ----------- |
| project_assets_select       | SELECT  | PERMISSIVE  |
| project_assets_guard        | SELECT  | RESTRICTIVE |
| project_assets_anon_guard   | SELECT  | RESTRICTIVE |
| project_assets_insert_guard | INSERT  | RESTRICTIVE |
| project_assets_update_guard | UPDATE  | RESTRICTIVE |
| project_assets_delete_guard | DELETE  | RESTRICTIVE |

Sus roles y expresiones coinciden con la migración 5. La lectura autenticada requiere private.storage_read_allowed(bucket_id,name). Las guardas anónimas y de escritura deniegan las operaciones previstas.

### Comprobaciones posteriores incluidas y roles ordinarios

Se ejecutó sin errores supabase/checks/cloud-postmigration-readonly.sql. El archivo inicia BEGIN TRANSACTION READ ONLY y termina con ROLLBACK. La API devuelve el resultado del último SELECT: admin_without_identity=false. Los resultados anteriores se corroboraron mediante las consultas de catálogo independientes descritas arriba.

Para ejecutar sus SET LOCAL ROLE se utilizó la conexión administrativa con la transacción explícitamente READ ONLY del archivo. El flag de transporte db query --read-only emplea supabase_read_only_user y no es equivalente a esa sesión con capacidad de cambiar a authenticated. No se concedieron permisos nuevos para ejecutar las pruebas.

Se ejecutaron además transacciones READ ONLY con resultados comprobados:

- SET LOCAL ROLE authenticated, claims vacíos: current_role=authenticated; cero cursos, organizaciones y membresías visibles; admin_without_identity=false.
- SET LOCAL ROLE anon: un bloque de prueba confirmó que SELECT sobre public.courses produce insufficient_privilege. El error esperado se capturó y la comprobación terminó correctamente.

No se insertaron filas para probar autorizaciones. Las pruebas positivas con matrículas/usuarios, MFA real y concurrencia siguen pendientes de autorización para datos sintéticos dedicados.

## 7. Integridad de los schemas administrados

Antes y después se calcularon huellas SHA-256 de inventarios ordenados. No se leyeron contraseñas, tokens o contenido de usuarios/archivos.

| Metadatos auth/storage | Elementos | SHA-256 antes y después                                          | Resultado       |
| ---------------------- | --------- | ---------------------------------------------------------------- | --------------- |
| columns                | 344       | 4139728d316e0a204d901a131c055ca2c64962206babd22b620bba596a3c790d | Sin diferencias |
| constraints            | 129       | 30c7a3548f5d2de4a69bd44886bc5a20b0a508989b54c9623efe2c5f24ad71d9 | Sin diferencias |
| functions              | 24        | 1614fc6c75a173f5501cff6151f027a41fbbd65bbcb49ab71c9bcbac2c73d0c7 | Sin diferencias |
| indexes                | 131       | 5933fa70e878191ffa1a6d64054755df97dff6b57a13b92cfa166331e1f26e18 | Sin diferencias |
| relations              | 36        | 7c4fed76ad544f04dc3f5b294435fce8cb61d19495349ea77583b3cbc4416712 | Sin diferencias |
| triggers               | 8         | 33445ae8f60e4904bc7e34a7fb319ad4df1088304a7e07a940e2739da69a8786 | Sin diferencias |

El inventario cubre tablas/vistas/secuencias con propietario, ACL y RLS; columnas y defaults; constraints pertenecientes a esos schemas; índices; funciones con propietario/configuración/ACL/cuerpo; y triggers no internos.

No se detectaron cambios en esos metadatos. El único cambio de políticas de Storage es la incorporación de las seis autorizadas. Las dependencias y triggers internos que PostgreSQL necesita para las FKs aprobadas hacia auth.users no son DDL manual adicional ni forman parte del inventario de triggers no internos.

Los conteos de auth.users, buckets y objetos permanecen en cero. No se cambiaron propietarios de objetos administrados ni se escribieron metadatos de Storage.

## 8. Hallazgo adicional del entorno

El catálogo de public contiene una función adicional, rls_auto_enable, no definida por estas cinco migraciones:

- Propietario postgres.
- Retorno event_trigger.
- SECURITY DEFINER y search_path=pg_catalog.
- Asociada al event trigger ensure_rls, evento ddl_command_end.
- Su definición activa RLS automáticamente al crear tablas en public.
- Se observó EXECUTE heredado de PUBLIC.

Se inspeccionó su definición mediante lectura. Es una función de event trigger del entorno y no se incluye entre las 13 RPC de negocio. No se modificó ni se revocaron sus permisos fuera de la autorización recibida.

La comparación inicial de todas las funciones public/private dio 41 frente a 40 locales por ese objeto adicional. Una vez identificado explícitamente su retorno event_trigger y separado del contrato de aplicación, las 40 funciones aprobadas coinciden exactamente. No se ocultó una diferencia en las RPC del proyecto ni se corrigió alterando permisos remotos.

El origen/gestión de cualquier endurecimiento adicional de esa función se deberá revisar por separado antes de exponer nuevos flujos. Su presencia no impidió aplicar el esquema ni cambió el contrato de permisos de la aplicación.

## 9. Huellas de los contratos comparados

Las siguientes huellas usan JSON canónico, con claves ordenadas y arrays de catálogos ordenados. Corresponden al contrato de aplicación; el event trigger adicional se documenta por separado.

| Contrato      | Entradas | SHA-256                                                          | Comparación Cloud/local |
| ------------- | -------- | ---------------------------------------------------------------- | ----------------------- |
| tables        | 23       | b6d895b6cdb8208b5eeb01eeea22bf173c54cf012aba5d629dd490381e938634 | Coincide                |
| policies      | 39       | a18d8b56178722f80924d4403d2d72607ca658be3ae6ec7b574dbafd23412601 | Coincide                |
| functions     | 40       | f18699199610cb323ed183002f96e56d5fdb06994791559731fd5c94129cd576 | Coincide                |
| table_grants  | 322      | ce39a1fa4a238893720809396af4d7619e0b12a02810d05511414574d88e8f31 | Coincide                |
| column_grants | 2032     | 2b2989e53dd4cc87c56d263c3b22434791a0277e3941e31fbb0b0f456dd3403a | Coincide                |

La coincidencia del contrato se obtuvo en PostgreSQL Cloud 17.11. Esto valida la aplicación del SQL en el destino real y sustituye la incertidumbre anterior sobre ejecución DDL en esa versión; no sustituye una prueba funcional completa con usuarios.

## 10. Errores y límites

No falló ninguna migración. No se ejecutó reparación, eliminación de objetos ni cambios extra de permisos. No se reintentó una aplicación parcial.

La validación de seguridad de esta fase es estructural y de denegación sin identidad. No demuestra todavía login/MFA, aislamiento positivo con dos personas autenticadas, elegibilidad de certificados, finalización de archivos o concurrencia real. No se ejecutaron los tests con fixtures/seed contra Cloud.

No se alteraron variables de entorno, políticas de cookies, CSP o repositorios Next.js. La demo pública conserva su independencia; aplicar el esquema no activa sus clientes deshabilitados.

## 11. Pendientes antes de integrar autenticación

1. Confirmar en Dashboard los ajustes HTTP de Auth y los schemas expuestos de Data API; mantener private fuera de exposición y no crear Admin mediante registro público.
2. Regenerar/comparar tipos oficiales desde el esquema Cloud aprobado y preparar la integración SSR por separado.
3. Definir activación/invitación y enlace idempotente perfil–Auth–membresía con identidad verificada, sin copiar hashes antiguos ni adjudicar organización por dominio.
4. Implementar verificación de sesión, cookies/callbacks, protección de mutaciones y MFA aal2 para administración; los clientes normales deben usar la sesión del usuario.
5. Autorizar después identidades/datos sintéticos dedicados para pruebas positivas, revocación, aislamiento y concurrencia. No ejecutar el seed local de forma indiscriminada en Cloud.
6. Provisionar buckets privados por API y diseñar upload/finalización/descarga, manteniendo sus controles lógicos. No habilitar escrituras web genéricas.
7. Mantener Next.js desconectado hasta una instrucción posterior y verificar que las rutas reales nunca recurran a fixtures de demo.

Estado final: esquema inicial creado en el proyecto autorizado, datos de negocio vacíos, RLS/grants/RPC/políticas verificados, sin integración de autenticación ni conexión de la aplicación.
