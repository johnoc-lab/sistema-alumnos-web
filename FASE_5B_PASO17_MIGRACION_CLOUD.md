# Fase 5B — Paso 17: sexta migración institucional en Cloud

**Resultado: aplicada correctamente y verificación posterior satisfactoria.** Fecha: 4 de noviembre de 2026, America/Lima. Rama local: `feature/supabase-auth`.

La única escritura remota solicitada fue la aplicación normal de la migración `20261104170000`, con su registro de historial administrado por Supabase CLI. No se ejecutó el lote QA ni se crearon datos de aplicación.

## Destino y autorización

- Proyecto: **sistema-alumnos-dev**.
- Project Ref y vínculo local: **rnxgrunnrdlgjsbsrjev**.
- Organización: **johnoc-lab**, ID `kpujkesuxmzmxbxiuuzv`.
- Estado previo: **ACTIVE_HEALTHY**; PostgreSQL `170011` (17.11).
- CLI instalada: **3.0.0**. Se consultó su ayuda antes de ejecutar.
- Alcance: autorización expresa del responsable QA en el Paso 17 para esta migración, sin aprovisionamiento ni pruebas reales de MFA.

La CLI etiqueta la rama principal del proyecto como `production`; se comprobó que su nombre y Ref coinciden con el proyecto de desarrollo autorizado. No representa un despliegue de Next.js ni aprobación de uso productivo.

## Archivo, huella y revisión de alcance

Origen conservado: `supabase/qa/v2/migrations/20261104170000_institutional_activation.sql`.

Copia promovida sin edición: `supabase/migrations/20261104170000_institutional_activation.sql`.

SHA-256 de ambos, comprobada antes y después:

```text
ec70da504805021d7332865048ad3674a90244edef512a9111ddc190124df284
```

El SQL contiene exclusivamente:

1. Retirada de NOT NULL en `proposed_verified_contact` para representar ausencia de buzón.
2. Cuatro columnas en `private.identity_activation_requests`: `verification_kind`, `login_identifier`, `verified_by_ref` y `verification_evidence_ref`.
3. CHECK `activation_institutional_contract`, que distingue el registro histórico de la asignación institucional explícita.
4. Función privada `guard_institutional_activation()`, SECURITY INVOKER y search_path fijo; revocación de EXECUTE a PUBLIC, anon y authenticated.
5. Trigger `institutional_activation_guard` BEFORE INSERT OR UPDATE, que rechaza nuevas vinculaciones sin modalidad institucional y fechas futuras.

Está delimitado por BEGIN/COMMIT. No incluye INSERT/UPDATE/DELETE de datos académicos, modificaciones Auth/Storage, políticas RLS ni concesión de permisos académicos. Las cinco migraciones históricas conservan sus SHA-256 del informe de Fase 4C.

## Preflight y dry-run

Snapshot previo de solo lectura: **12:53:59 Lima**, `2026-11-04T17:53:59.720095+00:00`. Rol `supabase_read_only_user`, transaction_read_only=on.

Se confirmó el historial exacto de cinco versiones, las cinco identidades esperadas y técnicamente confirmadas, ausencia de datos QA y colisiones del esquema institucional. La tabla de activaciones tenía las 11 columnas originales y contacto obligatorio. La función, las cuatro columnas, el CHECK y el trigger propuestos no existían.

Las 23 tablas de aplicación tenían RLS; también `storage.objects`. Los 56 triggers de aplicación estaban habilitados, incluidas las protecciones diferibles del último administrador. Las restricciones estaban validadas. Se guardaron metadatos de columnas, constraints, triggers, funciones, ACL, políticas y esquemas para comparar.

Después de copiar el archivo se ejecutó:

```powershell
node node_modules/supabase/dist/supabase.js db push --remote=rnxgrunnrdlgjsbsrjev --dry-run --skip-vault --output-format json --log-level error
```

Resultado: salida 0, `dryRun=true`, una única migración pendiente: `20261104170000_institutional_activation.sql`; `seeds=[]`, `roles=[]`. Se revalidaron vínculo, historial y huellas inmediatamente antes de aplicar.

## Aplicación e historial

Comando ejecutado una sola vez:

```powershell
node node_modules/supabase/dist/supabase.js db push --remote=rnxgrunnrdlgjsbsrjev --skip-vault --yes --output-format json --log-level error
```

`--yes` materializa exclusivamente la autorización ya concedida. `--skip-vault` excluye la sincronización de Vault. No se utilizaron include-seed, include-roles ni include-all.

Resultado: **salida 0**, `dryRun=false`, lista aplicada con **solo la sexta migración**, `seeds=[]`, `roles=[]`. Sin errores Cloud ni necesidad de recuperación. La inicialización de login que informa la CLI forma parte de su conexión administrada; no se aplicó un archivo de roles adicionales de la aplicación.

| Versión | Antes | Después |
|---|---|---|
| 20261102090000 | Aplicada | Conservada |
| 20261102091000 | Aplicada | Conservada |
| 20261102092000 | Aplicada | Conservada |
| 20261102093000 | Aplicada | Conservada |
| 20261102094000 | Aplicada | Conservada |
| 20261104170000 | Ausente | Aplicada |

