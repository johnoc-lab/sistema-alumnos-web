# Fase 5B — Paso 2: aprovisionamiento inicial de QA

Fecha: 3 de noviembre de 2026, America/Lima.
Proyecto: SistemaAlumnos-Web. Rama revisada: feature/supabase-auth.
Destino previsto, sujeto a autorización de aprovisionamiento: **sistema-alumnos-dev**, organización Supabase **johnoc-lab**, Project Ref **rnxgrunnrdlgjsbsrjev**.
Presupuesto: **S/ 0**. Tamaño previsto: 10–15 alumnos inicialmente, máximo aproximado de 50.

**Resultado de este paso:** procedimiento diseñado y contrastado estáticamente con las cinco migraciones aplicadas. No se crearon cuentas, perfiles, membresías u organizaciones; no se ejecutaron SQL, pruebas de base, seed, migraciones ni operaciones remotas. El único archivo nuevo es este documento.

El login real de la cuenta existente y el mensaje de ausencia de organizaciones se consideran confirmados por el usuario. No se deduce de ello un rol administrativo. La ausencia actual de perfiles y membresías se toma del contexto proporcionado; no se consultó Cloud para actualizar sus conteos.

## 1. Decisión de implementación y alcance

Para este primer lote se propone **un guion SQL transaccional de operador y un manifiesto de aprobación**, utilizando las tablas existentes. El guion deberá prepararse y revisarse con los UUID adjudicados antes de autorizar su ejecución. No se introduce ahora una RPC de alta, un panel de aprovisionamiento ni un servicio adicional.

El lote propuesto comprende:

| Elemento | Cantidad y decisión |
| --- | --- |
| Organización académica QA | Una. Propuesta de nombre: QA Sistema Alumnos; slug: qa-sistema-alumnos-01; zona: America/Lima. Debe confirmarse que no existe ni está reservado. |
| Identidades Auth | Dos UUID distintos: uno para la persona aprobada como Admin y otro para la aprobada como alumno. Son cuentas de prueba bajo control legítimo. |
| Perfiles | Dos perfiles independientes, uno por identidad. |
| Membresías | Dos en la misma organización: una admin y otra student, aprobadas explícitamente. |
| Solicitudes de activación | Dos filas privadas con claves idempotentes distintas y evidencia de verificación. |
| Registro de la operación | Un evento explícito de auditoría, además de los eventos que generan automáticamente los triggers. |
| Cursos, matrículas, archivos y otras organizaciones | Fuera de este lote. No se usan fixtures de demo ni seed. |

**La cuenta Auth existente permanece sin rol hasta aprobar el manifiesto.** Para limitar nuevas altas, puede proponerse su uso como alumno, pero requiere autorización expresa. Si se desea usarla como Admin, debe aprobarse específicamente su UUID y ese rol; el éxito del login no autoriza esa decisión.

Si solo existe una cuenta, falta una segunda identidad para separar las pruebas de Admin y alumno. Su alta administrativa se autoriza por separado, sin invitación por correo, contraseñas compartidas ni cambios de contraseña de la cuenta existente. Si ya hay otra cuenta legítima, se verifica y reutiliza solo con aprobación. No se exige incorporar alumnos al equipo de infraestructura de Supabase.

El modelo distingue cuatro niveles:

**Auth UUID → perfil → membresía de organización → matrícula de curso.**

Crear la membresía permite resolver la organización y sus rutas protegidas. No concede por sí solo acceso a cursos: eso requiere una matrícula y las condiciones de publicación de cada recurso.

## 2. Contrato del esquema aplicado

Se revisaron MODELO_BASE_DATOS.md, FASE_4C_MIGRACIONES_CLOUD.md, FASE_5B_PLAN_GRATUITO.md y las cinco migraciones completas. El modelo del 30 de octubre es una especificación histórica; para columnas, permisos y triggers prevalece el SQL aplicado.

### 2.1. public.organizations

| Columna | Regla efectiva y uso en el procedimiento |
| --- | --- |
| id | UUID PK; default gen_random_uuid(). Se reservará un UUID estable en el manifiesto para reconocer reintentos. |
| slug | text NOT NULL UNIQUE; patrón ^[a-z0-9]+(-[a-z0-9]+)*$. Sin espacios, mayúsculas o permisos implícitos. |
| name | text NOT NULL; longitud de btrim entre 1 y 500. Nombre claramente QA. |
| status | NOT NULL; suspended por defecto; admite active, suspended, archived. Se crea suspended y se activa al final del lote aprobado. |
| timezone | text NOT NULL, default America/Lima. validate_relations exige una zona presente en pg_timezone_names. |
| created_at, updated_at | timestamptz NOT NULL; los genera/controla la base. |
| row_version | bigint NOT NULL positivo; default 1, incremento por trigger. No asignar manualmente en UPDATE. |

