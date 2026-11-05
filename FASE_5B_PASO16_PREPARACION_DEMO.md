# Fase 5B — Paso 16: preparación inmediata QA

Fecha: 4 de noviembre de 2026. Rama: `feature/supabase-auth`. Alcance: lectura remota y pruebas SQL locales. No se realizaron escrituras Cloud, cambios Auth/MFA ni cambios de configuración de la aplicación.

## Resultado

No se detectó un impedimento técnico en el SQL revisado para el aprovisionamiento sintético. Se resolvió la validación pendiente en PostgreSQL 17.11 nativo sin alterar las guardas. Faltan la autorización expresa del DDL/DML y formalizar esa autorización en una copia privada del manifiesto. No se necesita inventar una aprobación externa para un ensayo cuyo responsable QA es el propio usuario.

La demo inmediata probará acceso a las pantallas protegidas actuales; estas muestran un contenedor autorizado con contenido académico pendiente. No constituye validación de CRUD ni un sistema aprobado para producción.

## Preflight remoto confirmado

Snapshot: **2026-11-04 12:36:08, America/Lima** (17:36:08.723625 UTC). Consulta ejecutada mediante CLI con destino explícito, modo de solo lectura, rol `supabase_read_only_user` y `transaction_read_only=on`.

- Proyecto activo `sistema-alumnos-dev`, Ref `rnxgrunnrdlgjsbsrjev`, organización de infraestructura esperada; vínculo local coincidente.
- PostgreSQL `170011`. Historial exacto: `20261102090000`, `20261102091000`, `20261102092000`, `20261102093000`, `20261102094000`.
- Existen las cinco identidades esperadas: las dos institucionales definitivas, el piloto y las dos anteriores. Identificadores coincidentes, confirmación técnica presente, sin estado anónimo, eliminado o bloqueado. Esto no acredita un buzón.
- Cero perfiles, membresías o solicitudes de activación vinculados a las cinco identidades. Sin colisiones de los UUID reservados ni del slug `qa-sistema-alumnos-01`.
- RLS habilitada en las 23 tablas de la aplicación y `storage.objects`; 56 triggers esperados habilitados, con configuración de diferimiento revisada.
- La evolución institucional todavía no está aplicada. Las cinco migraciones locales conservan las huellas históricas; manifiesto, adaptador, postcheck y migración propuesta conservan las huellas del Paso 14.

## Validación local adicional

Se utilizó PostgreSQL **17.11 nativo portable**, sin Docker, instalación de servicios ni cambios de dependencias del proyecto. Archivos y clústeres desechables bajo `exports/qa-pg17`, ignorado por Git. Escucha temporal limitada a loopback; servidor detenido al finalizar.

**13/13 comprobaciones satisfactorias**: contexto exacto 170011/postgres, migración institucional sin cambios, rechazo de manifiesto pendiente/v1/destino incorrecto/hash alterado/evidencia ausente, alta con adaptador original, repetición idempotente entre transacciones, postcheck original READ ONLY, protección del último administrador, denegación de Admin aal1 y conservación de Auth sustituto/cuentas anteriores sin vínculos.

Se ejecutaron las cinco migraciones originales y la propuesta en la base local. El adaptador conservó sus UUID y guardas originales. Únicamente el payload de ensayo en memoria recibió referencias expresamente locales para probar la rama aprobada; el archivo pendiente no cambió. Resultados y guion: `exports/qa-pg17/result.json` y `validate.mjs`.

Límite: Auth/Storage son sustitutos SQL locales y los claims RLS son sintéticos. No es un servidor Supabase Auth real ni prueba de TOTP, JWT firmados o privilegios administrados. Los 37 casos del Paso 14 sobre PostgreSQL embebido 18.6 son evidencia previa, no se presentan como reejecutados aquí.

## Asignación mínima y honesta

Evidencia privada local: `exports/qa-evidence/paso16-qa-scope.json`, ignorada por Git. Registra la declaración del usuario como creador, responsable QA y probador de ambas identidades sintéticas; los logins satisfactorios son comunicados por él. No contiene firma, nombre personal inventado ni verificación de buzón o externa.

| Identidad | UUID Auth | Rol previsto |
|---|---|---|
| u-000001 | 55d355b9-21d7-46af-8d6d-650a528743eb | student |
| u-000002 | 6cabd8d2-55d0-401c-b4f6-a20040215134 | admin |

Para la copia privada de ejecución, las referencias de responsable y evidencia pueden señalar este registro y la declaración del responsable QA, identificándolas como autoasignación sintética. La fecha debe corresponder al registro efectivo de esa revisión, nunca a un login supuesto. No se requiere una firma ficticia del encargado de TI. Operador y aprobación de escritura se registrarán contra la autorización real posterior.

