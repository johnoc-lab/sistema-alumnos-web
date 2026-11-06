# Fase 5B — Paso 19: postcheck QA de solo lectura

**Resultado: satisfactorio. El postcheck pendiente del Paso 18 quedó completado. No se realizaron escrituras en Supabase Cloud.**

Fecha: **5 de noviembre de 2026**, America/Lima. Lectura estructural de control: **09:14:37 Lima**, `2026-11-05T14:14:37.391877+00:00`.

## Destino y artefactos verificados

- Proyecto: **sistema-alumnos-dev**, Ref **rnxgrunnrdlgjsbsrjev**.
- Organización de infraestructura: **johnoc-lab**, ID `kpujkesuxmzmxbxiuuzv`; proyecto saludable y vínculo local coincidente.
- Rama: `feature/supabase-auth`; Supabase CLI **3.0.0**; PostgreSQL **170011 / 17.11**.
- Se reutilizó exclusivamente el manifiesto aprobado `exports/paso18/approval.private.json`, contrastado con su evidencia y con el COMMIT del Paso 18. No se reconstruyó una aprobación ni se modificó el manifiesto pendiente.
- Operación: `2387aa0e-d1c6-4604-ad26-1ddbe0b28b5b`.
- Organización QA: `211f6de1-5f3f-45ac-bbb1-d8363d715d01`, slug `qa-sistema-alumnos-01`.
- Hash canónico del payload: `47c758a26fb722b092fb5edbd78cbeb97fb21af5faf714925f558ef10205f987`.
- SHA-256 del postcheck original, comprobada antes de ejecutar: `b12381c4c2e5ed637fed1453b0de5c931b5164f195e0393c6cf2f4fbc1d4f313`.

## Canal y protección de lectura

Se verificó localmente que el batch privado del Paso 18 contiene exactamente el postcheck.sql original y el envelope aprobado, dentro de BEGIN READ ONLY/COMMIT, con TimeZone UTC y DateStyle ISO. El manifiesto se establece mediante PREPARE/EXECUTE tipado con literales escapados; no se imprimió su contenido.

Comando ejecutado una sola vez para el postcheck:

```powershell
node node_modules/supabase/dist/supabase.js db query --remote=rnxgrunnrdlgjsbsrjev --file exports/paso18/postcheck.private.sql --yes --output-format json --log-level error
```

Se omitió la opción CLI que rechazaba BEGIN. La protección de lectura se mantiene en **PostgreSQL**, mediante BEGIN READ ONLY. `--yes` confirma únicamente esta invocación de lectura ya autorizada. No se utilizó un archivo de aprovisionamiento.

La lectura complementaria de catálogos y conteos se ejecutó también dentro de BEGIN READ ONLY/COMMIT; devolvió rol postgres y **transaction_read_only=on**. Su SQL contiene únicamente SELECT/WITH y control de la transacción. Ambas llamadas terminaron correctamente, sin reparaciones ni reintentos.

## Resultados del postcheck original

**12 indicadores de integridad verdaderos; is_authentication_test=false, como corresponde.**

| Indicador | Resultado |
|---|---|
| manifest_hash_valid / manifest_v2 | Payload y aprobación v2 coincidentes |
| organization_active | Organización QA activa |
| profiles_active_linked | Dos perfiles activos con los UUID Auth previstos |
| memberships_active | Dos membresías activas, roles exactos student y admin |
| activations_linked | Dos activaciones enlazadas; perfil, membresía, Auth UUID y clave idempotente coincidentes |
| institutional_evidence | Modalidad institucional, referencias/fecha de asignación correctas y contacto de buzón nulo |
| operation_marker | Marcador de la operación y hash del manifiesto coincidentes |
| contract_unchanged | Huellas completas de organización, perfiles, membresías y activaciones coincidentes con la auditoría |
| old_identities_unlinked | Tres identidades anteriores sin perfil ni activación vinculados |
| rls_tables / institutional_guard_enabled | RLS de las cinco tablas participantes y trigger institucional habilitados |

Vinculaciones confirmadas:

| Rol | Auth UUID | Perfil | Membresía |
|---|---|---|---|
| student | 55d355b9-21d7-46af-8d6d-650a528743eb | 44dd96cb-0732-4760-b0c5-6dfe8de276af | 80e5b784-8c98-481d-9fc7-c761db51b7b9 |
| admin | 6cabd8d2-55d0-401c-b4f6-a20040215134 | 5c68dac3-31fe-4a70-a823-45fa69f3c058 | 6e4260d4-b596-4158-8663-91b73a382f7a |

Las identidades `db59e5dd-1810-4627-bb45-4c7efc242a8c`, `9eeeb988-f329-439d-b4b4-0f54cc1318d7` y `6d8c8f78-1d3b-43b5-8eb0-638e9d0cd8fa` permanecen sin vínculos académicos. La ausencia de perfiles y la integridad FK conservada impiden atribuirles las membresías por otra vía.

La coherencia idempotente se verificó por claves, unicidad, marcador y huellas de filas. **No se volvió a ejecutar provision.sql para ensayar una repetición.** Las “firmas” son huellas SHA-256 de filas; no son firmas digitales ni acreditación de identidad personal o de buzón.
## Controles estructurales conservados

La comparación con el snapshot posterior al COMMIT del Paso 18 confirmó igualdad de historial, RLS, propietarios/ACL, políticas, esquemas, columnas, constraints, triggers, funciones y metadatos de Storage.

- **23/23 tablas de aplicación con RLS**, además de storage.objects.
- **57 triggers habilitados**, con las mismas definiciones y configuración de diferimiento, incluido institutional_activation_guard.
- **230 restricciones validadas** y conservadas, incluidas PK, FK, UNIQUE y CHECK. Protección del último administrador intacta y diferible como estaba definida.
- Seis versiones de migración, sin cambios: 20261102090000, 20261102091000, 20261102092000, 20261102093000, 20261102094000 y 20261104170000.
- Metadatos Auth no secretos iguales al snapshot del Paso 18; no se hicieron operaciones Auth.

Conteos estables respecto del Paso 18:

| Recurso | Cantidad |
|---|---:|
| Organizaciones | 1 |
| Perfiles | 2 |
| Membresías | 2 |
| Activaciones institucionales | 2 |
| Eventos de auditoría | 15 |
| Cursos | 0 |
| Matrículas | 0 |

## Evidencia y cierre

Los resultados privados y comparaciones se guardaron bajo `exports/paso19/`, ignorado por Git. Incluyen postcheck-result.json, snapshot.raw.json, final-result.json y verificación local de los artefactos. Los originales del Paso 18 y supabase/qa/v2 no se editaron. El informe del Paso 18 conserva el estado histórico de aquella ejecución; este documento cierra su verificación pendiente.

**Se confirma expresamente que no se realizaron escrituras de datos ni de esquema en Supabase Cloud.** Las únicas operaciones de sesión fueron el contexto local del manifiesto, preparación de parámetros y transacciones READ ONLY. No se ejecutó provision.sql, no se crearon registros y no se reensayó la idempotencia mediante DML.

No se modificaron datos, Auth, contraseñas, sesiones, MFA, migraciones, RLS, .env.local o Next.js. No hubo cambios en Vercel, GitHub o Apps Script; tampoco seeds, reset, repair, commit de Git, push o deploy.

Este resultado valida datos y controles SQL; **no es una prueba de login, TOTP ni permisos efectivos de una sesión ordinaria**. No se inició ninguna de esas pruebas ni se habilitó Auth. El postcheck queda cerrado satisfactoriamente y se detiene aquí, sin continuar con otros cambios.