No requiere una membresía creadora. La restricción de administrador vigente se aplica al estado active y es diferida hasta el cierre de transacción, salvo que se fuerce antes su comprobación.

### 2.2. public.profiles

| Columna | Regla efectiva y uso |
| --- | --- |
| id | UUID PK con default. UUID interno estable, sin depender del correo ni exigir que sea igual al UUID Auth. |
| auth_user_id | UUID nullable UNIQUE; FK a auth.users(id), ON DELETE SET NULL. Se vincula solo después de adjudicar y verificar esa identidad. |
| display_name | text nullable. Puede usarse una etiqueta sintética QA; no concede permisos. |
| status | NOT NULL; pending por defecto; admite pending, active, blocked, archived. |
| created_at, updated_at, row_version | Campos de sistema con las mismas protecciones del trigger stamp_row. |

Un perfil pending sin vínculo Auth es válido durante la preparación. Para el resultado final de este lote ambos perfiles deberán estar active y vinculados a los UUID aprobados. La FK acredita existencia de la identidad, **no** confirma buzón, estado de cuenta o MFA: esas verificaciones son adicionales.

### 2.3. public.organization_memberships

| Columna | Regla efectiva y uso |
| --- | --- |
| id | UUID PK con default; identificador estable del manifiesto. |
| organization_id | UUID NOT NULL, FK a organizations(id), ON DELETE RESTRICT. stamp_row impide transferirlo a otra organización mediante UPDATE. |
| profile_id | UUID NOT NULL, FK a profiles(id), ON DELETE RESTRICT. El procedimiento no lo reasigna a otra persona. |
| role | NOT NULL; admin o student. Aunque el default SQL es student, el guion exigirá un valor explícito aprobado para cada fila. |
| status | NOT NULL; invited por defecto; admite invited, active, suspended, archived. Se inicia invited y termina active. Ese estado inicial no envía invitaciones. |
| first_name | text NOT NULL, default vacío. Al activar debe cumplirse btrim(first_name) <> ''. Usar etiquetas QA no vacías aprobadas. |
| last_name | text NOT NULL, default vacío. Puede conservarse vacío para esta prueba. |
| contact_email | text nullable, contacto de negocio; puede omitirse. No es prueba de identidad. |
| contact_email_normalized | Columna generada: lower(btrim(contact_email)). No escribirla ni usarla para fusionar identidades. |
| joined_at | timestamptz nullable. Se propone registrar el instante real de activación del piloto. |
| created_at, updated_at, row_version | Generados/controlados por stamp_row. |
| created_by_membership_id, updated_by_membership_id | UUID nullable; FKs de la misma organización. El trigger los calcula desde auth.uid(); un operador sin sesión de persona deja el actor nulo. No falsear un Admin para rellenarlos. |

Restricciones UNIQUE relevantes: (organization_id,id), **(organization_id,profile_id)** y (organization_id,profile_id,id). Una persona no puede tener dos membresías de distinto rol en la misma organización. Por eso el Admin y el alumno de esta prueba necesitan perfiles e identidades diferentes.

### 2.4. private.identity_activation_requests

| Columna | Regla efectiva y uso |
| --- | --- |
| id | UUID PK con default; estable por operación/persona. |
| organization_id, profile_id, membership_id | NOT NULL. FK de profile_id a profiles y FK compuesta (organization_id,profile_id,membership_id) a la misma membresía. |
| proposed_verified_contact | text NOT NULL. Registrar el contacto legítimamente comprobado de la identidad aprobada, no un correo ficticio para sortear confirmación. El SQL no valida por sí mismo su titularidad o formato. |
| status | NOT NULL; requested por defecto. Valores: requested, invited, verified, linked, cancelled, failed. |
| auth_user_id | UUID nullable; FK a auth.users(id), ON DELETE SET NULL. |
| idempotency_key | UUID NOT NULL UNIQUE. Una clave distinta y estable por Admin/alumno. No es un token ni una credencial. |
| created_at | timestamptz NOT NULL con default now(). |
| verified_at, linked_at | timestamptz nullable. linked exige ambos no nulos y auth_user_id no nulo. Registrar comprobaciones reales, no fechas inventadas. |

El trigger **activation_profile_match** comprueba inmediatamente, al escribir linked, que el perfil esté active y tenga exactamente el mismo auth_user_id. Por tanto, se debe vincular/activar el perfil **antes** de marcar la solicitud linked.

La tabla no aprueba el rol, no verifica emails ante Auth y no implementa por sí sola una máquina de estados o una inmutabilidad completa de la solicitud. El guion deberá comparar sus campos y rechazar toda reutilización contradictoria de una clave.

### 2.5. Triggers y validaciones que determinan el orden