El manifiesto original mantiene `approval_state=pending`, campos pendientes y hash final nulo. No se cambiaron UUID estables ni se produjo un envelope ejecutable aprobado.
## Transacción y operaciones que requieren autorización

Destino exclusivo: `rnxgrunnrdlgjsbsrjev`.

1. **DDL nuevo:** promover por copia la migración local `20261104170000_institutional_activation.sql` al flujo normal de migraciones; repetir historial, huellas y dry-run, verificando que solo ella esté pendiente. Aplicar únicamente esa sexta migración y comprobar columnas, CHECK y trigger. No modificar las cinco anteriores ni reparar historial. SHA-256: `ec70da504805021d7332865048ad3674a90244edef512a9111ddc190124df284`.
2. **Lote DML v2:** completar y revisar la copia privada del manifiesto con la asignación declarada, referencias reales de aprobación/operador y hash canónico PostgreSQL. Autorizar exactamente una organización QA, dos perfiles, dos membresías, dos solicitudes institucionales de activación y su auditoría automática/marcador. Roles: u-000001 student; u-000002 admin. No modifica filas Auth ni las tres identidades anteriores.
3. Ejecutar el adaptador original en una única conexión y transacción **SERIALIZABLE**, con envelope y guardas de proyecto/operación/hash establecidos de forma local a la transacción, `postgres`, sin claims de usuario y sin desactivar RLS/triggers. El proyecto debe comprobarse también por el canal de conexión: las variables de contexto son guardas de consistencia, no una prueba independiente del destino. Cualquier error exige ROLLBACK; no continuar con reparaciones automáticas. El guion fuerza las restricciones diferibles antes del marcador y COMMIT.
4. Ejecutar después `postcheck.sql` en otra transacción **READ ONLY**, con el mismo envelope, UTC y DateStyle ISO. Todos los indicadores deben ser verdaderos salvo `is_authentication_test=false`. Revisar historial y ausencia de enlaces de identidades antiguas. Si falla, detener las pruebas de acceso e investigar; no repetir escrituras a ciegas.

No se generó ni ejecutó un batch Cloud aprobado. El ensayo local confirma el mecanismo transaccional parametrizado; la ejecución real debe usar un canal administrativo privado revisado, separado de Next.js. Antes de escribir se actualizará el snapshot: este preflight no garantiza que el estado permanezca sin cambios.

## Prueba inmediata posterior, bajo alcance autorizado

- Autorizar por separado el uso local de Auth y el enrollment/verificación real del administrador. Actualmente no se leyó ni cambió `.env.local`. Mantener recuperación/invitaciones desactivadas y origen local coincidente; reiniciar Next.js después de habilitar el flag local.
- Alumno: `/login` → `/seleccionar-organizacion` → `/o/qa-sistema-alumnos-01/dashboard`. Debe ver solo su organización y no acceder a `/o/qa-sistema-alumnos-01/admin` ni a la configuración administrativa MFA.
- Admin: iniciar sesión con u-000002 en aal1, abrir `/auth/mfa` y configurar su propio TOTP; confirmar previamente que el proveedor permite enrollment/verify TOTP. QR/códigos solo para el titular. El Panel y RPC administrativas deben seguir denegados antes de aal2. Tras verificar TOTP real, abrir `/o/qa-sistema-alumnos-01/admin`; el nivel lo determina el proveedor, no un booleano de interfaz.
- Probar logout y una sesión sin autenticación. No ejecutar CRUD/RPC mutantes como parte de una comprobación de acceso. No publicar QR, códigos, cookies ni JWT en evidencia.

El Send Email Hook no es dependencia técnica del DDL/DML ni del login por contraseña/TOTP. Sigue sin activarse: los flags de Next.js no prueban un bloqueo global del correo en el proveedor. El alcance mínimo propuesto es una demo cerrada con dos cuentas sintéticas .invalid, sin probar flujos de correo y sin uso productivo; cualquier exigencia de bloqueo global deberá resolverse antes de ampliar ese alcance. Recuperación administrativa y contenido académico se mantienen fuera de este paso.

**Siguiente decisión:** autorización explícita de la sexta migración y del lote v2 descrito; adicionalmente, del ensayo local real de Auth/TOTP si se desea realizarlo inmediatamente después. No queda una aprobación externa obligatoria inventada ni un impedimento conocido de compatibilidad PG17. La validación real de acceso y MFA permanece pendiente.