El historial de SELECT y `migration list` coincidió: exactamente seis versiones, sin adicionales ni versiones pendientes.
## Verificación posterior de solo lectura

Snapshot principal: **12:56:19 Lima**, `2026-11-04T17:56:19.732373+00:00`. Comprobación adicional de permisos: **12:57:44 Lima**. Ambas lecturas con `db query --read-only` y Ref explícita.

| Control | Resultado confirmado |
|---|---|
| Columnas | 15 en activaciones: 11 anteriores y cuatro nuevas; únicamente el contacto anterior pasa a nullable |
| verification_kind | text, NOT NULL, DEFAULT legacy_unspecified |
| Otras tres columnas nuevas | text, nullable, sin default |
| Nuevo CHECK | Presente y validado |
| Nuevo trigger | Habilitado; BEFORE INSERT OR UPDATE, por fila, ejecutando la función correcta |
| Función nueva | SECURITY INVOKER, search_path=pg_catalog; sin EXECUTE efectivo para PUBLIC, anon o authenticated |
| Triggers anteriores | Los 56 conservan definición, habilitación y diferimiento; total actual: 57 |
| Integridad anterior | PK, UNIQUE, FK y CHECK anteriores conservados; protección del último administrador y activation_profile_match intactas |
| RLS | 23/23 tablas de aplicación y storage.objects; configuración previa conservada |
| Permisos/políticas | ACL de tablas/esquemas y políticas previas iguales al snapshot; funciones previas con definición, propietario, configuración y ACL iguales |
| Storage | Propietario, RLS, ACL y políticas sin cambios |
| Datos de aplicación | Organizaciones, perfiles, membresías, activaciones, cursos, matrículas y audit_events: 0 antes y después |
| Organización QA | Slug qa-sistema-alumnos-01 ausente |
| Manifiesto QA | Conserva approval_state=pending; lote no ejecutado |

Las cinco identidades Auth permanecen presentes con los mismos metadatos no secretos comparados: UUID, identificador, confirmación técnica, estado anónimo/bloqueo/eliminación y fechas de creación/actualización/último login.

- Alumno institucional: `55d355b9-21d7-46af-8d6d-650a528743eb`.
- Administrador institucional: `6cabd8d2-55d0-401c-b4f6-a20040215134`.
- Piloto: `6d8c8f78-1d3b-43b5-8eb0-638e9d0cd8fa`.
- Anterior: `db59e5dd-1810-4627-bb45-4c7efc242a8c`.
- Anterior: `9eeeb988-f329-439d-b4b4-0f54cc1318d7`.

Al permanecer vacías las tablas de perfiles, membresías y activaciones, ninguna de las cinco identidades recibió vínculos ni permisos académicos. No se leyó contenido de contraseñas, tokens, sesiones o secretos MFA. La comprobación de confirmación técnica no se interpreta como titularidad de buzón.

## Evidencia, incidencias y límites

Evidencia local ignorada por Git: `exports/paso17/`. Contiene SQL SELECT de snapshot y permisos; resultados anteriores/posteriores, historial, dry-run, aplicación y comparador local. No contiene credenciales. Los snapshots de Auth se limitan a los metadatos no secretos descritos; se conservan localmente, sin añadirlos al repositorio.

El comparador local produjo inicialmente un falso negativo por comparar el orden de claves de objetos JSON. Se corrigió solo ese comparador para usar igualdad estructural y se reevaluaron los mismos snapshots. Resultado final: `POSTCHECK_OK`. No hubo discrepancia de esquema ni SQL correctivo remoto. Una consulta auxiliar que contaba nombres con prefijo rpc_ no identifica las RPC reales, que usan nombres funcionales; la conservación de las funciones se verificó comparando sus firmas y metadatos completos anteriores/posteriores.

Las verificaciones remotas fueron de catálogo y lectura: no se insertaron filas para forzar errores de triggers/CHECK, no se probaron login, JWT, MFA o CRUD. La evidencia de ejecución negativa de integridad en PostgreSQL 17.11 corresponde al ensayo desechable del Paso 16. No se ejecutaron build/lint ni pruebas Next.js porque no se modificó la aplicación.

## Cierre de alcance

Cambios locales de este paso: copia idéntica de la sexta migración al directorio normal, este informe y evidencia auxiliar ignorada. El origen y los cinco archivos históricos no se editaron.

No se ejecutó provision.sql ni otro adaptador, seed, reset, repair, recuperación automática, creación de usuarios o datos QA. No se modificaron Auth, contraseñas, sesiones, MFA, SMTP, Send Email Hook, RLS, permisos académicos, Storage, .env.local, Next.js, Vercel, Apps Script o GitHub. No hubo commit, push ni deploy.

**Estado final:** seis migraciones aplicadas; evolución institucional disponible, sin organización ni accesos académicos creados. Se detiene aquí. El lote QA y cualquier prueba real posterior requieren su autorización específica; no quedan autorizados por este paso.