| Mecanismo | Consecuencia práctica |
| --- | --- |
| stamp_row | Protege id, created_at, row_version y organization_id en UPDATE; incrementa la versión y estampa actores/fechas. Omitir esos campos en el SET. |
| validate_relations | Valida la zona horaria y otras relaciones. No convierte un contacto o rol enviado por un operador en identidad verificada. |
| memberships_lock_org / lock_organization | Bloquea la organización al modificar membresías; serializa los cambios relevantes de sus administradores. |
| profiles_lock_org / lock_profile_organizations | Bloquea las organizaciones de un perfil administrador antes de actualizarlo/eliminarlo. |
| organization_admin_required, membership_admin_required, profile_admin_required | Constraint triggers DEFERRABLE INITIALLY DEFERRED que verifican el administrador vigente. No se deben desactivar ni forzar como IMMEDIATE antes de completar el estado coherente. |
| activation_profile_match | Trigger BEFORE inmediato: perfil activo y vínculo Auth coincidente al pasar a linked. |
| audit_row | Registra los cambios de tablas públicas y solicitudes privadas sin copiar sus contactos completos. |
| audit_immutable | Impide UPDATE/DELETE de audit_events. No corregir su contenido después de insertar. |

La condición exacta de private.assert_organization_admin es: si organizations.status = active, debe existir una membresía admin/active cuyo perfil sea active y tenga auth_user_id no nulo. **No comprueba aal2 ni factores TOTP.** El requisito MFA está en private.org_admin y en el guard de Next.js.

Las FKs, UNIQUE, CHECK y el trigger de activación indicados no se aplazan por el hecho de que el constraint de último Admin sea diferido. La comprobación final puede anticiparse con SET CONSTRAINTS ALL IMMEDIATE, una vez completadas las relaciones; no sustituye las validaciones inmediatas. [Momento de comprobación en PostgreSQL 17](https://www.postgresql.org/docs/17/sql-set-constraints.html).

## 3. Canal de operador y manifiesto aprobado

### 3.1. Dos contextos diferentes

El aprovisionamiento inicial requiere una sesión administrativa ya autorizada, por ejemplo el rol de administración existente en SQL Editor. Se comprobarán sus privilegios antes de operar. Las tablas mantienen RLS habilitada y todos sus triggers; no se concede BYPASSRLS, no se cambia el propietario y no se añaden roles o grants.

Un propietario de tabla normalmente no queda sometido a sus políticas RLS. Esa capacidad administrativa existente permite el bootstrap, **no** demuestra que un alumno o Admin de aplicación tenga acceso. Las pruebas funcionales se harán después con sesiones ordinarias. [Contexto del propietario y RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).

Con authenticated, incluso un Admin con aal2, las migraciones no conceden INSERT en organizations/profiles/memberships ni UPDATE/DELETE directo. Las 13 RPC no ofrecen una operación de aprovisionamiento de esas entidades; set_student_status cambia una membresía student existente, no crea personas o administradores. No se abrirán grants para hacer pasar el primer alta.

El operador SQL deberá verificar que auth.uid() sea nulo y que no esté reutilizando claims de una persona. No simulará un JWT de Admin para estampar auditoría. Si el rol disponible no tiene las capacidades necesarias, se detiene la operación; no se fuerza con permisos nuevos.

### 3.2. Manifiesto mínimo, fuera del código y sin secretos

| Dato | Contenido que deberá aprobarse antes de ejecutar |
| --- | --- |
| approval_ref, operator_ref, revisor y fecha | Referencia de autorización y responsables verificables. |
| project_ref | rnxgrunnrdlgjsbsrjev, comparado con proyecto/organización y conexión real. |
| operation_id | UUID estable del lote; se usará también como PK del evento de operación en audit_events. |
| organization_id, slug, name, timezone | Valores QA exactos; estado final active si se aprueba la secuencia completa. |
| Admin | auth_user_id, profile_id, membership_id, activation_request_id, idempotency_key y role=admin explícito. |
| Alumno | Los mismos identificadores, con role=student explícito y UUID Auth distinto. |
| Etiquetas y contacto verificado | first_name no vacío, last_name, display_name; contacto comprobado para la solicitud privada y referencia de esa comprobación. |
| Fechas y alcance | Evidencia de verificación, plazo de uso y responsable de revisión posterior. Sin borrado automático. |
| manifest_sha256 | Huella de la representación canónica aprobada, sin secretos ni fechas generadas por el guion. |

Los UUID se generan una sola vez al preparar el lote concreto y se conservan para reintentos. No reutilizar IDs del seed, derivarlos de email o volver a generarlos al repetir. Los UUID de recurso no son contraseñas, pero su adjudicación y los contactos deben permanecer en un registro de operador con acceso controlado, fuera de Git. Este documento no contiene valores personales adjudicados.

No almacenar contraseñas, tokens, cookies, claves administrativas, QR o semillas TOTP en el manifiesto. Una modificación del contenido aprobado exige revisión; no conservar el mismo operation_id para otra persona, rol o organización.

## 4. Procedimiento de vinculación y orden transaccional

### 4.1. Verificación previa de identidades

El operador comprobará cada identidad por **UUID exacto** en Auth Admin/Dashboard y cotejará a la persona y su autorización. Se verificará que la cuenta existe, no es anónima, tiene email legítimamente confirmado y está habilitada para el ensayo. La consulta por UUID no concede un rol. Si se usa getUserById, se ejecuta solo desde una herramienta privada del operador y se extraen únicamente los datos necesarios, sin imprimir el objeto completo. [Referencia oficial](https://supabase.com/docs/reference/javascript/auth-admin-getuserbyid).

Se comprobará que los dos UUID sean diferentes, que no estén ya asociados a otros perfiles y que las personas controlen sus cuentas. Una coincidencia de email, dominio, nombre o metadata no sustituye esa adjudicación.

Si falta una identidad, su creación controlada se autoriza antes y separadamente, según el plan gratuito. No se modifica auth.users por SQL ni se necesita service_role en Next.js. Tampoco se cambia la contraseña de una identidad existente para facilitar el ensayo.

### 4.2. Una sola transacción para el lote de aplicación

La siguiente secuencia es un diseño operativo, **no un script ejecutable ni SQL ejecutado en este paso**:

| Orden | Operación futura y condición |
| --- | --- |
| 1 | Abrir una transacción SERIALIZABLE en el proyecto comprobado. Un solo operador por lote. Establecer límites de espera/ejecución adecuados y comprobar rol/contexto. |
| 2 | Buscar el evento operation_id, las dos claves idempotentes, los UUID previstos, el slug y cualquier perfil con esos auth_user_id. Aplicar las reglas de reintento de la sección 5 antes de escribir. Bloquear filas existentes pertinentes en orden estable. |
| 3 | En el caso inicial sin colisiones, insertar la organización con su UUID y status=suspended. |
| 4 | Insertar los dos perfiles con UUID propios, status=pending y auth_user_id nulo. |
| 5 | Insertar las dos membresías con role explícito, status=invited, nombres QA no vacíos y FKs a esa organización/perfil. Omitir actores y columnas generadas. |
| 6 | Insertar las dos solicitudes de activación con status=verified, auth_user_id, contacto comprobado, verified_at real y claves idempotentes aprobadas. Se usa verified porque la comprobación previa ya se realizó; el esquema no exige pasar por invited ni enviar correo. |
| 7 | Actualizar cada perfil para enlazar su UUID Auth y ponerlo active. Verificar la versión esperada y exigir exactamente una fila afectada por perfil. |
| 8 | Activar ambas membresías, registrando joined_at. Verificar versión e identidad de cada fila; no cambiar rol, organization_id o profile_id durante esta actualización. |
| 9 | Pasar las solicitudes de verified a linked y registrar linked_at. Exigir coincidencia de todos los UUID y la clave idempotente. En este momento los perfiles ya cumplen activation_profile_match. |
| 10 | Activar la organización, con comparación de row_version y exactamente una fila afectada. Ya existe el Admin con perfil activo y Auth vinculado. |
| 11 | Comprobar el contrato final y ejecutar SET CONSTRAINTS ALL IMMEDIATE para validar los constraints diferidos antes de confirmar. Si falla cualquier validación, abortar. |
| 12 | Insertar el evento explícito de operación de la sección 5, comprobar su coherencia y confirmar una sola vez. Conservar los UUID y versiones finales en la bitácora privada. |

Antes del COMMIT, el estado esperado es: una organización active, dos perfiles active con Auth distintos, dos membresías active de roles aprobados y dos solicitudes linked. **El Admin puede estar todavía en aal1; su acceso administrativo seguirá denegado.** La activación estructural de la organización no requiere rebajar el MFA del panel.

Las filas con row_version utilizan WHERE por ID y versión leída y RETURNING para comprobar una única actualización; el trigger incrementa la versión. La solicitud privada no tiene row_version: se compara su estado previo verified y su contrato completo bajo bloqueo. No incrementar versiones o manipular timestamps del sistema manualmente.

Se validan verified_at y linked_at contra la evidencia real y su orden temporal. No se intenta rellenar created_by_membership_id con la membresía que todavía está creándose: el operador sin auth.uid() deja esos actores nulos.

Con este orden quedan satisfechas las FKs inmediatas, los nombres no vacíos y el trigger linked; al comprobar los constraints diferidos ya hay un Admin coherente. No se necesita ningún ALTER TABLE, desactivación de triggers/RLS o nueva migración.

## 5. Idempotencia, auditoría y fallos

### 5.1. Reglas de repetición

El guion deberá implementar estas condiciones; son especificaciones pendientes de codificación y ensayo, no garantías aportadas por este documento:

| Estado encontrado | Decisión |
| --- | --- |
| No existen el evento del lote ni sus siete filas de datos, ni colisiones de slug/identidades/claves | Ejecutar el alta inicial. |
| Existe el evento con id=operation_id, huella/autoridad coincidentes y las siete filas conservan sus vínculos, roles y estados aprobados | Devolver ya aplicado sin INSERT/UPDATE. Conservar fechas, versiones y número de eventos. |
| Existe el evento, pero cambió el manifiesto o los datos fueron suspendidos, reasignados o modificados después | Detenerse para revisión. No reactivar ni sobrescribir esos cambios al repetir un alta anterior. |
| Hay filas parciales, claves en otro vínculo, slug de otra organización o un perfil asociado previamente sin el evento de este lote | Detenerse y revisar la procedencia. No adoptar esas filas ni reparar un estado parcial automáticamente. |

Los siete registros son: organización + dos perfiles + dos membresías + dos solicitudes. La transacción incluye también el evento explícito y los eventos automáticos de triggers.

No se utilizará ON CONFLICT DO UPDATE para cambiar roles, UUID Auth o propietarios, ni un DO NOTHING que oculte diferencias. Las constraints UNIQUE son el respaldo final. Un SELECT FOR UPDATE no bloquea una fila inexistente: SERIALIZABLE, las claves únicas y la detención ante conflictos son necesarios para no tratar la ausencia como un candado.

Ante conflicto de unicidad, serialización o deadlock, se revierte la transacción completa. Se relee el estado y se revisa el mismo manifiesto antes de un nuevo intento; no se crea otro UUID para evitar el conflicto. No se automatizan reintentos indefinidos.

### 5.2. Evidencia durable de la operación

Se propone un evento explícito en public.audit_events:

| Campo | Valor previsto |
| --- | --- |
| id, request_id | operation_id, estable. La PK id evita duplicar el marcador; request_id por sí solo no es UNIQUE. |
| organization_id | UUID de la organización QA recién validada. |
| actor_profile_id | NULL si se opera sin una identidad de aplicación. |
| actor_kind | operator. No fingir ser el nuevo administrador. |
| action | INSERT, dentro de los valores admitidos. |
| entity_type, entity_id | qa.provisioning y organization_id, respectivamente. |
| changes | JSON mínimo: approval_ref, operator_ref, manifest_sha256 y UUID de perfiles/membresías/solicitudes. Sin contactos, nombres personales, credenciales o material MFA. |
| occurred_at | Default de la base. |
| import_run_id | NULL: no se está importando una fuente histórica. |

Se insertará en la **misma transacción** que el lote, una vez comprobado el estado final. La existencia del marcador identifica una operación confirmada, y su contenido se coteja siempre con las filas reales.

audit_row ya genera eventos por los INSERT/UPDATE de organización, perfiles, membresías y solicitudes. Hay límites importantes:

- Los eventos automáticos de organizations y profiles tienen organization_id nulo porque sus filas no tienen esa columna. No buscarlos solo por organización; correlacionar por entity_type/entity_id.
- Sin auth.uid(), los eventos de tablas públicas se etiquetan operator y los de tablas private se etiquetan importer por la implementación actual. Esa etiqueta no identifica a la persona que operó.
- El trigger no rellena automáticamente request_id ni la referencia humana de aprobación.
- audit_immutable impide completar posteriormente esos eventos mediante UPDATE/DELETE. El evento de operación y la bitácora externa cubren la correlación sin alterar los ya generados.

El registro externo aprobado conserva responsables, UUID, huella y comprobaciones posteriores. La auditoría depende de la custodia del operador de base: no se presenta como evidencia inalterable frente al propio dueño del esquema.

### 5.3. Recuperación de errores

Auth y PostgreSQL no forman una transacción distribuida. Si se autoriza crear una segunda cuenta y luego falla el lote SQL, la cuenta puede quedar sin perfil/membresía; ese estado mantiene cerrado el acceso académico. Se registra su UUID y no se crea otra cuenta en el reintento.

Antes de COMMIT, un error revierte todas las filas y eventos del lote. Si se pierde la respuesta del cliente al confirmar, **consultar primero el evento operation_id y sus datos**: no asumir que hubo rollback ni repetir con IDs nuevos.

Si falla una comprobación funcional después de confirmar, no borrar perfiles, solicitudes o auditoría para volver a empezar. Detener el ensayo, registrar el estado y pedir una actuación acotada. Una eventual suspensión de la organización para contener acceso requiere autorización explícita. No suspender/eliminar al único Admin mientras la organización siga active ni borrar su identidad Auth como método de limpieza.

## 6. Requisitos MFA TOTP

**Estado actual:** existen el guard administrativo y private.org_admin con exigencia aal2. No hay rutas operativas de enrollment/challenge MFA en src/app. Aprovisionar la membresía admin no resuelve esa interfaz ni permite entrar al panel sin MFA.

La implementación futura debe permitir que un candidato legítimo configure su factor desde aal1 si tiene usuario/claims verificados, perfil activo y membresía admin activa en la organización activa. Esa página de seguridad no debe exigir private.org_admin como condición de entrada porque ya requiere aal2 y produciría un bloqueo circular. La excepción se limita a configurar el propio factor; no abre el panel ni sus RPC.

Secuencia prevista: listar factores propios; enroll TOTP si falta; mostrar QR/semilla exclusivamente al titular; crear challenge y verificar su código; persistir la sesión/cookies; volver a comprobar getUser/getClaims y el nivel aal2 emitido por Auth antes de permitir administración. No escribir aal en metadata ni aceptarlo desde un formulario. [Guía oficial TOTP](https://supabase.com/docs/guides/auth/auth-mfa/totp).

Los POST tendrán Origin estricto, factores y challenges vinculados al usuario y respuestas no-store. No se compartirán dispositivos/factores, no se exportarán QR/semillas a servicios externos y no se anotarán en la bitácora. TOTP utiliza un autenticador existente del titular y no depende de SMTP/SMS de pago.

Mientras falte esa implementación o un factor verificado, el resultado correcto de la prueba de Admin es **denegación en aal1**. Una organización active es coherente a nivel SQL con un Admin activo/vinculado que aún no ha completado MFA; las operaciones administrativas siguen cerradas.

## 7. Pruebas necesarias con sesiones normales y RLS

### 7.1. Protocolo y alcance de evidencia

Las pruebas siguientes **no se ejecutaron** en este paso. Se proponen sesiones separadas de alumno/Admin, con el cliente publishable y sus JWT ordinarios gestionados en memoria por el SDK. No usar postgres, service_role, claims inventados o cambios en auth.users para acreditar permisos de usuario.

Se utilizarán perfiles de navegador separados para no mezclar cookies. Una herramienta local de diagnóstico de solo lectura, si se necesita para consultar Data API, deberá prepararse y revisarse después; no se añadirá una ruta de debug pública ni se copiarán JWT a comandos/bitácoras.

En profiles se consultarán solo columnas concedidas, por ejemplo id,status,display_name. auth_user_id no tiene SELECT para authenticated: su vínculo se verifica como operador y por la resolución ordinaria del perfil, no ampliando el grant.

La aplicación actual muestra placeholders después de autorizar una ruta. Esa pantalla prueba el guard de identidad/membresía, **no** el acceso a cursos, matrículas, contenido o CRUD. Las consultas directas con sesión ordinaria complementan las pruebas de UI.

### 7.2. Matriz del primer lote

| Caso | Resultado esperado | Condición |
| --- | --- | --- |
| Sesión anónima o ausente | Rutas reales exigen login; sin lectura de negocio con anon. | Estado base sin cookies. |
| Cuenta existente antes del vínculo | Login y mensaje de ausencia de organizaciones; sin acceso académico. | Resultado previo confirmado por el usuario; no lo ejecutó independientemente Codex. |
| Alumno vinculado | Selector muestra solo QA; su Dashboard permite el placeholder protegido. Data API muestra su perfil, organización y membresía. | Perfil, membresía y organización active. No necesita aal2 para este rol. |
| Alumno pide Admin QA | Denegación en UI y operaciones administrativas. | No basta conocer slug o UUID. |
| Alumno consulta la membresía/perfil del Admin conocido | SELECT devuelve cero filas con una proyección permitida; no enumera su información. | Dos personas reales y filas conocidas en la misma QA, no una tabla vacía. |
| Admin en aal1 | Ve la organización y su membresía propia; Panel Admin y capacidades administrativas denegados. No enumera al alumno por la regla de Admin sin aal2. | La lectura propia de diagnóstico no equivale a acceso administrativo. |
| Admin en aal2 | Panel permite el placeholder; Data API permite las dos membresías de QA y auditoría autorizada de ese tenant. | Pendiente de implementar MFA y verificar una sesión real; su perfil global sigue siendo solo el propio. |
| Cualquiera pide una organización no asignada | Sin acceso a esa ruta; no se concede una membresía por URL. | Cambiar el slug no prueba aislamiento positivo entre dos organizaciones existentes. |
| Identidad suspendida, perfil blocked o organización suspended | Nuevo acceso de negocio denegado; pueden persistir lecturas mínimas propias de diagnóstico según la política. | Esos cambios de estado son escrituras y requieren autorización posterior. No suspender al último Admin de una organización active. |
| Logout, expiración y renovación | Sin acceso tras el cierre/expiración según el comportamiento del proveedor y la nueva verificación. | No prometer revocación instantánea de todo JWT emitido. |
| Demo con y sin sesión | Continúa independiente y sin consultas/renovación Auth. | No importar sus fixtures al guard real. |

Con una sola QA y dos personas se prueba separación de identidades y rol dentro de ella. **No se declara probado el aislamiento completo entre tenants con filas reales**: requiere una segunda organización y sus datos autorizados en una etapa posterior. Tampoco puede acreditarse acceso a cursos con cero cursos/matrículas.

### 7.3. Pruebas adicionales antes de ampliar el piloto

- Repetición del mismo lote: cero filas/actualizaciones/eventos nuevos, mismas fechas/versiones.
- Clave idempotente con otro UUID/rol/contacto, Auth ya vinculado o slug ocupado: detención sin reasignación.
- Activar la organización sin Admin coherente, activar membresía con nombre vacío o marcar linked antes de vincular el perfil: rechazo por la regla correspondiente.
- Intentar crear/editar organizaciones, perfiles, membresías o vínculos Auth desde la sesión de alumno y Admin: rechazo por grants; las RPC de alumno tampoco admiten cambios de rol.
- Factor/challenge ajeno, código inválido o vencido y sesión que sigue aal1: sin elevación.
- Suspensión y cambios concurrentes del último Admin: validación bajo bloqueos, sin eludir triggers.
- Una segunda QA con filas conocidas: alumno/Admin de A no acceden a B; roles aprobados por separado.

Los ensayos de constraints, reintentos y concurrencia deben prepararse sobre una base desechable expresamente autorizada, con datos mínimos por caso y **sin seed**. No se ejecutarán los harness históricos que lo cargan.

Las pruebas negativas de INSERT/UPDATE/RPC son intentos de mutación: aunque se espere un rechazo, un defecto podría producir una escritura. Deben contar con autorización para casos sintéticos acotados y un procedimiento de revisión si el resultado es inesperado. No se etiquetan como consultas remotas de solo lectura ni se añaden implícitamente a una autorización de aprovisionamiento.

## 8. Riesgos y controles

| Riesgo | Control previsto |
| --- | --- |
| Convertir la cuenta existente en Admin por conveniencia | Rol/UUID explícitos en la aprobación; sin default de operador ni promoción por login, correo o metadata. |
| Vincular la cuenta de otra persona | Verificación por UUID y control legítimo de identidad/buzón; nunca fusionar por email. |
| Estado intermedio visible | Una transacción SQL para las siete filas y el evento; organización suspended hasta completar sus vínculos. |
| Creer que todo se valida al COMMIT | Respetar FKs/CHECK y activation_profile_match inmediatos; constraints diferidos se comprueban al final. |
| Confundir alta con prueba RLS | Operador solo para aprovisionar; cliente normal para lecturas y permisos funcionales. |
| Repetir operación y reactivar cuentas suspendidas | Marcador de operación, contrato exacto y detención ante cambios posteriores; sin upsert correctivo. |
| Auditoría sin responsable humano | Evento explícito y manifiesto con approval_ref/operator_ref; no confiar solo en actor_kind. |
| Primera organización sin Admin operativo | Admin activo/vinculado antes de activar; panel cerrado hasta aal2; procedimiento de custodia/recuperación de su factor pendiente. |
| Usar identidad de alumno también para probar Admin | Dos UUID Auth/perfiles distintos; unicidad de membresía por persona/organización. |
| Gasto o carga de mantenimiento innecesaria | Un lote pequeño, una transacción de operador, SDK y autenticador existentes; sin SMTP, SMS, servidores, planes o servicios nuevos. |

Para un máximo previsto de 50 alumnos no se justifica construir ahora un motor de aprovisionamiento. El guion revisado, las restricciones existentes y la bitácora permiten a otro encargado seguir la misma secuencia sin conocer la conversación. No se promete que los límites gratuitos o las condiciones de hosting sean ilimitados.

## 9. Pasos para la primera ejecución autorizada

**Ahora solo se prepara el procedimiento.** Los pasos que escriben datos se ejecutarán después de aprobar el lote concreto.

1. **Aprobar alcance y adjudicación.** Confirmar nombre/slug de QA, dos personas, los roles exactos y si se reutiliza la cuenta actual como alumno o Admin. Autorizar, si hace falta, únicamente la segunda cuenta Auth. Ninguna asignación se presume por este documento.
2. **Completar el manifiesto privado.** Generar una sola vez sus UUID de recurso/operación/claves idempotentes y registrar responsables, contactos comprobados, plazo y huella. Verificar la autorización de cada identidad y extraer sus UUID sin publicar información sensible.
3. **Revalidar el destino en lectura.** Comprobar CLI instalada y su ayuda, nombre/organización, referencia vinculada e historial de exactamente cinco versiones aplicadas, sin pendientes inesperadas. Comparar sus SHA-256 con Fase 4C. Cotejar la conexión de SQL Editor con el mismo proyecto; la etiqueta production de la CLI no sustituye el Ref. No usar db push/reset/repair.
4. **Inspeccionar colisiones y capacidades.** Consultar por los UUID, slug y claves concretas; roles, grants, RLS y triggers activos; identidades Auth confirmadas y ausencia de vínculos previos. Verificar que private no esté expuesto y que el operador tenga acceso legítimo sin nuevos grants.
5. **Preparar y revisar el guion de operador.** Materializar las secciones 4 y 5 con parámetros/validaciones, sin secretos. Revisar exactamente qué tablas y filas puede modificar. Ensayarlo, incluidos reintentos y fallos, en un entorno desechable autorizado sin seed. Este documento no constituye un ensayo SQL.
6. **Obtener autorización de escritura final sobre ese resultado concreto.** Aprobar un lote de una organización, dos perfiles, dos membresías, dos solicitudes y un marcador de operación, más auditoría automática. Adjuntar el manifiesto/huella y guion revisado. El rol Admin de aplicación no ejecuta ese bootstrap.
7. **Ejecutar una sola transacción de aplicación.** Seguir el orden de la sección 4. Si falla cualquier condición, rollback y revisión; sin repair/reset, cambios de permisos o eliminación automática.
8. **Verificar después en lectura.** Comprobar UUID, estados, roles, vínculos y solicitudes linked; evento operation_id, auditoría automática y versiones. Confirmar RLS/triggers sin cambios y ausencia de altas de cursos, matrículas o buckets. Registrar solo resultados mínimos. Comprobar el no-op de repetición solo dentro del alcance autorizado.
9. **Realizar las pruebas con titulares y sesiones normales.** Alumno: selector/Dashboard y denegaciones. Admin aal1: denegación administrativa. El MFA y la prueba positiva aal2 tienen su propia autorización y deben esperar a la interfaz preparada.
10. **Cerrar el ensayo.** Registrar resultados reales y pendientes sin credenciales. Conservar el plazo/revisión de QA y cualquier autorización de contingencia. No modificar flags privados, cuentas o estados para terminar el ensayo sin una instrucción específica.

### Autorizaciones que faltan

| Autorización | Contenido concreto |
| --- | --- |
| Identidades y roles | Qué UUID será Admin, cuál alumno y qué relación se adjudica a la cuenta actual. |
| Segunda cuenta, si falta | Alta administrativa sin correo, titular/control de buzón, responsable y plazo. |
| Ensayo y guion | Entorno desechable sin seed y revisión del DML idempotente antes de Cloud. |
| Lote SQL Cloud | Manifiesto exacto, organización QA, dos perfiles/membresías/solicitudes y auditoría. |
| MFA | Implementación local y, después, enrollment/challenge reales del titular; sin rebajar aal2. |
| Ensayos de mutaciones/otros tenants | Casos negativos de escritura, cambios de estado, concurrencia o una segunda QA, por separado. |

La compatibilidad estructural está comprobada por lectura del esquema: **el lote es viable con las restricciones actuales mediante el canal de operador**, sin modificar las cinco migraciones. La ejecución y las pruebas positivas de permisos todavía requieren los pasos anteriores.

## 10. Evidencia de esta revisión y referencias

Comprobaciones locales realizadas el 3 de noviembre:

- Rama feature/supabase-auth y cambios anteriores conservados.
- Cinco archivos de migración, con SHA-256 coincidentes con los aprobados en Fase 4C.
- Referencia local vinculada coincidente con rnxgrunnrdlgjsbsrjev; no se consultó Cloud.
- Inspección de resolución de sesión, autorización de rutas, selector y módulos protegidos: leen perfil/membresías bajo sesión de usuario; los repositorios académicos siguen deshabilitados.
- Inspección de los triggers de activación, último Admin, estampado y auditoría y de los permisos/RPC. No se ejecutó SQL para probarlos en este paso.
- Sin lectura de .env.local, ejecución de seed, creación de usuarios, modificación de datos/configuración, commit, push o deploy. Vercel, demo y Apps Script permanecen fuera del alcance de cambios.

Fuentes locales:

- [MODELO_BASE_DATOS.md](../SistemaAlumnos/MODELO_BASE_DATOS.md), especialmente identidad, membresías, activación, auditoría y RLS.
- [FASE_4C_MIGRACIONES_CLOUD.md](FASE_4C_MIGRACIONES_CLOUD.md), contrato aplicado y verificaciones remotas previas.
- [FASE_5B_PLAN_GRATUITO.md](FASE_5B_PLAN_GRATUITO.md), alta controlada, enlace por UUID y estrategia MFA.
- [REPORTE_ACTIVIDADES_2026-11-02.md](REPORTE_ACTIVIDADES_2026-11-02.md), confirmación del login manual comunicada por el usuario.
- [Migración 1 — dominio](supabase/migrations/20261102090000_domain.sql).
- [Migración 2 — tablas privadas](supabase/migrations/20261102091000_private_tables.sql).
- [Migración 3 — integridad](supabase/migrations/20261102092000_integrity.sql).
- [Migración 4 — RLS](supabase/migrations/20261102093000_rls.sql).
- [Migración 5 — RPC y Storage](supabase/migrations/20261102094000_rpc_storage.sql).

Las fuentes públicas oficiales consultadas se enlazan junto a las reglas correspondientes. No se usaron sus ejemplos de claves, claims o cuentas para realizar operaciones.
